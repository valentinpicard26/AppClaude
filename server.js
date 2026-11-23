'use strict';
// Serveur : moteur de jeu + physique + connecteur TikTok + simulateur, diffusés par Socket.IO
// à la page du jeu (/) et à l'application de contrôle (/control).

const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const { loadConfig, saveConfig, applyConfigPatch, mergeCatalog, adoptGiftIds } = require('./src/config');
const { Game } = require('./src/game');
const { Machine, STEP_MS, W, D, SLOT_X } = require('./src/machine');
const { TikTokSource } = require('./src/tiktok');
const { Simulator } = require('./src/simulator');
const { rewardsList } = require('./src/rewards');
const { effectsList } = require('./src/effects');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

let config = loadConfig(CONFIG_FILE);
// Sur un hébergement sans disque (Render gratuit), les réglages sont perdus au redémarrage :
// l'application de contrôle garde une copie et propose de la restaurer quand ce drapeau est faux.
let configCustomized = !!config.fromFile;

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
  // Chaque cadeau reçu enrichit le catalogue (nom, valeur, image), pour pouvoir lui attribuer un effet.
  if (ev.type === 'gift' && ev.giftId && ev.giftName && !config.giftCatalog.some((g) => g.id === String(ev.giftId))) {
    const giftCatalog = mergeCatalog(config.giftCatalog, [{ id: ev.giftId, name: ev.giftName, diamonds: ev.diamondCount, image: ev.giftImage }]);
    config = { ...config, giftCatalog, giftRules: adoptGiftIds(config.giftRules, giftCatalog) };
    game.setConfig(config);
    io.to('display').emit('init', initPayload()); // la liste affichée gagne l'image du cadeau
    if (configCustomized) saveConfig(CONFIG_FILE, config);
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
    for (const e of machine.events.splice(0)) io.to('display').emit('fx', { type: 'spawn', item: e.item, by: null });
    stepCount++;
    perf.steps++;
    if (stepCount % 3 === 0) io.to('display').volatile.emit('snap', machine.snapshot()); // 20 fois par seconde
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
    version: VERSION, simSpeed: perf.simSpeed, cpu: perf.cpu, effects: effectsList(config),
    hasSignKey: !!process.env.TIKTOK_SIGN_API_KEY, passwordSet: !!ADMIN_PASSWORD, configCustomized,
  };
}

function initPayload() {
  return {
    W, D, slotX: SLOT_X,
    items: config.items.map((i) => ({ key: i.key, kind: i.kind, points: i.points, pointsMax: i.pointsMax, color: i.color, label: i.label })),
    sounds: config.sounds, music: config.music, musicVolume: config.musicVolume, sfxVolume: config.sfxVolume,
    leaderVoice: config.leaderVoice,
    showRewards: config.showRewards, rewardsSeconds: config.rewardsSeconds, rewards: rewardsList(config),
  };
}

function applyConfig(patch) {
  config = applyConfigPatch(config, patch);
  configCustomized = true;
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
  admin('gifts:fetch', async (d) => {
    const gifts = await tiktok.fetchGifts(d?.username || config.liveUsername, { signApiKey: process.env.TIKTOK_SIGN_API_KEY });
    if (!gifts.length) throw new Error('TikTok n\'a renvoyé aucun cadeau');
    const giftCatalog = mergeCatalog(config.giftCatalog, gifts);
    applyConfig({ giftCatalog, giftRules: adoptGiftIds(config.giftRules, giftCatalog) });
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
