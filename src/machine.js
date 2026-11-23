'use strict';
// Physique du pousse-pièces, vue de dessus (2D), avec Matter.js.
// Repère : x de 0 (gauche) à W (droite), y de 0 (fond, sous la façade) à D (bord avant du plateau fixe).
// Le poussoir (étage mobile) occupe tout le fond et son bord avant oscille entre y=0 et y=stroke.
// Ce qui dépasse y > D tombe dans le bac (points) ; ce qui sort par les côtés ouverts est perdu.
// La page du jeu projette ce plan en perspective sur le décor de la machine.

const Matter = require('matter-js');
const { Engine, Bodies, Body, Composite } = Matter;

const W = 300;
const D = 400;
const COIN_R = 15;
const STEP_MS = 1000 / 60;
const AIR_MS = 450; // durée de chute depuis la fente
const SLOT_X = [W * 0.2, W * 0.5, W * 0.8];

const CAT_WALL = 0x0001;
const CAT_OBJ = 0x0002;

class Machine {
  constructor(config, { random = Math.random } = {}) {
    this.config = config;
    this.random = random;
    this.engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 }, positionIterations: 10, velocityIterations: 8 });
    this.world = this.engine.world;
    this.objects = new Map();
    this.nextId = 1;
    this.time = 0; // horloge interne (ms), avance uniquement quand la machine tourne
    this.shakeUntil = 0;
    this.shakePhase = 0;
    this.lastTicketCheck = 0;
    this.pendingRain = [];
    this.buildStatic();
  }

  setConfig(cfg) {
    const rebuild = cfg.sideGapRatio !== this.config.sideGapRatio;
    this.config = cfg;
    if (rebuild) this.buildWalls();
  }

  buildStatic() {
    this.pusher = Bodies.rectangle(W / 2, -300, W + 60, 600, {
      isStatic: true, friction: 0.05, collisionFilter: { category: CAT_WALL, mask: CAT_OBJ }, label: 'pusher',
    });
    Composite.add(this.world, this.pusher);
    this.buildWalls();
  }

  buildWalls() {
    if (this.walls) Composite.remove(this.world, this.walls);
    const wallEnd = D * (1 - this.config.sideGapRatio);
    const len = wallEnd + 600;
    const opts = { isStatic: true, friction: 0.02, collisionFilter: { category: CAT_WALL, mask: CAT_OBJ } };
    this.walls = [
      Bodies.rectangle(-20, wallEnd - len / 2, 40, len, opts),
      Bodies.rectangle(W + 20, wallEnd - len / 2, 40, len, opts),
    ];
    Composite.add(this.world, this.walls);
  }

  pusherFront(t = this.time) {
    const stroke = this.config.pusherStroke;
    const period = this.config.pusherPeriodSeconds * 1000;
    return stroke * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / period));
  }

  itemDef(key) { return (this.config.items || []).find((i) => i.key === key); }

  createBody(key, x, y, angle = 0) {
    const def = this.itemDef(key);
    const kind = def ? def.kind : 'coin';
    const common = {
      frictionAir: 0.05, friction: 0.08, restitution: 0.05, angle,
      collisionFilter: { category: CAT_OBJ, mask: CAT_WALL | CAT_OBJ },
    };
    switch (kind) {
      case 'ticket': return Bodies.rectangle(x, y, 46, 24, { ...common, density: 0.0012, chamfer: { radius: 3 } });
      case 'gem': return Bodies.polygon(x, y, 6, 17, { ...common, density: 0.0016 });
      case 'chest': return Bodies.rectangle(x, y, 44, 34, { ...common, density: 0.003, chamfer: { radius: 4 } });
      default: return Bodies.circle(x, y, COIN_R, { ...common, density: 0.001 });
    }
  }

  // Ajoute un objet ; s'il "tombe du ciel", il ne touche rien pendant AIR_MS (animation de chute).
  addObject(key, x, y, { angle = 0, air = false, label = null, owner = null } = {}) {
    this.enforceLimit();
    const body = this.createBody(key, x, y, angle);
    const id = this.nextId++;
    const obj = { id, key, body, landAt: air ? this.time + AIR_MS : 0, label, labelUntil: label ? this.time + 2500 : 0, owner };
    if (air) body.collisionFilter = { ...body.collisionFilter, mask: 0 };
    Composite.add(this.world, body);
    this.objects.set(id, obj);
    return obj;
  }

  removeObject(obj) {
    Composite.remove(this.world, obj.body);
    this.objects.delete(obj.id);
  }

  // Si la limite d'objets est atteinte, retire le jeton le plus au fond (invisible pour les joueurs).
  enforceLimit() {
    if (this.objects.size < this.config.maxObjects) return;
    let worst = null;
    for (const o of this.objects.values()) {
      if (o.key !== 'coin' || o.landAt > this.time) continue;
      if (!worst || o.body.position.y < worst.body.position.y) worst = o;
    }
    if (worst) this.removeObject(worst);
  }

  isFree(x, y, r) {
    for (const o of this.objects.values()) {
      if (o.landAt > this.time) continue;
      const p = o.body.position;
      if ((p.x - x) ** 2 + (p.y - y) ** 2 < (r + COIN_R) ** 2 * 0.95) return false;
    }
    return true;
  }

  // Lance un jeton par la fente 0 (gauche), 1 (centre) ou 2 (droite).
  launch(slot, { nickname = null, playerId = null } = {}) {
    const x = SLOT_X[slot] + (this.random() - 0.5) * 16;
    const y = this.pusherFront() + COIN_R + 2;
    return this.addObject('coin', x, y, { air: true, label: nickname, owner: playerId });
  }

  // Objet bonus offert par un viewer : il atterrit sur le plateau fixe, à un endroit libre si possible.
  spawn(key, { by = null } = {}) {
    if (!this.itemDef(key)) return null;
    const yMin = this.config.pusherStroke + 30;
    const yMax = D - 90;
    let best = null;
    for (let i = 0; i < 30; i++) {
      const x = 40 + this.random() * (W - 80);
      const y = yMin + this.random() * Math.max(10, yMax - yMin);
      best = { x, y };
      if (this.isFree(x, y, 20)) break;
    }
    return this.addObject(key, best.x, best.y, { angle: (this.random() - 0.5) * 1.2, air: true, label: by });
  }

  coinRain(n, { by = null } = {}) {
    for (let i = 0; i < n; i++) this.pendingRain.push({ at: this.time + i * this.config.coinRainDelayMs, by });
  }

  shake() {
    const dur = this.config.shakeDurationMs;
    this.shakeUntil = Math.max(this.shakeUntil, this.time) + dur;
    // Impulsion immédiate, puis vibrations pendant la durée (voir step).
    this.kick(1);
  }

  kick(scale) {
    const I = this.config.shakeIntensity * 0.18 * scale;
    for (const o of this.objects.values()) {
      if (o.landAt > this.time) continue;
      const b = o.body;
      Body.setVelocity(b, {
        x: b.velocity.x + (this.random() - 0.5) * I,
        y: b.velocity.y + (this.random() - 0.35) * I, // léger biais vers l'avant, comme une vraie secousse
      });
      Body.setAngularVelocity(b, b.angularVelocity + (this.random() - 0.5) * 0.05 * scale);
    }
  }

  // Remplit le plateau au démarrage (jetons + tickets), sans chevauchement.
  prefill() {
    for (const o of [...this.objects.values()]) this.removeObject(o);
    // Tickets d'abord, puis un tapis de jetons serré (grille en quinconce) depuis le bord avant vers le fond :
    // comme dans une vraie machine, chaque poussée déplace tout le tapis et fait déborder le bord.
    for (let i = 0; i < this.config.ticketsOnPlate; i++) this.addTicket(false);
    const yMin = this.config.pusherStroke * 0.35 + COIN_R + 2;
    const dx = 2 * COIN_R + 1.5;
    const dy = dx * 0.87;
    let placed = 0;
    for (let row = 0; placed < this.config.coinsOnPlate; row++) {
      const y = D - COIN_R - 4 - row * dy;
      if (y < yMin) break;
      const off = (row % 2) * dx / 2;
      for (let x = COIN_R + 3 + off; x <= W - COIN_R - 3 && placed < this.config.coinsOnPlate; x += dx) {
        const jx = x + (this.random() - 0.5) * 3, jy = y + (this.random() - 0.5) * 3;
        if (!this.isFree(jx, jy, COIN_R)) continue;
        this.addObject('coin', jx, jy);
        placed++;
      }
    }
    // Fait tourner le poussoir deux allers-retours sans compter ce qui tombe : le tapis se tasse
    // et se retrouve « au bord de la chute », si bien que les premiers lancers font déjà tomber des objets.
    const settleSteps = Math.round((2 * this.config.pusherPeriodSeconds * 1000) / STEP_MS);
    for (let i = 0; i < settleSteps; i++) this.step(STEP_MS, { settle: true });
    while (this.countKind('ticket') < this.config.ticketsOnPlate) if (!this.addTicket(false)) break;
  }

  pickTicketKey() {
    const tickets = (this.config.items || []).filter((i) => i.kind === 'ticket' && i.weight > 0);
    const total = tickets.reduce((s, t) => s + t.weight, 0);
    if (!total) return null;
    let r = this.random() * total;
    for (const t of tickets) { r -= t.weight; if (r <= 0) return t.key; }
    return tickets[tickets.length - 1].key;
  }

  addTicket(air) {
    const key = this.pickTicketKey();
    if (!key) return null;
    const yMin = this.config.pusherStroke + 20;
    const yMax = air ? yMin + 80 : D - 40;
    let pos = null;
    for (let i = 0; i < 40; i++) {
      pos = { x: 35 + this.random() * (W - 70), y: yMin + this.random() * (yMax - yMin) };
      if (this.isFree(pos.x, pos.y, 22)) break;
    }
    return this.addObject(key, pos.x, pos.y, { angle: (this.random() - 0.5) * 0.8, air });
  }

  countKind(kind) {
    let n = 0;
    for (const o of this.objects.values()) if (this.itemDef(o.key)?.kind === kind) n++;
    return n;
  }

  // Avance la simulation d'un pas fixe. Renvoie les objets tombés pendant ce pas.
  step(dtMs = STEP_MS, { settle = false } = {}) {
    this.time += dtMs;
    const fallen = [];

    // Poussoir
    const front = this.pusherFront();
    const prevY = this.pusher.position.y;
    const newY = front - 300;
    Body.setPosition(this.pusher, { x: W / 2, y: newY });
    Body.setVelocity(this.pusher, { x: 0, y: newY - prevY });

    // Pluie de jetons programmée
    while (this.pendingRain.length && this.pendingRain[0].at <= this.time) {
      const r = this.pendingRain.shift();
      this.launch(Math.floor(this.random() * 3), { nickname: r.by });
    }

    // Atterrissages
    for (const o of this.objects.values()) {
      if (o.landAt && o.landAt <= this.time) {
        o.landAt = 0;
        o.body.collisionFilter = { ...o.body.collisionFilter, mask: CAT_WALL | CAT_OBJ };
        // Un jeton qui atterrit sous le poussoir est replacé juste devant (il glisse de l'étage mobile).
        if (o.body.position.y < front + COIN_R) Body.setPosition(o.body, { x: o.body.position.x, y: front + COIN_R + 1 });
      }
    }

    // Secousse : petites vibrations tant qu'elle dure
    if (this.shakeUntil > this.time) {
      this.shakePhase++;
      if (this.shakePhase % 6 === 0) this.kick(0.35);
    }

    Engine.update(this.engine, dtMs);

    // Sécurité : rien ne doit passer derrière le poussoir ni s'envoler.
    for (const o of this.objects.values()) {
      const b = o.body;
      if (o.landAt) continue;
      if (b.position.y < front + 4) Body.setPosition(b, { x: b.position.x, y: front + 6 });
      const v = b.velocity;
      const sp = Math.hypot(v.x, v.y);
      if (sp > 12) Body.setVelocity(b, { x: (v.x / sp) * 12, y: (v.y / sp) * 12 });
    }

    // Chutes
    for (const o of [...this.objects.values()]) {
      if (o.landAt) continue;
      const p = o.body.position;
      const inGapZone = p.y > D * (1 - this.config.sideGapRatio);
      let side = null;
      if (p.y > D) side = false; // le centre a passé le bord : l'objet bascule
      else if (inGapZone && (p.x < -8 || p.x > W + 8)) side = true;
      if (side !== null) {
        if (!settle) fallen.push({ id: o.id, key: o.key, side, x: p.x, y: p.y, angle: o.body.angle });
        this.removeObject(o);
      }
    }

    // Tickets : on maintient un nombre cible sur le plateau
    if (!settle && this.time - this.lastTicketCheck > 2500) {
      this.lastTicketCheck = this.time;
      if (this.countKind('ticket') < this.config.ticketsOnPlate) this.addTicket(true);
    }
    return fallen;
  }

  // Instantané compact envoyé à la page du jeu ~30 fois par seconde.
  snapshot() {
    const o = [];
    for (const obj of this.objects.values()) {
      const b = obj.body;
      const air = obj.landAt ? Math.max(0, (obj.landAt - this.time) / AIR_MS) : 0;
      o.push([obj.id, obj.key, Math.round(b.position.x * 10) / 10, Math.round(b.position.y * 10) / 10,
        Math.round(b.angle * 100) / 100, Math.round(air * 100) / 100, obj.labelUntil > this.time ? obj.label : null]);
    }
    return { t: Math.round(this.time), p: Math.round(this.pusherFront() * 10) / 10, s: this.shakeUntil > this.time ? 1 : 0, o };
  }

  serialize() {
    return {
      time: this.time,
      objects: [...this.objects.values()].map((o) => ({ key: o.key, x: o.body.position.x, y: o.body.position.y, a: o.body.angle })),
    };
  }

  restore(data) {
    if (!data || !Array.isArray(data.objects)) return false;
    for (const o of [...this.objects.values()]) this.removeObject(o);
    this.time = data.time || 0;
    for (const o of data.objects) if (this.itemDef(o.key)) this.addObject(o.key, o.x, o.y, { angle: o.a || 0 });
    return true;
  }
}

module.exports = { Machine, W, D, COIN_R, STEP_MS, SLOT_X };
