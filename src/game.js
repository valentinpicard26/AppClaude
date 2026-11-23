'use strict';
// Moteur de règles : joueurs, jetons, file d'attente, tours, points.
// Il ne connaît pas la physique : il appelle des "actions" (lancer, secouer, faire apparaître)
// et reçoit les objets tombés via onFall(). Le temps est passé explicitement (now, en ms)
// pour que les tests puissent avancer l'horloge à la main.

const SLOT_NAMES = ['gauche', 'centre', 'droite'];

class Game {
  constructor(config, { actions = {}, random = Math.random, onFx = () => {} } = {}) {
    this.config = config;
    this.actions = { launch() {}, shake() {}, spawn() {}, coinRain() {}, ...actions };
    this.random = random;
    this.onFx = onFx;
    this.reset();
  }

  // Remise à zéro complète (nouveau live / "redémarrer de zéro").
  reset() {
    this.players = new Map();
    this.queue = [];
    this.turn = null;
    this.prevTurn = null;
    this.status = 'running';
    this.pausedAt = null;
    this.turnCounter = 0;
    this.stats = { comments: 0, likes: 0, gifts: 0, diamonds: 0, follows: 0, joins: 0, donors: {} };
    this.version = 0;
  }

  setConfig(cfg) { this.config = cfg; this.touch(); }
  touch() { this.version++; }
  fx(e) { this.onFx(e); }

  // ---------- Joueurs ----------
  isBlocked(user) {
    const list = String(this.config.blockedNames || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!list.length) return false;
    return list.includes(String(user.userId).toLowerCase()) || list.includes(String(user.nickname || '').toLowerCase())
      || list.includes(String(user.uniqueId || '').toLowerCase());
  }

  // Renvoie le joueur, en le créant à sa première apparition (= arrivée dans le live).
  ensurePlayer(user, now, { isFollower = false } = {}) {
    const id = String(user.userId);
    let p = this.players.get(id);
    if (!p) {
      p = {
        id, nickname: cleanName(user.nickname || user.uniqueId || id), tokens: 0, points: 0,
        likeRemainder: 0, followed: false, missedTurns: 0, active: true, boosted: false,
        joinedAt: now, lastSeen: now, gifts: 0,
      };
      this.players.set(id, p);
      this.stats.joins++;
      const allowed = !this.config.joinTokensFollowersOnly || isFollower;
      if (allowed) this.grantTokens(p, this.config.startTokens, 'arrivée');
      this.fx({ type: 'join', player: p.nickname });
    } else {
      if (user.nickname) p.nickname = cleanName(user.nickname);
      p.lastSeen = now;
      if (!p.active) { p.active = true; p.missedTurns = 0; }
    }
    this.enqueueIfEligible(p);
    this.touch();
    return p;
  }

  grantTokens(p, n, reason) {
    const before = p.tokens;
    p.tokens = Math.min(this.config.maxTokens, p.tokens + Math.max(0, n));
    const gained = p.tokens - before;
    if (n > 0) this.fx({ type: 'tokens', player: p.nickname, gained, reason, capped: gained < n });
    this.enqueueIfEligible(p);
    this.touch();
    return gained;
  }

  enqueueIfEligible(p) {
    if (p.tokens <= 0 || !p.active) return;
    if (this.turn && this.turn.playerId === p.id) return;
    if (this.queue.includes(p.id)) return;
    this.queue.push(p.id);
  }

