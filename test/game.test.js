'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../src/game');
const { defaultConfig, applyConfigPatch } = require('../src/config');

// Fabrique une partie avec des actions espionnées et une horloge manuelle.
function setup(patch = {}, random = () => 0.5) {
  const calls = { launch: [], shake: 0, spawn: [], coinRain: [] };
  const cfg = applyConfigPatch(defaultConfig(), patch);
  const g = new Game(cfg, {
    random,
    actions: {
      launch: (slot, who) => calls.launch.push({ slot, who: who.playerId }),
      shake: () => { calls.shake++; },
      spawn: (key, o) => calls.spawn.push({ key, by: o.by }),
      coinRain: (n) => calls.coinRain.push(n),
    },
  });
  return { g, calls, cfg };
}
const A = { userId: 'a', nickname: 'Alice' };
const B = { userId: 'b', nickname: 'Bob' };
const C = { userId: 'c', nickname: 'Chloé' };
const D_ = { userId: 'd', nickname: 'Dan' };

test('un viewer qui rejoint reçoit 5 jetons et entre dans la file', () => {
  const { g } = setup();
  g.handleEvent({ type: 'join', ...A }, 0);
  assert.equal(g.players.get('a').tokens, 5);
  assert.deepEqual(g.queue, ['a']);
});

test('un viewer qui quitte puis revient ne reçoit pas de nouveaux jetons', () => {
  const { g } = setup();
  g.handleEvent({ type: 'join', ...A }, 0);
  g.handleEvent({ type: 'leave', ...A }, 10);
  g.handleEvent({ type: 'join', ...A }, 20);
  assert.equal(g.players.get('a').tokens, 5);
});

test('le joueur est identifié par son identifiant, pas par son pseudo', () => {
  const { g } = setup();
  g.handleEvent({ type: 'join', userId: 'a', nickname: 'Alice' }, 0);
  g.handleEvent({ type: 'join', userId: 'a', nickname: 'Alice2' }, 0);
  assert.equal(g.players.size, 1);
  assert.equal(g.players.get('a').nickname, 'Alice2');
});

test('Scénario 1 : pendant le tour de A, A et B écrivent 1 en même temps → seul le jeton de A part', () => {
  const { g, calls } = setup();
  g.handleEvent({ type: 'join', ...A }, 0);
  g.handleEvent({ type: 'join', ...B }, 0);
  g.update(0);
  assert.equal(g.turn.playerId, 'a');
  assert.equal(g.handleEvent({ type: 'chat', ...B, comment: '1' }, 100), 'ignored-not-your-turn');
  assert.equal(g.handleEvent({ type: 'chat', ...A, comment: '1' }, 100), 'launch');
  assert.equal(g.handleEvent({ type: 'chat', ...A, comment: '1' }, 101), 'ignored-not-your-turn'); // un seul jeton par tour
  assert.deepEqual(calls.launch, [{ slot: 0, who: 'a' }]);
  assert.equal(g.players.get('a').tokens, 4);
  assert.equal(g.players.get('b').tokens, 5);
});

test('les commandes 1, 2, 3 choisissent gauche, centre, droite', () => {
  const { g, calls } = setup();
  for (const [i, u] of [A, B, C].entries()) g.handleEvent({ type: 'join', ...u }, 0);
  let now = 0;
  for (const [u, cmd] of [[A, '3'], [B, '2'], [C, '1']]) {
    g.update(now);
    g.handleEvent({ type: 'chat', ...u, comment: cmd }, now);
    now += 5000;
    g.update(now);
  }
  assert.deepEqual(calls.launch.map((l) => l.slot), [2, 1, 0]);
});

test('Scénario 2 : B envoie 3 roses → la machine tremble 3 fois', () => {
  const { g, calls } = setup();
  g.handleEvent({ type: 'gift', ...B, giftName: 'Rose', diamondCount: 1, repeatCount: 3 }, 0);
  assert.equal(calls.shake, 3);
});

test('Scénario 3 : B fait apparaître le coffre, C le fait tomber → C gagne 2 000 à 5 000, B rien', () => {
  const { g, calls } = setup({}, () => 0.37);
  g.handleEvent({ type: 'join', ...C }, 0);
  g.handleEvent({ type: 'gift', ...B, giftName: 'Gros cadeau', diamondCount: 5000, repeatCount: 1 }, 0);
  assert.deepEqual(calls.spawn, [{ key: 'coffre', by: 'Bob' }]);
  // On vide le tour éventuel de B pour se placer pendant le tour de C
  g.queue = ['c']; g.turn = null; g.prevTurn = null; g.update(1000);
  assert.equal(g.turn.playerId, 'c');
  const r = g.onFall({ key: 'coffre' }, 2000);
  assert.equal(r.playerId, 'c');
  assert.ok(r.points >= 2000 && r.points <= 5000);
  assert.equal(g.players.get('c').points, r.points);
  assert.equal(g.players.get('b').points, 0);
});

