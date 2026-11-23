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
  g.handleEvent({ type: 'gift', ...B, giftName: 'Galaxy', diamondCount: 1000, repeatCount: 1 }, 0);
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

test('Scénario 9 : un ticket de 100 (le plus gros) tombe 2 s après la fin du tour de A → 100 points pour A', () => {
  const { g } = setup();
  g.handleEvent({ type: 'join', ...A }, 0);
  g.handleEvent({ type: 'join', ...B }, 0);
  g.update(0);
  g.handleEvent({ type: 'chat', ...A, comment: '2' }, 1000);
  const end = 1000 + g.config.afterLaunchMs;
  g.update(end);
  assert.equal(g.turn.playerId, 'b');
  g.onFall({ key: 'ticket100' }, end + 2000);
  assert.equal(g.players.get('a').points, 100);
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
  g.handleEvent({ type: 'gift', ...D_, giftName: 'Finger Heart', diamondCount: 5, repeatCount: 1 }, 10);
  assert.deepEqual(g.queue, ['d', 'b', 'c']);
  assert.equal(g.players.get('d').boosted, true);
});

test('pluie de jetons et objets bonus selon le cadeau lié ; cadeau sans liaison = aucun effet', () => {
  const { g, calls } = setup();
  g.handleEvent({ type: 'gift', ...B, giftName: 'Ice Cream Cone', diamondCount: 1 }, 0);
  g.handleEvent({ type: 'gift', ...B, giftName: 'Swan', diamondCount: 699 }, 0);
  g.handleEvent({ type: 'gift', ...B, giftName: 'galaxy', diamondCount: 1000, repeatCount: 2 }, 0);
  assert.deepEqual(calls.coinRain, [2, 10]);
  assert.deepEqual(calls.spawn.map((s) => s.key), ['coffre', 'coffre']);
  assert.equal(g.handleEvent({ type: 'gift', ...B, giftName: 'Lion', diamondCount: 29999 }, 0), 'gift-no-rule');
  assert.equal(g.handleEvent({ type: 'gift', ...B, giftName: 'Cadeau inconnu', diamondCount: 50 }, 0), 'gift-no-rule');
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

test('un cadeau est reconnu par son identifiant TikTok, sinon par son nom', () => {
  const { g, calls } = setup({ giftRules: [
    { name: 'Galaxy', giftId: '11046', action: 'spawn', param: 'coffre' },
    { name: 'Rose', action: 'shake', param: 1 },
    { name: '', minDiamonds: 1, maxDiamonds: 99999, action: 'coinRain', param: 2 }, // ancienne règle par valeur : ignorée
  ] });
  g.handleEvent({ type: 'gift', ...B, giftId: '11046', giftName: 'Autre nom', diamondCount: 1000 }, 0);
  g.handleEvent({ type: 'gift', ...B, giftId: '5655', giftName: 'rose', diamondCount: 1 }, 0);
  g.handleEvent({ type: 'gift', ...B, giftId: '999', giftName: 'Inconnu', diamondCount: 50 }, 0);
  assert.deepEqual(calls.spawn.map((s) => s.key), ['coffre']);
  assert.equal(calls.shake, 1);
  assert.deepEqual(calls.coinRain, []);
  assert.equal(g.config.giftRules.length, 2);
});

test('catalogue des cadeaux : fusion par identifiant, tri par valeur, images https seulement', () => {
  const { mergeCatalog } = require('../src/config');
  const c = mergeCatalog([{ id: '1', name: 'Rose', diamonds: 1, image: 'https://x/r.png' }], [
    { id: '2', name: 'Lion', diamonds: 29999, image: 'javascript:alert(1)' }, { id: '1', name: 'Rose', diamonds: 1 }, { id: '3', name: 'GG', diamonds: 1 },
  ]);
  assert.deepEqual(c.map((g) => g.id), ['3', '1', '2']);
  assert.equal(c.find((g) => g.id === '1').image, 'https://x/r.png');
  assert.equal(c.find((g) => g.id === '2').image, '');
});

test('connecteur : erreurs connues expliquées en français, message d\'origine conservé', () => {
  const { explainError } = require('../src/tiktok');
  const m = explainError(new Error('[fetchWebcastSignatureFromEulerRoute] Failed to sign a request: This endpoint requires a Business plan.'));
  assert.match(m, /offre payante/);
  assert.match(m, /Business plan/);
  assert.match(explainError(new Error("The requested user isn't online :(")), /pas en direct/);
  assert.equal(explainError(new Error('autre')), 'autre');
});

test('liste « cadeau → effet » affichée aux viewers, sans prix TikTok', () => {
  const { rewardsList } = require('../src/rewards');
  const cfg = applyConfigPatch(defaultConfig(), {
    giftCatalog: [{ id: '5655', name: 'Rose', diamonds: 1, image: 'https://x/rose.png' }, { id: '7', name: 'Money Gun', diamonds: 500 }, { id: '8', name: 'Corgi', diamonds: 299 }],
    giftRules: [
      { name: 'Rose', giftId: '5655', action: 'shake', param: 1 },
      { name: 'Corgi', giftId: '8', action: 'spawn', param: 'coffre' },
      { name: 'Money Gun', giftId: '7', action: 'steal', param: 3 },
    ],
  });
  const list = rewardsList(cfg);
  assert.deepEqual(list.map((r) => r.gift), ['Rose', 'Corgi', 'Money Gun']);
  assert.equal(list[0].image, 'https://x/rose.png');
  assert.match(list[1].text.replace(/\s/g, ' '), /Coffre mystère.*2 000 à 5 000 pts/);
  assert.match(list[2].text, /Vole 3 jetons/);
  assert.ok(list.every((r) => !('cost' in r)));
  const calm = rewardsList({ ...cfg, peaceful: true });
  assert.ok(!calm.some((r) => /Vole/.test(r.text)));
});

test('connecteur : événements TikTok au format actuel (v3) bien traduits', () => {
  const { mapEvent } = require('../src/tiktok');
  const user = { id: '7123456789', displayId: 'lea_92', nickname: 'Léa', followInfo: { followStatus: '1' } };
  assert.deepEqual(mapEvent('chat', { user, content: '2' }), { type: 'chat', userId: '7123456789', uniqueId: 'lea_92', nickname: 'Léa', isFollower: true, comment: '2' });
  assert.equal(mapEvent('like', { user, count: 15 }).likeCount, 15);
  const gift = mapEvent('gift', { user, giftId: '5655', repeatCount: 3, repeatEnd: 1, gift: { id: '5655', name: 'Rose', diamondCount: 1, type: 1, image: { urlList: ['https://x/rose.png'] } } });
  assert.deepEqual([gift.giftId, gift.giftName, gift.diamondCount, gift.repeatCount, gift.giftImage], ['5655', 'Rose', 1, 3, 'https://x/rose.png']);
  // série en cours : ignorée, comptée seulement à la fin
  assert.equal(mapEvent('gift', { user, repeatEnd: 0, gift: { type: 1, name: 'Rose', diamondCount: 1 } }), null);
  // ancien format toujours accepté
  assert.equal(mapEvent('chat', { user: { userId: '9', uniqueId: 'a' }, comment: '1' }).comment, '1');
  assert.equal(mapEvent('like', { user: { userId: '9' }, likeCount: 7 }).likeCount, 7);
});

test('le même viewer reste le même joueur entre arrivée, commentaire et likes', () => {
  const { mapEvent } = require('../src/tiktok');
  const { g, calls } = setup();
  const user = { id: '7123456789', displayId: 'lea_92', nickname: 'Léa' };
  g.handleEvent(mapEvent('join', { user }), 0);
  g.update(0);
  assert.equal(g.handleEvent(mapEvent('chat', { user, content: '3' }), 100), 'launch');
  assert.deepEqual(calls.launch, [{ slot: 2, who: '7123456789' }]);
  g.handleEvent(mapEvent('like', { user, count: 100 }), 200);
  assert.equal(g.players.size, 1);
  assert.equal(g.players.get('7123456789').tokens, 9); // 5 - 1 lancé + 5 (100 likes)
});

test('petits cadeaux par défaut : effets doux, puis le vrai identifiant TikTok remplace le provisoire', () => {
  const { mergeCatalog, adoptGiftIds } = require('../src/config');
  const { g, calls } = setup();
  // Reconnus par leur nom même avant d'avoir leur vrai identifiant
  g.handleEvent({ type: 'gift', ...B, giftId: '9999', giftName: 'Ice Cream Cone', diamondCount: 1 }, 0);
  assert.deepEqual(calls.coinRain, [2]);
  g.handleEvent({ type: 'gift', ...B, giftId: '5655', giftName: 'Rose', diamondCount: 1 }, 0);
  assert.equal(calls.shake, 1);
  // Le cadeau reçu prend la place de l'entrée provisoire, et la règle suit le vrai identifiant
  const cat = mergeCatalog(g.config.giftCatalog, [{ id: '7934', name: 'Perfume', diamonds: 20, image: 'https://x/p.png' }]);
  assert.ok(!cat.some((x) => x.id === 'nom-perfume'));
  assert.equal(cat.find((x) => x.name === 'Perfume').image, 'https://x/p.png');
  const rules = adoptGiftIds(g.config.giftRules, cat);
  assert.equal(rules.find((r) => r.name === 'Perfume').giftId, '7934');
});

test('en live : chaque cadeau TikTok réel déclenche l\'effet qui lui est lié, autant de fois qu\'envoyé', () => {
  const { mapEvent } = require('../src/tiktok');
  const { g, calls } = setup({ giftRules: [
    { name: 'Rose', giftId: '5655', action: 'shake', param: 1 },
    { name: 'Money Gun', giftId: 'nom-money-gun', action: 'steal', param: 3 },
    { name: 'Galaxy', giftId: 'nom-galaxy', action: 'spawn', param: 'coffre' },
  ] });
  const viewer = (id, name) => ({ id, displayId: name, nickname: name });
  g.handleEvent(mapEvent('join', { user: viewer('1', 'alice') }), 0);
  g.handleEvent(mapEvent('join', { user: viewer('2', 'bob') }), 0);
  g.update(0); // alice joue
  // Format réel (v3) : la série de 3 roses n'est comptée qu'à la fin, 3 fois
  const rose = (end) => ({ user: viewer('2', 'bob'), giftId: '5655', repeatCount: 3, repeatEnd: end, gift: { id: '5655', name: 'Rose', diamondCount: 1, type: 1 } });
  assert.equal(mapEvent('gift', rose(0)), null);
  g.handleEvent(mapEvent('gift', rose(1)), 10);
  assert.equal(calls.shake, 3);
  // Cadeau reconnu par son nom tant que son vrai identifiant n'est pas connu
  g.handleEvent(mapEvent('gift', { user: viewer('2', 'bob'), giftId: '7168', repeatCount: 1, repeatEnd: 1, gift: { id: '7168', name: 'Money Gun', diamondCount: 500, type: 2 } }), 20);
  assert.equal(g.players.get('1').tokens, 2); // 5 - 3 volés
  assert.equal(g.players.get('2').tokens, 8);
  g.handleEvent(mapEvent('gift', { user: viewer('2', 'bob'), giftId: '5269', repeatCount: 1, repeatEnd: 1, gift: { id: '5269', name: 'Galaxy', diamondCount: 1000, type: 2 } }), 30);
  assert.deepEqual(calls.spawn.map((s) => s.key), ['coffre']);
  // Commentaire 2 d'alice : fente du centre ; 100 likes : +5 jetons (réglable)
  assert.equal(g.handleEvent(mapEvent('chat', { user: viewer('1', 'alice'), content: '2' }), 40), 'launch');
  assert.equal(calls.launch[0].slot, 1);
  g.handleEvent(mapEvent('like', { user: viewer('1', 'alice'), count: 60 }), 50);
  g.handleEvent(mapEvent('like', { user: viewer('1', 'alice'), count: 40 }), 60);
  assert.equal(g.players.get('1').tokens, 6); // 2 - 1 lancé + 5
});