  // ---------- Événements du live ----------
  // ev = { type, userId, nickname, ... } ; renvoie une courte description (pour les logs / tests).
  handleEvent(ev, now) {
    if (!ev || ev.userId === undefined || ev.userId === null || ev.userId === '') return 'ignored';
    if (this.isBlocked(ev)) return 'blocked';
    switch (ev.type) {
      case 'join': {
        this.ensurePlayer(ev, now, { isFollower: !!ev.isFollower });
        return 'join';
      }
      case 'chat': {
        this.stats.comments++;
        const p = this.ensurePlayer(ev, now, { isFollower: !!ev.isFollower });
        const slot = this.parseCommand(ev.comment);
        if (slot === null) return 'chat';
        if (this.status !== 'running' || !this.turn || this.turn.phase !== 'aim' || this.turn.playerId !== p.id) {
          return 'ignored-not-your-turn';
        }
        this.launchFor(p, slot, now, false);
        return 'launch';
      }
      case 'like': {
        const count = Math.max(0, Math.floor(Number(ev.likeCount) || 0));
        this.stats.likes += count;
        const p = this.ensurePlayer(ev, now, { isFollower: !!ev.isFollower });
        p.likeRemainder += count;
        const per = this.config.likesPerRefill;
        let refills = 0;
        while (p.likeRemainder >= per) { p.likeRemainder -= per; refills++; }
        if (refills > 0) this.grantTokens(p, refills * this.config.tokensPerLikeRefill, 'likes');
        this.touch();
        return 'like';
      }
      case 'follow': {
        const p = this.ensurePlayer(ev, now, { isFollower: true });
        if (p.followed) return 'follow-already';
        p.followed = true;
        this.stats.follows++;
        this.grantTokens(p, this.config.followTokens, 'abonnement');
        return 'follow';
      }
      case 'gift': {
        const p = this.ensurePlayer(ev, now, { isFollower: !!ev.isFollower });
        const count = Math.max(1, Math.floor(Number(ev.repeatCount) || 1));
        const diamonds = Math.max(0, Number(ev.diamondCount) || 0);
        this.stats.gifts += count;
        this.stats.diamonds += diamonds * count;
        this.stats.donors[p.id] = (this.stats.donors[p.id] || 0) + diamonds * count;
        p.gifts += count;
        const rule = this.findGiftRule(ev.giftName, diamonds);
        if (!rule) return 'gift-no-rule';
        for (let i = 0; i < count; i++) this.applyGiftAction(rule, p, now, i);
        this.touch();
        return 'gift:' + rule.action;
      }
      case 'leave': {
        const p = this.players.get(String(ev.userId));
        if (p) this.deactivate(p);
        return 'leave';
      }
      default:
        return 'ignored';
    }
  }

  parseCommand(comment) {
    const word = String(comment || '').trim().toLowerCase().split(/\s+/)[0];
    if (!word) return null;
    const lists = [this.config.commandsLeft, this.config.commandsCenter, this.config.commandsRight];
    for (let i = 0; i < 3; i++) {
      const words = String(lists[i]).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (words.includes(word)) return i;
    }
    return null;
  }

  findGiftRule(giftName, diamonds) {
    const rules = this.config.giftRules || [];
    const name = String(giftName || '').trim().toLowerCase();
    if (name) {
      const byName = rules.find((r) => r.name && r.name.trim().toLowerCase() === name);
      if (byName) return byName;
    }
    return rules.find((r) => !r.name && diamonds >= r.minDiamonds && diamonds <= r.maxDiamonds) || null;
  }

  applyGiftAction(rule, p, now, index) {
    switch (rule.action) {
      case 'shake':
        this.actions.shake({ by: p.nickname, index });
        this.fx({ type: 'shake', by: p.nickname });
        break;
      case 'coinRain':
        this.actions.coinRain(Math.max(1, rule.param || 1), { by: p.nickname });
        this.fx({ type: 'coinRain', by: p.nickname, count: rule.param });
        break;
      case 'spawn':
        this.actions.spawn(rule.param, { by: p.nickname });
        this.fx({ type: 'spawn', by: p.nickname, item: rule.param });
        break;
      case 'queueSkip':
        this.queueSkip(p, rule.param);
        break;
      default:
        break;
    }
  }

