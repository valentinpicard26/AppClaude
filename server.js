'use strict';
// Serveur : moteur de jeu + physique + connecteur TikTok + simulateur, diffusés par Socket.IO
// à la page du jeu (/) et à l'application de contrôle (/control).

const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const { loadConfig, saveConfig, applyConfigPatch } = require('./src/config');
const { Game } = require('./src/game');
const { Machine, STEP_MS, W, D, SLOT_X } = require('./src/machine');
const { TikTokSource } = require('./src/tiktok');
const { Simulator } = require('./src/simulator');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

let config = loadConfig(CONFIG_FILE);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.get('/control', (req, res) => res.sendFile(path.join(__dirname, 'public', 'control.html')));
app.get('/health', (req, res) => res.json({ ok: true }));

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
});

// Reprise après plantage
let restored = false;
try {
  if (fs.existsSync(STATE_FILE)) {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    game.restore(s.game, Date.now());
    restored = machine.restore(s.machine) && machine.objects.size > 0;
    console.log('[état] partie restaurée (en pause) :', game.players.size, 'joueurs');
  }
} catch (e) {
  console.error('[état] restauration impossible :', e.message);
}
if (!restored) machine.prefill();

function saveState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ savedAt: Date.now(), game: game.serialize(), machine: machine.serialize() }));
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {
    console.error('[état] sauvegarde impossible :', e.message);
  }
}
setInterval(saveState, 5000);

// ---------- Sources d'événements ----------
const log = [];
function pushLog(line) {
  log.push({ t: Date.now(), line });
  if (log.length > 60) log.shift();
}
function handleEvent(ev, source) {
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
    if (stepCount % 2 === 0) io.to('display').volatile.emit('snap', machine.snapshot());
  }
  const now = Date.now();
  game.update(now);
  if (game.version !== lastStateVersion || now - lastStateSent > 500) {
    lastStateVersion = game.version;
    lastStateSent = now;
    io.to('display').emit('state', game.publicState(now));
  }
}, 8);

// État pour l'application de contrôle, une fois par seconde
setInterval(() => {
  io.to('control').emit('control:state', controlState());
}, 1000);

function controlState() {
  return {
    config, stats: game.controlStats(), players: game.playersList().slice(0, 100), status: game.status,
    live: tiktok.status, simAuto: sim.auto, log: log.slice(-25), objects: machine.objects.size,
    hasSignKey: !!process.env.TIKTOK_SIGN_API_KEY, passwordSet: !!ADMIN_PASSWORD,
  };
}

function initPayload() {
  return {
    W, D, slotX: SLOT_X,
    items: config.items.map((i) => ({ key: i.key, kind: i.kind, points: i.points, pointsMax: i.pointsMax, color: i.color, label: i.label })),
    sounds: config.sounds,
  };
}

function applyConfig(patch) {
  config = applyConfigPatch(config, patch);
  game.setConfig(config);
  machine.setConfig(config);
  saveConfig(CONFIG_FILE, config);
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
    socket.emit('state', game.publicState(Date.now()));
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
  });
  admin('live:disconnect', () => tiktok.disconnect());
  admin('game:pause', () => game.pause(Date.now()));
  admin('game:resume', () => game.resume(Date.now()));
  admin('game:stop', async () => { await tiktok.disconnect(); sim.setAuto(false); game.pause(Date.now()); });
  admin('game:resetAll', () => { game.reset(); machine.prefill(); saveState(); pushLog('[contrôle] remise à zéro complète'); });
  admin('game:resetLeaderboard', () => { game.resetLeaderboard(); pushLog('[contrôle] classement remis à zéro'); });
  admin('game:refill', () => { machine.prefill(); pushLog('[contrôle] plateau rempli à nouveau'); });
  admin('config:update', (patch) => { applyConfig(patch); });
  admin('config:reset', () => { const { defaultConfig } = require('./src/config'); config = defaultConfig(); applyConfig({}); });
  admin('sim:addViewers', (n) => ({ viewers: sim.addViewers(Math.min(50, Math.max(1, Number(n) || 1))) }));
  admin('sim:event', (ev) => {
    if (!ev || typeof ev !== 'object') throw new Error('Événement invalide');
    return { result: handleEvent({ ...ev, userId: String(ev.userId || '') }, 'simu') };
  });
  admin('sim:auto', (on) => sim.setAuto(!!on));
});

function shutdown() {
  saveState();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, () => {
  console.log(`Pousse-pièces prêt : http://localhost:${PORT}  (contrôle : /control)`);
  if (!ADMIN_PASSWORD) console.log('ATTENTION : ADMIN_PASSWORD non défini, l\'application de contrôle est ouverte à tous.');
});
