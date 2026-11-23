'use strict';
// Serveur : moteur de jeu + physique + connecteur TikTok + simulateur, diffusés par Socket.IO
// à la page du jeu (/) et à l'application de contrôle (/control).

const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const { loadConfig, applyConfigPatch, mergeCatalog, defaultConfig } = require('./src/config');
const { createStore, FileStore, weekKey } = require('./src/store');
const { Game } = require('./src/game');
const { Machine, STEP_MS, W, D, SLOT_X } = require('./src/machine');
const { TikTokSource } = require('./src/tiktok');
const { Simulator } = require('./src/simulator');
const { rewardsList } = require('./src/rewards');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

const WEEK_TZ = process.env.WEEK_TIMEZONE || 'Europe/Paris';

// Réglages par défaut au démarrage ; ceux sauvegardés sont chargés dans start().
let config = defaultConfig();
// Faux tant qu'aucun réglage n'a été sauvegardé : l'application de contrôle propose alors
// de restaurer la copie gardée dans le téléphone.
let configCustomized = false;

// Sauvegarde durable : base de données si DATABASE_URL est défini (Neon), sinon fichier local.
let store = createStore({ databaseUrl: process.env.DATABASE_URL, dataDir: DATA_DIR });
const storage = { kind: store.kind, ok: false, error: null, lastSaveAt: 0 };

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });

