'use strict';
// Simulateur d'événements : faux viewers, commentaires, likes, cadeaux.
// Sert à développer et tester sans être en live.

const NAMES = ['lea_92', 'tom.gaming', 'nina', 'max_du_13', 'sofia', 'yanis', 'camille', 'hugo', 'ines', 'lucas',
  'jade', 'noah', 'manon', 'ethan', 'chloe', 'adam', 'lina', 'leo', 'zoe', 'mathis'];

class Simulator {
  constructor({ emit, getGame, random = Math.random }) {
    this.emit = emit;
    this.getGame = getGame;
    this.random = random;
    this.count = 0;
    this.auto = false;
    this.timer = null;
  }

  makeViewer() {
    this.count++;
    const base = NAMES[(this.count - 1) % NAMES.length];
    const suffix = this.count > NAMES.length ? String(Math.floor(this.count / NAMES.length)) : '';
    return { userId: 'sim-' + this.count, nickname: base + suffix };
  }

  addViewers(n) {
    const out = [];
    for (let i = 0; i < n; i++) { const v = this.makeViewer(); this.emit({ type: 'join', ...v }); out.push(v); }
    return out;
  }

  // Mode automatique : des faux viewers arrivent, jouent (ou oublient de jouer), likent, offrent des cadeaux.
  setAuto(on) {
    this.auto = !!on;
    clearInterval(this.timer);
    if (this.auto) this.timer = setInterval(() => this.tickAuto(), 700);
  }

  tickAuto() {
    const g = this.getGame();
    const r = this.random();
    const sims = [...g.players.values()].filter((p) => p.id.startsWith('sim-'));
    if (sims.length < 4 || r < 0.04) this.addViewers(1);
    if (g.turn && g.turn.phase === 'aim' && g.turn.playerId.startsWith('sim-')) {
      const p = g.players.get(g.turn.playerId);
      // 85 % répondent, avec un temps de réaction variable ; d'autres tentent de jouer hors tour.
      if (this.random() < 0.35 && this.random() < 0.85) this.emit({ type: 'chat', userId: p.id, nickname: p.nickname, comment: String(1 + Math.floor(this.random() * 3)) });
    }
    const any = sims[Math.floor(this.random() * sims.length)];
    if (!any) return;
    if (r < 0.15) this.emit({ type: 'chat', userId: any.id, nickname: any.nickname, comment: String(1 + Math.floor(this.random() * 3)) });
    else if (r < 0.35) this.emit({ type: 'like', userId: any.id, nickname: any.nickname, likeCount: 5 + Math.floor(this.random() * 30) });
    else if (r < 0.37) this.emit({ type: 'gift', userId: any.id, nickname: any.nickname, giftName: 'Rose', diamondCount: 1, repeatCount: 1 });
    else if (r < 0.375) this.emit({ type: 'gift', userId: any.id, nickname: any.nickname, giftName: 'Cadeau test', diamondCount: 99, repeatCount: 1 });
    else if (r < 0.38) this.emit({ type: 'follow', userId: any.id, nickname: any.nickname });
  }
}

module.exports = { Simulator };
