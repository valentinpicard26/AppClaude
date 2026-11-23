'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FileStore, PgStore, weekKey } = require('../src/store');

test('semaine ISO à l\'heure de Paris (lundi → dimanche)', () => {
  assert.equal(weekKey(new Date('2026-11-23T10:00:00Z')), '2026-W48'); // lundi
  assert.equal(weekKey(new Date('2026-11-29T23:30:00Z')), '2026-W49'); // dimanche 23h30 UTC = lundi 0h30 à Paris (heure d'hiver)
  assert.equal(weekKey(new Date('2026-11-29T22:30:00Z')), '2026-W48'); // dimanche 23h30 à Paris
  assert.equal(weekKey(new Date('2027-01-01T12:00:00Z')), '2026-W53');
});

async function exercise(store) {
  await store.init();
  assert.equal(await store.get('config'), null);
  await store.set('config', { turnSeconds: 9, liste: [1, 2] });
  assert.deepEqual(await store.get('config'), { turnSeconds: 9, liste: [1, 2] });
  await store.set('config', { turnSeconds: 8 });
  assert.deepEqual(await store.get('config'), { turnSeconds: 8 });
  await store.addWeekly('2026-W48', [{ userId: 'a', nickname: 'Alice', points: 100 }, { userId: 'b', nickname: 'Bob', points: 40 }]);
  await store.addWeekly('2026-W48', [{ userId: 'b', nickname: 'Bobby', points: 200 }]);
  await store.addWeekly('2026-W49', [{ userId: 'a', nickname: 'Alice', points: 5 }]);
  assert.deepEqual((await store.topWeekly('2026-W48')).map((x) => [x.nickname, x.points]), [['Bobby', 240], ['Alice', 100]]);
  assert.deepEqual((await store.topWeekly('2026-W49')).map((x) => x.points), [5]);
  await store.resetWeekly('2026-W48');
  assert.deepEqual(await store.topWeekly('2026-W48'), []);
  await store.close();
}

test('sauvegarde dans un fichier : réglages et classement hebdomadaire', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pousse-'));
  await exercise(new FileStore(dir));
  const again = new FileStore(dir); await again.init();
  assert.deepEqual(await again.get('config'), { turnSeconds: 8 }); // relu après « redémarrage »
});

// Lancé seulement si une base de test est fournie (TEST_DATABASE_URL), jamais sur la vraie base.
test('sauvegarde dans Postgres (Neon) : mêmes garanties', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await pool.query('DROP TABLE IF EXISTS kv; DROP TABLE IF EXISTS weekly_scores;');
  await pool.end();
  await exercise(new PgStore(process.env.TEST_DATABASE_URL));
});