test('Scénario 4 : A sans jeton envoie 100 likes → 5 jetons, jamais plus de 20', () => {
  const { g } = setup();
  g.handleEvent({ type: 'join', ...A }, 0);
  g.players.get('a').tokens = 0;
  g.handleEvent({ type: 'like', ...A, likeCount: 60 }, 0);
  assert.equal(g.players.get('a').tokens, 0);
  g.handleEvent({ type: 'like', ...A, likeCount: 40 }, 0);
  assert.equal(g.players.get('a').tokens, 5);
  g.handleEvent({ type: 'like', ...A, likeCount: 1000 }, 0);
  assert.equal(g.players.get('a').tokens, 20);
});

test('Scénario 5 : D s\'abonne → 5 jetons (une seule fois par live)', () => {
  const { g } = setup();
  g.handleEvent({ type: 'join', ...D_ }, 0);
  g.handleEvent({ type: 'follow', ...D_ }, 0);
  assert.equal(g.players.get('d').tokens, 10);
  g.handleEvent({ type: 'follow', ...D_ }, 0);
  assert.equal(g.players.get('d').tokens, 10);
});

test('Scénario 6 : A ne répond pas en 10 s → jeton dans une fente au hasard, puis tour suivant', () => {
  const { g, calls } = setup({}, () => 0.9);
  g.handleEvent({ type: 'join', ...A }, 0);
  g.handleEvent({ type: 'join', ...B }, 0);
  g.update(0);
  g.update(9999);
  assert.equal(calls.launch.length, 0);
  g.update(10000);
  assert.deepEqual(calls.launch, [{ slot: 2, who: 'a' }]);
  assert.equal(g.players.get('a').tokens, 4);
  g.update(10000 + g.config.afterLaunchMs);
  assert.equal(g.turn.playerId, 'b');
});

test('Scénario 9 : un ticket de 200 tombe 2 s après la fin du tour de A → 200 points pour A', () => {
  const { g } = setup();
  g.handleEvent({ type: 'join', ...A }, 0);
  g.handleEvent({ type: 'join', ...B }, 0);
  g.update(0);
  g.handleEvent({ type: 'chat', ...A, comment: '2' }, 1000);
  const end = 1000 + g.config.afterLaunchMs;
  g.update(end);
  assert.equal(g.turn.playerId, 'b');
  g.onFall({ key: 'ticket200' }, end + 2000);
  assert.equal(g.players.get('a').points, 200);
  assert.equal(g.players.get('b').points, 0);
  // Après le délai de grâce, c'est le joueur du tour en cours qui gagne
  g.onFall({ key: 'coin' }, end + 3500);
  assert.equal(g.players.get('b').points, 10);
});

test('chaque objet tombé crédite une seule fois, selon le tableau des valeurs', () => {
  const { g } = setup();
  g.handleEvent({ type: 'join', ...A }, 0);
  g.update(0);
  for (const [key, pts] of [['coin', 10], ['ticket20', 20], ['ticket40', 40], ['diamant', 500], ['cristal', 2000]]) {
    const before = g.players.get('a').points;
    g.onFall({ key }, 100);
    assert.equal(g.players.get('a').points - before, pts);
  }
  assert.equal(g.onFall({ key: 'coin' }, 100, { side: true }), null); // tombé par le côté : perdu
});

test('un joueur sans jeton sort de la file et y revient après une recharge', () => {
  const { g } = setup({ startTokens: 1 });
  g.handleEvent({ type: 'join', ...A }, 0);
  g.update(0);
  g.handleEvent({ type: 'chat', ...A, comment: '1' }, 10);
  g.update(5000);
  assert.equal(g.turn, null);
  assert.deepEqual(g.queue, []);
  g.handleEvent({ type: 'like', ...A, likeCount: 100 }, 6000);
  assert.deepEqual(g.queue, ['a']);
});

test('après plusieurs tours sans réponse, le viewer sort de la file ; il revient en écrivant', () => {
  const { g } = setup({ maxMissedTurns: 2 });
  g.handleEvent({ type: 'join', ...A }, 0);
  let now = 0;
  for (let i = 0; i < 2; i++) { g.update(now); now += 10000; g.update(now); now += 2000; g.update(now); }
  assert.equal(g.players.get('a').active, false);
  assert.deepEqual(g.queue, []);
  g.handleEvent({ type: 'chat', ...A, comment: 'coucou' }, now);
  assert.deepEqual(g.queue, ['a']);
});

