'use strict';
// Sauvegarde durable : réglages, état de la partie et classement hebdomadaire.
// - Avec DATABASE_URL (Neon / Postgres) : les données survivent aux redémarrages de Render.
// - Sans : un fichier JSON local (effacé à chaque redémarrage sur l'offre gratuite de Render).

const fs = require('fs');
const path = require('path');

// Semaine ISO (lundi → dimanche) à l'heure du fuseau choisi, ex. « 2026-W48 ».
function weekKey(date = new Date(), timeZone = 'Europe/Paris') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // jeudi de la même semaine
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

class FileStore {
  constructor(dir) {
    this.kind = 'fichier';
    this.file = path.join(dir, 'store.json');
    this.data = { kv: {}, weekly: {} };
  }

  async init() {
    try { if (fs.existsSync(this.file)) this.data = { kv: {}, weekly: {}, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; } catch (e) {
      console.error('[sauvegarde] fichier illisible :', e.message);
    }
  }

  flush() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  async get(key) { return this.data.kv[key] ?? null; }
  async set(key, value) { this.data.kv[key] = value; this.flush(); }

  async addWeekly(week, rows) {
    const w = (this.data.weekly[week] ||= {});
    for (const r of rows) {
      const cur = w[r.userId] || { nickname: r.nickname, points: 0 };
      w[r.userId] = { nickname: r.nickname || cur.nickname, points: cur.points + r.points };
    }
    this.flush();
  }

  async topWeekly(week, n = 5) {
    return Object.entries(this.data.weekly[week] || {}).map(([userId, v]) => ({ userId, ...v }))
      .sort((a, b) => b.points - a.points).slice(0, n);
  }

  async resetWeekly(week) { delete this.data.weekly[week]; this.flush(); }
  async close() {}
}

class PgStore {
  constructor(url) {
    this.kind = 'base de données';
    const { Pool } = require('pg');
    // Neon demande SSL ; le paramètre sslmode de l'adresse est respecté par pg.
    this.pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 15000 });
    this.pool.on('error', (e) => console.error('[sauvegarde] connexion perdue :', e.message));
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS weekly_scores (
        week TEXT NOT NULL,
        user_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        points BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (week, user_id)
      );
      CREATE INDEX IF NOT EXISTS weekly_scores_rank ON weekly_scores (week, points DESC);
    `);
  }

  async get(key) {
    const r = await this.pool.query('SELECT value FROM kv WHERE key = $1', [key]);
    return r.rows[0] ? r.rows[0].value : null;
  }

  async set(key, value) {
    await this.pool.query(
      'INSERT INTO kv (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()',
      [key, JSON.stringify(value)],
    );
  }

  async addWeekly(week, rows) {
    if (!rows.length) return;
    const values = [];
    const params = [];
    rows.forEach((r, i) => {
      values.push(`($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`);
      params.push(week, r.userId, r.nickname, r.points);
    });
    await this.pool.query(
      `INSERT INTO weekly_scores (week, user_id, nickname, points) VALUES ${values.join(', ')}
       ON CONFLICT (week, user_id) DO UPDATE SET points = weekly_scores.points + EXCLUDED.points,
         nickname = EXCLUDED.nickname, updated_at = now()`,
      params,
    );
  }

  async topWeekly(week, n = 5) {
    const r = await this.pool.query(
      'SELECT user_id, nickname, points FROM weekly_scores WHERE week = $1 ORDER BY points DESC, updated_at ASC LIMIT $2', [week, n]);
    return r.rows.map((x) => ({ userId: x.user_id, nickname: x.nickname, points: Number(x.points) }));
  }

  async resetWeekly(week) { await this.pool.query('DELETE FROM weekly_scores WHERE week = $1', [week]); }
  async close() { await this.pool.end(); }
}

function createStore({ databaseUrl, dataDir }) {
  return databaseUrl ? new PgStore(databaseUrl) : new FileStore(dataDir);
}

module.exports = { createStore, FileStore, PgStore, weekKey };
