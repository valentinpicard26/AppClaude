'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../src/game');
const { defaultConfig, applyConfigPatch } = require('../src/config');

function setup(patch = {}, random = () => 0.5) {
  const calls = { launch: [], shake: 0 };
  const g = new Game(applyConfigPatch(defaultConfig(), patch), {
    random,
    actions: { launch: (slot, who) => calls.launch.push({ slot, who: who.playerId }), shake: () => { calls.shake++; } },
  });
  return { g, calls };
}
const A = { userId: 'a', nickname: 'Alice' };
const B = { userId: 'b', nickname: 'Bob' };
const C = { userId: 'c', nickname: 'Chloé' };
// Cadeaux par défaut (valeurs proposées) : 199 secousse au lancer, 299 dévié, 399 perte de 2, 499 bouclier, 699 vol de 3.
const gift = (u, diamonds, n = 1) => ({ type: 'gift', ...u, diamondCount: diamonds, repeatCount: n });

// A joue, B attend.
function aPlaying(patch, random) {
  const s = setup(patch, random);
  s.g.handleEvent({ type: 'join', ...A }, 0);
  s.g.handleEvent({ type: 'join', ...B }, 0);
  s.g.update(0);
  assert.equal(s.g.turn.playerId, 'a');
  return s;
}

test('Scénario 7 : A a un bouclier actif, B envoie un pouvoir qui gêne → bloqué', () => {
  const { g } = aPlaying();
  g.handleEvent(gift(A, 499), 100);
  assert.ok(g.players.get('a').shieldUntil > 100);
  g.handleEvent(gift(B, 399), 200);
  assert.equal(g.players.get('a').tokens, 5);
  assert.equal(g.stats.blocked, 1);
});

test('le bouclier expire après sa durée', () => {
  const { g } = aPlaying({ shieldSeconds: 10 });
  g.handleEvent(gift(A, 499), 0);
  g.handleEvent(gift(B, 399), 10001);
  assert.equal(g.players.get('a').tokens, 3);
});

test('Scénario 8 : B vole des jetons à A → A garde au moins 1 jeton, les jetons vont à B', () => {
  const { g } = aPlaying({ startTokens: 3 });
  g.handleEvent(gift(B, 699), 100); // vol de 3
  assert.equal(g.players.get('a').tokens, 1);
  assert.equal(g.players.get('b').tokens, 5); // 3 + 2 volés
});

test('vol : l\'attaquant ne dépasse jamais le stock maximum', () => {
  const { g } = aPlaying();
  g.players.get('b').tokens = 19;
  g.handleEvent(gift(B, 699), 100);
  assert.equal(g.players.get('a').tokens, 2);
  assert.equal(g.players.get('b').tokens, 20);
});

test('perte de jetons, jamais en dessous de 1', () => {
  const { g } = aPlaying({ startTokens: 2, powerCooldownSeconds: 0 });
  g.handleEvent(gift(B, 399), 100);
  assert.equal(g.players.get('a').tokens, 1);
  g.handleEvent(gift(B, 399), 200);
  assert.equal(g.players.get('a').tokens, 1);
});

test('jeton dévié : il part dans une autre fente que celle choisie', () => {
  const { g, calls } = aPlaying();
  g.handleEvent(gift(B, 299), 100);
  g.handleEvent({ type: 'chat', ...A, comment: '2' }, 200);
  assert.equal(calls.launch.length, 1);
  assert.notEqual(calls.launch[0].slot, 1);
});

test('secousse au lancer : la machine tremble quand le joueur lance', () => {
  const { g, calls } = aPlaying();
  g.handleEvent(gift(B, 199), 100);
  assert.equal(calls.shake, 0);
  g.handleEvent({ type: 'chat', ...A, comment: '1' }, 200);
  assert.equal(calls.shake, 1);
});

test('cible qui vient d\'être touchée : le pouvoir attend son tour suivant (le donateur ne perd rien)', () => {
  const { g } = aPlaying({ powerCooldownSeconds: 20 });
  g.handleEvent(gift(B, 399), 100);
  assert.equal(g.players.get('a').tokens, 3);
  assert.equal(g.handleEvent(gift(B, 399), 200), 'gift:loseTokens');
  assert.equal(g.players.get('a').tokens, 3);
  assert.equal(g.players.get('a').pending.length, 1);
  // A joue, B joue, puis A revient : la perte s'applique
  g.handleEvent({ type: 'chat', ...A, comment: '1' }, 300);
  g.update(300 + g.config.afterLaunchMs);
  assert.equal(g.turn.playerId, 'b');
  g.handleEvent({ type: 'chat', ...B, comment: '1' }, 2000);
  g.update(2000 + g.config.afterLaunchMs);
  assert.equal(g.turn.playerId, 'a');
  assert.equal(g.players.get('a').tokens, 1); // 3 - 1 lancé = 2, puis -2 mais jamais sous 1
  assert.equal(g.players.get('a').pending.length, 0);
});

test('mode paisible : les pouvoirs qui gênent sont coupés, le bouclier reste possible', () => {
  const { g, calls } = aPlaying({ peaceful: true });
  g.handleEvent(gift(B, 699), 100);
  g.handleEvent(gift(B, 199), 100);
  g.handleEvent({ type: 'chat', ...A, comment: '1' }, 200);
  assert.equal(g.players.get('a').tokens, 4);
  assert.equal(calls.shake, 0);
  g.handleEvent(gift(B, 499), 300);
  assert.ok(g.players.get('b').shieldUntil > 300);
});

test('pouvoir envoyé quand personne ne joue : il vise le prochain joueur', () => {
  const { g } = setup();
  g.handleEvent(gift(C, 399), 0); // C arrive et envoie le cadeau : C est dans la file mais ne joue pas encore
  g.turn = null; g.queue = [];
  g.handleEvent({ type: 'join', ...A }, 10);
  g.update(20);
  assert.equal(g.turn.playerId, 'a');
  assert.equal(g.players.get('a').tokens, 3);
});

test('le donateur ne se gêne pas lui-même : son pouvoir attend le joueur suivant', () => {
  const { g } = aPlaying();
  g.handleEvent(gift(A, 399), 100);
  assert.equal(g.players.get('a').tokens, 5);
  g.handleEvent({ type: 'chat', ...A, comment: '1' }, 200);
  g.update(200 + g.config.afterLaunchMs);
  assert.equal(g.turn.playerId, 'b');
  assert.equal(g.players.get('b').tokens, 3);
});

test('3 cadeaux de vol = 3 effets (pas de plafond d\'utilisation, délai entre pouvoirs respecté)', () => {
  const { g } = aPlaying({ powerCooldownSeconds: 0, startTokens: 20, maxTokens: 20 });
  g.handleEvent(gift(B, 699, 3), 100);
  assert.equal(g.players.get('a').tokens, 11);
});

test('le bouclier ne s\'use pas pendant la pause', () => {
  const { g } = aPlaying({ shieldSeconds: 10 });
  g.handleEvent(gift(A, 499), 0);
  g.pause(5000);
  g.resume(65000);
  g.handleEvent(gift(B, 399), 69000);
  assert.equal(g.players.get('a').tokens, 5);
});
