'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Machine, STEP_MS, D, W } = require('../src/machine');
const { defaultConfig } = require('../src/config');

function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

test('le plateau est pré-rempli de jetons et de tickets', () => {
  const m = new Machine(defaultConfig(), { random: rng(1) });
  m.prefill();
  assert.ok(m.countKind('coin') > 50);
  assert.ok(m.countKind('ticket') >= 4);
});

test('un jeton lancé tombe par la bonne fente puis se pose sur le plateau', () => {
  const m = new Machine({ ...defaultConfig(), coinsOnPlate: 0, ticketsOnPlate: 0 }, { random: rng(2) });
  m.prefill();
  const o = m.launch(2, { nickname: 'Alice' });
  assert.ok(o.body.position.x > W * 0.6);
  for (let i = 0; i < 60; i++) m.step(STEP_MS);
  assert.equal(o.landAt, 0);
  assert.ok(o.body.position.y > 0 && o.body.position.y < D);
});

test('l\'accumulation finit par faire tomber des objets par l\'avant, rien ne passe derrière le poussoir', () => {
  const m = new Machine(defaultConfig(), { random: rng(3) });
  m.prefill();
  let front = 0;
  for (let s = 0; s < 60 * 120; s++) {
    if (s % 90 === 0) m.launch(s % 3);
    for (const f of m.step(STEP_MS)) if (!f.side) front++;
    if (s % 30 === 0) {
      const pf = m.pusherFront();
      for (const o of m.objects.values()) if (!o.landAt) assert.ok(o.body.position.y >= pf - 1, 'objet derrière le poussoir');
    }
  }
  assert.ok(front > 10, `seulement ${front} objets tombés`);
  assert.ok(m.objects.size <= m.config.maxObjects);
});

test('la limite d\'objets est respectée', () => {
  const m = new Machine({ ...defaultConfig(), maxObjects: 40 }, { random: rng(4) });
  m.prefill();
  for (let i = 0; i < 100; i++) { m.launch(i % 3); m.step(STEP_MS); }
  assert.ok(m.objects.size <= 40);
});

test('une secousse déplace les objets', () => {
  const m = new Machine(defaultConfig(), { random: rng(5) });
  m.prefill();
  const before = [...m.objects.values()].map((o) => ({ ...o.body.position }));
  m.shake();
  for (let i = 0; i < 20; i++) m.step(STEP_MS);
  const moved = [...m.objects.values()].filter((o, i) => before[i] && Math.hypot(o.body.position.x - before[i].x, o.body.position.y - before[i].y) > 2).length;
  assert.ok(moved > 10);
});

test('un objet bonus apparaît sur le plateau fixe', () => {
  const m = new Machine(defaultConfig(), { random: rng(6) });
  m.prefill();
  const o = m.spawn('coffre', { by: 'Bob' });
  assert.ok(o.body.position.y > m.config.pusherStroke && o.body.position.y < D);
  assert.equal(m.spawn('inconnu'), null);
});

test('sauvegarde et reprise des positions', () => {
  const m = new Machine(defaultConfig(), { random: rng(7) });
  m.prefill();
  const data = JSON.parse(JSON.stringify(m.serialize()));
  const m2 = new Machine(defaultConfig());
  m2.restore(data);
  assert.equal(m2.objects.size, m.objects.size);
});