  queueSkip(p, places) {
    const i = this.queue.indexOf(p.id);
    if (i < 0) return false; // pas dans la file (en train de jouer ou sans jeton)
    const target = places > 0 ? Math.max(0, i - places) : 0;
    this.queue.splice(i, 1);
    this.queue.splice(target, 0, p.id);
    p.boosted = true;
    this.fx({ type: 'queueSkip', player: p.nickname, position: target + 1 });
    this.touch();
    return true;
  }

  deactivate(p) {
    p.active = false;
    this.queue = this.queue.filter((id) => id !== p.id);
    if (this.turn && this.turn.playerId === p.id && this.turn.phase === 'aim') {
      // Il a quitté pendant son tour : on passe au suivant sans consommer de jeton.
      this.turn = null;
    }
    this.touch();
  }

  // ---------- Tours ----------
  launchFor(p, slot, now, auto) {
    if (p.tokens <= 0) return false;
    p.tokens--;
    if (!auto) p.missedTurns = 0;
    this.turn.phase = 'launched';
    this.turn.slot = slot;
    this.turn.auto = auto;
    this.turn.endsAt = now + this.config.afterLaunchMs;
    this.actions.launch(slot, { playerId: p.id, nickname: p.nickname });
    this.fx({ type: 'launch', player: p.nickname, slot, slotName: SLOT_NAMES[slot], auto });
    this.touch();
    return true;
  }

  update(now) {
    if (this.status !== 'running') return;
    if (this.turn) {
      if (this.turn.phase === 'aim' && now >= this.turn.deadline) {
        const p = this.players.get(this.turn.playerId);
        p.missedTurns++;
        const slot = Math.floor(this.random() * 3);
        if (!this.launchFor(p, slot, now, true)) this.endTurn(now);
      } else if (this.turn.phase === 'launched' && now >= this.turn.endsAt) {
        this.endTurn(now);
      }
    }
    if (!this.turn) this.startNextTurn(now);
  }

  endTurn(now) {
    const p = this.players.get(this.turn.playerId);
    this.prevTurn = { playerId: this.turn.playerId, endedAt: now };
    this.turn = null;
    if (p) {
      p.boosted = false;
      if (p.missedTurns >= this.config.maxMissedTurns) {
        p.active = false; // considéré comme parti ; revient dès qu'il interagit
        this.fx({ type: 'inactive', player: p.nickname });
      }
      this.enqueueIfEligible(p);
    }
    this.touch();
  }

  startNextTurn(now) {
    while (this.queue.length) {
      const id = this.queue.shift();
      const p = this.players.get(id);
      if (!p || !p.active || p.tokens <= 0) continue;
      this.turnCounter++;
      this.turn = { n: this.turnCounter, playerId: id, phase: 'aim', startedAt: now, deadline: now + this.config.turnSeconds * 1000 };
      this.fx({ type: 'turn', player: p.nickname });
      this.touch();
      return true;
    }
    return false;
  }

  // Attribution d'un objet tombé : délai de grâce du tour précédent, sinon joueur du tour en cours.
  ownerAt(now) {
    if (this.prevTurn && now - this.prevTurn.endedAt <= this.config.graceSeconds * 1000) return this.prevTurn.playerId;
    if (this.turn) return this.turn.playerId;
    return null;
  }

  // item = { key, points? } ; side = true si tombé par un côté (perdu).
  onFall(item, now, { side = false } = {}) {
    if (side) { this.fx({ type: 'lost', item: item.key, x: item.x, id: item.id }); return null; }
    const def = (this.config.items || []).find((i) => i.key === item.key);
    if (!def) return null;
    let points = def.points;
    if (def.kind === 'chest') {
      const max = Math.max(def.points, def.pointsMax || def.points);
      points = def.points + Math.round(this.random() * (max - def.points) / 10) * 10;
    }
    const ownerId = this.ownerAt(now);
    const p = ownerId ? this.players.get(ownerId) : null;
    if (p) { p.points += points; this.touch(); }
    this.fx({ type: 'fall', item: item.key, points, player: p ? p.nickname : null, x: item.x, id: item.id });
    return { playerId: p ? p.id : null, points };
  }