// Version déployée (Render fournit le commit) : affichée dans le contrôle pour vérifier une mise à jour.
const VERSION = (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || 'local';
// Pages, scripts et styles : toujours revalidés (sinon le téléphone garde l'ancienne version en cache).
// Images : gardées en cache 1 jour.
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, file) {
    if (/\.(png|jpe?g|webp)$/i.test(file)) res.setHeader('Cache-Control', 'public, max-age=86400');
    else res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get('/control', (req, res) => res.sendFile(path.join(__dirname, 'public', 'control.html')));
app.get('/health', (req, res) => res.json({ ok: true, version: VERSION, simSpeed: perf.simSpeed, cpu: perf.cpu }));

// ---------- Moteur ----------
const machine = new Machine(config);
const game = new Game(config, {
  actions: {
    launch: (slot, who) => machine.launch(slot, who),
    shake: () => machine.shake(),
    spawn: (key, opts) => machine.spawn(key, opts),
    coinRain: (n, opts) => machine.coinRain(n, opts),
  },
  onFx: (e) => io.to('display').emit('fx', e),
  onPoints: (p, points) => addWeeklyPoints(p, points),
});

// ---------- Sauvegarde ----------
function storageError(what, e) {
  storage.ok = false;
  storage.error = `${what} : ${String(e?.message || e).slice(0, 200)}`;
  console.error('[sauvegarde]', storage.error);
}

function saveConfig() {
  store.set('config', config).then(() => { storage.ok = true; storage.error = null; storage.lastSaveAt = Date.now(); })
    .catch((e) => storageError('réglages non sauvegardés', e));
}

// État de la partie : sauvegardé seulement s'il a changé (la base Neon peut ainsi s'endormir hors des lives).
let savedVersion = -1;
let saving = false;
async function saveState(force = false) {
  if (saving || (!force && game.version === savedVersion)) return;
  saving = true;
  const version = game.version;
  try {
    await store.set('state', { savedAt: Date.now(), game: game.serialize(), machine: machine.serialize() });
    savedVersion = version;
    storage.ok = true; storage.error = null; storage.lastSaveAt = Date.now();
  } catch (e) {
    storageError('partie non sauvegardée', e);
  } finally {
    saving = false;
  }
}

// Classement hebdomadaire : les points gagnés sont regroupés puis ajoutés en base toutes les 10 s.
const pendingWeekly = new Map();
let weekly = { week: weekKey(new Date(), WEEK_TZ), top: [] };
function addWeeklyPoints(p, points) {
  const cur = pendingWeekly.get(p.id) || { userId: p.id, nickname: p.nickname, points: 0 };
  cur.points += points; cur.nickname = p.nickname;
  pendingWeekly.set(p.id, cur);
}
async function flushWeekly() {
  const week = weekKey(new Date(), WEEK_TZ);
  const rows = [...pendingWeekly.values()];
  pendingWeekly.clear();
  try {
    if (rows.length) await store.addWeekly(week, rows);
    const top = await store.topWeekly(week, 5);
    weekly = { week, top: top.map((x) => ({ nickname: x.nickname, points: x.points })) };
  } catch (e) {
    for (const r of rows) addWeeklyPoints({ id: r.userId, nickname: r.nickname }, r.points); // on réessaiera
    storageError('classement hebdomadaire non sauvegardé', e);
  }
}
// Pour l'affichage : classement de la semaine + points pas encore envoyés en base.
function weeklyView() {
  if (!pendingWeekly.size) return weekly.top;
  const map = new Map(weekly.top.map((x) => [x.nickname, { ...x }]));
  for (const r of pendingWeekly.values()) {
    const cur = map.get(r.nickname) || { nickname: r.nickname, points: 0 };
    cur.points += r.points; map.set(r.nickname, cur);
  }
  return [...map.values()].sort((a, b) => b.points - a.points).slice(0, 5);
}
function publicState(now) { return { ...game.publicState(now), weekly: weeklyView() }; }

// ---------- Sources d'événements ----------
const log = [];
function pushLog(line) {
  log.push({ t: Date.now(), line });
  if (log.length > 60) log.shift();
}
function handleEvent(ev, source) {
  // Chaque cadeau reçu enrichit le catalogue (nom, valeur, image), pour pouvoir lui attribuer un effet.
  if (ev.type === 'gift' && ev.giftId && ev.giftName && !config.giftCatalog.some((g) => g.id === String(ev.giftId))) {
    config = { ...config, giftCatalog: mergeCatalog(config.giftCatalog, [{ id: ev.giftId, name: ev.giftName, diamonds: ev.diamondCount, image: ev.giftImage }]) };
    game.setConfig(config);
    if (configCustomized) saveConfig();
  }
  const res = game.handleEvent(ev, Date.now());
  const what = ev.type === 'chat' ? `"${String(ev.comment).slice(0, 40)}"` : ev.type === 'gift' ? `${ev.giftName || 'cadeau'} (${ev.diamondCount}💎 x${ev.repeatCount || 1})` : ev.type === 'like' ? `${ev.likeCount} likes` : '';
  pushLog(`[${source}] ${ev.nickname || ev.userId} ${ev.type} ${what} → ${res}`);
  return res;
}

const tiktok = new TikTokSource({
  onEvent: (ev) => handleEvent(ev, 'live'),
  onStatus: (s) => { pushLog(`[live] ${s.state}${s.error ? ' : ' + s.error : ''}`); },
  log: (...a) => console.log(...a),
});
const sim = new Simulator({ emit: (ev) => handleEvent(ev, 'simu'), getGame: () => game });

// ---------- Boucle principale (pas fixe de 1/60 s) ----------
let last = performance.now();
let acc = 0;
let stepCount = 0;
let lastStateVersion = -1;
let lastStateSent = 0;
function startLoops() {
setInterval(() => saveState(), 10000);
setInterval(() => flushWeekly(), 10000);
setInterval(() => {
  const nowPerf = performance.now();
  acc = Math.min(acc + (nowPerf - last), 250);
  last = nowPerf;
  const running = game.status === 'running';
  while (acc >= STEP_MS) {
    acc -= STEP_MS;
    if (!running) continue;
    const fallen = machine.step(STEP_MS);
    for (const f of fallen) game.onFall(f, Date.now(), { side: f.side });
    stepCount++;
    perf.steps++;
    if (stepCount % 3 === 0) io.to('display').volatile.emit('snap', machine.snapshot()); // 20 fois par seconde
  }
  const now = Date.now();
  game.update(now);
  if (game.version !== lastStateVersion || now - lastStateSent > 500) {
    lastStateVersion = game.version;
    lastStateSent = now;
    io.to('display').emit('state', publicState(now));
  }
}, 8);

// État pour l'application de contrôle, une fois par seconde
setInterval(() => {
  io.to('control').emit('control:state', controlState());
}, 1000);
}

// Mesures de santé : vitesse de la simulation (1 = temps réel) et charge processeur du serveur.
const perf = { steps: 0, simSpeed: 1, cpu: 0, lastAt: Date.now(), lastCpu: process.cpuUsage() };
setInterval(() => {
  const now = Date.now();
  const cpu = process.cpuUsage(perf.lastCpu);
  const dt = now - perf.lastAt;
  perf.simSpeed = game.status === 'running' ? Math.round((perf.steps * STEP_MS / dt) * 100) / 100 : 1;
  perf.cpu = Math.round(((cpu.user + cpu.system) / 1000 / dt) * 1000) / 10; // % d'un processeur
  perf.steps = 0; perf.lastAt = now; perf.lastCpu = process.cpuUsage();
}, 5000);

function controlState() {
  return {
    config, stats: game.controlStats(), players: game.playersList().slice(0, 100), status: game.status,
    live: tiktok.status, simAuto: sim.auto, log: log.slice(-25), objects: machine.objects.size,
    version: VERSION, simSpeed: perf.simSpeed, cpu: perf.cpu,
    hasSignKey: !!process.env.TIKTOK_SIGN_API_KEY, passwordSet: !!ADMIN_PASSWORD, configCustomized,
    storage: { ...storage }, weekly: { week: weekly.week, top: weeklyView() },
  };
}

function initPayload() {
  return {
    W, D, slotX: SLOT_X,
    items: config.items.map((i) => ({ key: i.key, kind: i.kind, points: i.points, pointsMax: i.pointsMax, color: i.color, label: i.label })),
    sounds: config.sounds, music: config.music, musicVolume: config.musicVolume, sfxVolume: config.sfxVolume,
    showRewards: config.showRewards, rewardsSeconds: config.rewardsSeconds, rewards: rewardsList(config),
  };
}

function applyConfig(patch) {
  config = applyConfigPatch(config, patch);
  configCustomized = true;
  game.setConfig(config);
  machine.setConfig(config);
  saveConfig();
  io.to('display').emit('init', initPayload());
}

// ---------- Sockets ----------
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

io.on('connection', (socket) => {
  socket.on('display:hello', () => {
    socket.join('display');
    socket.emit('init', initPayload());
    socket.emit('state', publicState(Date.now()));
    socket.emit('snap', machine.snapshot());
  });

  socket.on('control:auth', (data, ack) => {
    const ok = !ADMIN_PASSWORD || safeEqual(data?.password || '', ADMIN_PASSWORD);
    if (ok) {
      socket.data.admin = true;
      socket.join('control');
      socket.emit('control:state', controlState());
    }
    if (typeof ack === 'function') ack({ ok });
  });

  // Toutes les commandes suivantes exigent l'authentification.
  const admin = (name, fn) => socket.on(name, async (data, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (!socket.data.admin) return reply({ ok: false, error: 'Non autorisé' });
    try {
      const r = await fn(data);
      reply({ ok: true, ...(r || {}) });
      io.to('control').emit('control:state', controlState());
    } catch (e) {
      reply({ ok: false, error: String(e?.message || e) });
    }
  });

  admin('live:connect', async (d) => {
    applyConfig({ liveUsername: String(d?.username || '').replace(/^@/, '').trim() });
    await tiktok.connect(d?.username, { signApiKey: process.env.TIKTOK_SIGN_API_KEY });
    // Nouveau live (autre salle TikTok que la dernière fois) : on repart avec un classement du live vierge.
    // Le classement de la semaine, lui, est conservé.
    const roomId = tiktok.status.roomId;
    if (roomId && game.sessionRoomId && roomId !== game.sessionRoomId) {
      game.reset();
      pushLog('[live] nouveau live : joueurs et classement du live remis à zéro (classement de la semaine conservé)');
    }
    if (roomId) game.sessionRoomId = roomId;
  });
  admin('live:disconnect', () => tiktok.disconnect());
  admin('game:pause', () => game.pause(Date.now()));
  admin('game:resume', () => game.resume(Date.now()));
  admin('game:stop', async () => { await tiktok.disconnect(); sim.setAuto(false); game.pause(Date.now()); });
  admin('game:resetAll', async () => { game.reset(); machine.prefill(); await saveState(true); pushLog('[contrôle] remise à zéro complète'); });
  admin('game:resetLeaderboard', () => { game.resetLeaderboard(); pushLog('[contrôle] classement remis à zéro'); });
  admin('game:resetWeekly', async () => {
    pendingWeekly.clear();
    await store.resetWeekly(weekKey(new Date(), WEEK_TZ));
    await flushWeekly();
    pushLog('[contrôle] classement de la semaine remis à zéro');
  });
  admin('game:refill', () => { machine.prefill(); pushLog('[contrôle] plateau rempli à nouveau'); });
  admin('config:update', (patch) => { applyConfig(patch); });
  admin('config:reset', () => { config = defaultConfig(); applyConfig({}); });
  admin('gifts:fetch', async (d) => {
    const gifts = await tiktok.fetchGifts(d?.username || config.liveUsername, { signApiKey: process.env.TIKTOK_SIGN_API_KEY });
    if (!gifts.length) throw new Error('TikTok n\'a renvoyé aucun cadeau');
    applyConfig({ giftCatalog: mergeCatalog(config.giftCatalog, gifts) });
    pushLog(`[contrôle] ${gifts.length} cadeaux chargés depuis TikTok`);
    return { count: gifts.length };
  });
  admin('sim:addViewers', (n) => ({ viewers: sim.addViewers(Math.min(50, Math.max(1, Number(n) || 1))) }));
  admin('sim:event', (ev) => {
    if (!ev || typeof ev !== 'object') throw new Error('Événement invalide');
    return { result: handleEvent({ ...ev, userId: String(ev.userId || '') }, 'simu') };
  });
  admin('sim:auto', (on) => sim.setAuto(!!on));
});

// Arrêt (redémarrage ou mise en veille de Render) : dernière sauvegarde, 8 s maximum.
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const timer = setTimeout(() => process.exit(0), 8000);
  try { await Promise.all([saveState(true), flushWeekly()]); await store.close(); } catch { /* on s'arrête quand même */ }
  clearTimeout(timer);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ---------- Démarrage : charge la sauvegarde, puis lance le jeu ----------
async function start() {
  try {
    await store.init();
    storage.ok = true;
  } catch (e) {
    storageError('base de données injoignable, sauvegarde dans un fichier local à la place', e);
    store = new FileStore(DATA_DIR);
    storage.kind = store.kind;
    storage.fallback = storage.error; // reste affiché dans le contrôle
    await store.init();
  }
  // Réglages : base de données, sinon ancien fichier config.json (migration), sinon valeurs par défaut.
  try {
    let saved = await store.get('config');
    if (!saved && fs.existsSync(CONFIG_FILE)) saved = loadConfig(CONFIG_FILE);
    if (saved) { config = applyConfigPatch(defaultConfig(), saved); configCustomized = true; }
  } catch (e) { storageError('réglages illisibles', e); }
  game.setConfig(config);
  machine.setConfig(config);

  // Reprise après plantage ou redémarrage : joueurs et plateau, partie remise en pause.
  let restored = false;
  try {
    let s = await store.get('state');
    if (!s && fs.existsSync(STATE_FILE)) s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (s) {
      game.restore(s.game, Date.now());
      restored = machine.restore(s.machine) && machine.objects.size > 0;
      savedVersion = game.version;
      console.log('[état] partie restaurée (en pause) :', game.players.size, 'joueurs');
    }
  } catch (e) { storageError('partie illisible', e); }
  if (!restored) machine.prefill();
  await flushWeekly();

  startLoops();
  server.listen(PORT, () => {
    console.log(`Pousse-pièces prêt : http://localhost:${PORT}  (contrôle : /control) — sauvegarde : ${storage.kind}`);
    if (!ADMIN_PASSWORD) console.log('ATTENTION : ADMIN_PASSWORD non défini, l\'application de contrôle est ouverte à tous.');
  });
}
start();