test('un viewer qui quitte le live pendant son tour : on passe au suivant sans lui prendre de jeton', () => {
  const { g } = setup();
  g.handleEvent({ type: 'join', ...A }, 0);
  g.handleEvent({ type: 'join', ...B }, 0);
  g.update(0);
  g.handleEvent({ type: 'leave', ...A }, 100);
  g.update(200);
  assert.equal(g.turn.playerId, 'b');
  assert.equal(g.players.get('a').tokens, 5);
});

test('un cadeau désigné fait passer devant dans la file', () => {
  const { g } = setup();
  for (const u of [A, B, C, D_]) g.handleEvent({ type: 'join', ...u }, 0);
  g.update(0); // A joue ; file = B, C, D
  g.handleEvent({ type: 'gift', ...D_, giftName: '', diamondCount: 10, repeatCount: 1 }, 10);
  assert.deepEqual(g.queue, ['d', 'b', 'c']);
  assert.equal(g.players.get('d').boosted, true);
});

test('pluie de jetons et objets bonus selon la valeur du cadeau', () => {
  const { g, calls } = setup();
  g.handleEvent({ type: 'gift', ...B, diamondCount: 30 }, 0);
  g.handleEvent({ type: 'gift', ...B, diamondCount: 999 }, 0);
  g.handleEvent({ type: 'gift', ...B, diamondCount: 3000, repeatCount: 2 }, 0);
  assert.deepEqual(calls.coinRain, [5]);
  assert.deepEqual(calls.spawn.map((s) => s.key), ['rubis', 'topaze', 'topaze']);
});

test('pause : le compte à rebours est gelé puis reprend', () => {
  const { g, calls } = setup();
  g.handleEvent({ type: 'join', ...A }, 0);
  g.update(0);
  g.pause(5000);
  g.update(60000);
  assert.equal(calls.launch.length, 0);
  g.resume(60000);
  g.update(64999);
  assert.equal(calls.launch.length, 0);
  g.update(65000);
  assert.equal(calls.launch.length, 1);
});

test('pseudos bloqués ignorés', () => {
  const { g } = setup({ blockedNames: 'Bob' });
  assert.equal(g.handleEvent({ type: 'join', ...B }, 0), 'blocked');
  assert.equal(g.players.size, 0);
});

test('option : jetons d\'arrivée réservés aux abonnés', () => {
  const { g } = setup({ joinTokensFollowersOnly: true });
  g.handleEvent({ type: 'join', ...A }, 0);
  g.handleEvent({ type: 'join', ...B, isFollower: true }, 0);
  assert.equal(g.players.get('a').tokens, 0);
  assert.equal(g.players.get('b').tokens, 5);
});

test('sauvegarde et reprise : joueurs, points et file conservés, partie en pause', () => {
  const { g } = setup();
  g.handleEvent({ type: 'join', ...A }, 0);
  g.handleEvent({ type: 'join', ...B }, 0);
  g.update(0);
  g.onFall({ key: 'ticket40' }, 10);
  const data = JSON.parse(JSON.stringify(g.serialize()));
  const { g: g2 } = setup();
  g2.restore(data, 99);
  assert.equal(g2.players.get('a').points, 40);
  assert.deepEqual(g2.queue, ['a', 'b']);
  assert.equal(g2.status, 'paused');
});

test('stress : plusieurs viewers écrivent en même temps, un seul jeton par tour et toujours le bon joueur', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const { g, calls } = setup({}, rnd);
  const users = Array.from({ length: 30 }, (_, i) => ({ userId: 'u' + i, nickname: 'u' + i }));
  for (const u of users) g.handleEvent({ type: 'join', ...u }, 0);
  let now = 0;
  let turns = 0;
  while (now < 3600 * 1000) {
    const before = calls.launch.length;
    const current = g.turn?.playerId;
    for (const u of users) if (rnd() < 0.3) g.handleEvent({ type: 'chat', ...u, comment: String(1 + Math.floor(rnd() * 3)) }, now);
    const launched = calls.launch.slice(before);
    assert.ok(launched.length <= 1);
    if (launched.length) assert.equal(launched[0].who, current);
    if (rnd() < 0.05) g.handleEvent({ type: 'like', ...users[Math.floor(rnd() * 30)], likeCount: 50 }, now);
    if (current && g.turn?.n) turns = g.turn.n;
    now += 500;
    g.update(now);
    for (const p of g.players.values()) assert.ok(p.tokens >= 0 && p.tokens <= 20);
  }
  assert.ok(turns > 100);
});