  pause(now) { if (this.status === 'running') { this.status = 'paused'; this.pausedAt = now; this.touch(); } }
  resume(now) {
    if (this.status !== 'paused') return;
    const d = now - (this.pausedAt || now);
    if (this.turn) {
      if (this.turn.deadline) this.turn.deadline += d;
      if (this.turn.endsAt) this.turn.endsAt += d;
    }
    if (this.prevTurn) this.prevTurn.endedAt += d;
    this.status = 'running';
    this.pausedAt = null;
    this.touch();
  }

  resetLeaderboard() { for (const p of this.players.values()) p.points = 0; this.touch(); }

  // ---------- Vues ----------
  leaderboard(n = 5) {
    return [...this.players.values()].filter((p) => p.points > 0)
      .sort((a, b) => b.points - a.points || a.joinedAt - b.joinedAt).slice(0, n)
      .map((p) => ({ nickname: p.nickname, points: p.points }));
  }

  publicState(now) {
    const t = this.turn;
    const tp = t ? this.players.get(t.playerId) : null;
    return {
      status: this.status,
      turn: t ? {
        nickname: tp.nickname, tokens: tp.tokens, phase: t.phase, slot: t.slot ?? null,
        remainingMs: t.phase === 'aim' ? Math.max(0, t.deadline - (this.status === 'paused' ? this.pausedAt : now)) : 0,
        totalMs: this.config.turnSeconds * 1000, n: t.n,
      } : null,
      queue: this.queue.slice(0, 6).map((id) => { const p = this.players.get(id); return { nickname: p.nickname, tokens: p.tokens, boosted: p.boosted }; }),
      queueLength: this.queue.length,
      leaderboard: this.leaderboard(5),
      commands: [this.config.commandsLeft, this.config.commandsCenter, this.config.commandsRight].map((s) => String(s).split(',')[0].trim()),
      likesPerRefill: this.config.likesPerRefill, tokensPerLikeRefill: this.config.tokensPerLikeRefill, startTokens: this.config.startTokens,
    };
  }

  controlStats() {
    const donors = Object.entries(this.stats.donors).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, d]) => ({ nickname: this.players.get(id)?.nickname || id, diamonds: d }));
    const active = [...this.players.values()].filter((p) => p.active).length;
    return { ...this.stats, donors, players: this.players.size, active, queueLength: this.queue.length };
  }

  playersList() {
    return [...this.players.values()].sort((a, b) => b.points - a.points)
      .map((p) => ({ id: p.id, nickname: p.nickname, tokens: p.tokens, points: p.points, active: p.active, inQueue: this.queue.includes(p.id) }));
  }

  // ---------- Sauvegarde ----------
  serialize() {
    return {
      players: [...this.players.values()], queue: this.queue, turn: this.turn, prevTurn: this.prevTurn,
      status: this.status, pausedAt: this.pausedAt, turnCounter: this.turnCounter, stats: this.stats,
    };
  }

  restore(data, now) {
    if (!data) return;
    this.players = new Map((data.players || []).map((p) => [p.id, p]));
    this.queue = (data.queue || []).filter((id) => this.players.has(id));
    this.turnCounter = data.turnCounter || 0;
    this.stats = { ...this.stats, ...(data.stats || {}) };
    // Un tour interrompu par un plantage repart proprement : le joueur retrouve sa place en tête.
    if (data.turn && this.players.has(data.turn.playerId) && data.turn.phase === 'aim') this.queue.unshift(data.turn.playerId);
    this.turn = null;
    this.prevTurn = null;
    this.status = 'paused';
    this.pausedAt = now;
    this.touch();
  }
}

function cleanName(s) {
  // Retire les caractères de contrôle et limite la longueur affichée.
  return String(s).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || 'viewer';
}

module.exports = { Game, SLOT_NAMES };
