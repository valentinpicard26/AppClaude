'use strict';
/* Page du jeu : affiche la machine, interpole les positions envoyées par le serveur, joue les effets. */
(() => {
  // ---------- Géométrie du décor (en pixels de l'image machine.jpg) ----------
  const IW = 941, IH = 1672;
  const BACK_Y = 834, BACK_HALF = 318;   // bord arrière du plateau fixe
  const FRONT_Y = 1262, FRONT_HALF = 448; // bord avant (lèvre)
  const CX = 470;
  const SLOT_SCREEN = [[255, 488], [470, 488], [685, 488]];
  const BAC_Y = 1430;
  const SQUASH = 0.52; // aplatissement des objets posés à plat (angle de vue)

  let W = 300, D = 400;
  let items = {};
  let sounds = true;

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);

  // ---------- Images ----------
  const img = {};
  for (const n of ['machine.jpg', 'pusher.png', 'coin.png']) {
    const i = new Image(); i.src = 'assets/' + n; img[n] = i;
  }
  // Images des objets, par clé d'objet (indépendant des points, qui sont réglables)
  const ITEM_FILES = {
    ticket20: 'ticket_20.png', ticket40: 'ticket_40.png', ticket60: 'ticket_60.png', ticket80: 'ticket_80.png', ticket100: 'ticket_100.png',
    diamant: 'diamant.png', rubis: 'rubis.png', emeraude: 'emeraude.png', amethyste: 'amethyste.png', topaze: 'topaze.png',
    cristal: 'cristal.png', coffre: 'coffre.png',
  };
  const itemImg = {};
  for (const [key, file] of Object.entries(ITEM_FILES)) {
    const i = new Image();
    i.onerror = () => { i.failed = true; buildSprites(); }; // image absente : dessin de remplacement
    i.src = 'assets/' + file; itemImg[key] = i;
  }
  const sprites = {}; // sprites générés (tickets sans image, gemmes, coffre)

  // ---------- Mise en page ----------
  let view = { s: 1, ox: 0, oy: 0 };
  let dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = window.innerWidth, ch = window.innerHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    const s = Math.min(cw / IW, ch / IH);
    view = { s, ox: (cw - IW * s) / 2, oy: (ch - IH * s) / 2 };
    const r = document.documentElement.style;
    r.setProperty('--mx', view.ox + 'px'); r.setProperty('--my', view.oy + 'px');
    r.setProperty('--mw', IW * s + 'px'); r.setProperty('--mh', IH * s + 'px');
  }
  window.addEventListener('resize', resize);
  resize();

  // Projection plateau (x, y en unités de simulation) -> écran (pixels image), avec perspective.
  function proj(x, y) {
    const t = Math.max(-0.6, Math.min(1.15, y / D));
    const g = (t + 0.2 * t * t) / 1.2;
    const half = BACK_HALF + (FRONT_HALF - BACK_HALF) * t;
    return { x: CX + (x / W - 0.5) * 2 * half, y: BACK_Y + (FRONT_Y - BACK_Y) * g, k: (2 * half) / W };
  }

  // ---------- Réseau ----------
  const socket = io({ transports: ['websocket', 'polling'] });
  const snaps = []; // { t, p, s, o: Map }
  let lastRecv = 0, lastT = 0, jitter = 60;
  let state = null;
  socket.on('connect', () => { $('offline').classList.add('hidden'); socket.emit('display:hello'); });
  socket.on('disconnect', () => $('offline').classList.remove('hidden'));
  socket.on('init', (d) => {
    W = d.W; D = d.D; sounds = d.sounds;
    window.TPAudio.setOptions({ sounds: d.sounds, music: d.music, musicVolume: d.musicVolume, sfxVolume: d.sfxVolume });
    rewards = { show: d.showRewards !== false, seconds: d.rewardsSeconds || 4, list: d.rewards || [] };
    items = {}; for (const it of d.items) items[it.key] = it;
    buildSprites();
  });
  socket.on('snap', (s) => {
    const map = new Map();
    for (const o of s.o) map.set(o[0], { id: o[0], key: o[1], x: o[2], y: o[3], a: o[4], air: o[5], label: o[6] });
    if (snaps.length && s.t < snaps[snaps.length - 1].t) snaps.length = 0; // remise à zéro de l'horloge
    snaps.push({ t: s.t, p: s.p, s: s.s, o: map });
    if (snaps.length > 20) snaps.shift();
    // Sur un petit serveur, les positions arrivent par paquets : on mesure l'écart entre deux arrivées
    // et on affiche avec un léger retard adapté, pour que le mouvement reste fluide au lieu de sauter.
    const nowR = performance.now();
    if (lastRecv) { const gap = nowR - lastRecv; jitter = Math.max(gap, jitter * 0.995); }
    lastRecv = nowR; lastT = s.t;
  });
  socket.on('state', (s) => { state = s; renderHud(); });
  socket.on('fx', onFx);

  // ---------- Sprites dessinés ----------
  function buildSprites() {
    for (const it of Object.values(items)) {
      if (itemImg[it.key] && !itemImg[it.key].failed) { sprites[it.key] = itemImg[it.key]; continue; }
      // Sans image fournie : dessin de remplacement
      if (it.kind === 'ticket') sprites[it.key] = drawTicket(it);
      if (it.kind === 'gem') sprites[it.key] = drawGem(it.color);
      if (it.kind === 'chest') sprites[it.key] = drawChest();
    }
  }
  function off(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
    return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  }
  function ticketPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h * 0.36); c.arc(x + w, y + h / 2, h * 0.14, -Math.PI / 2, Math.PI / 2, true);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + h * 0.64); c.arc(x, y + h / 2, h * 0.14, Math.PI / 2, -Math.PI / 2, true);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function drawTicket(it) {
    const c = off(260, 146), g = c.getContext('2d');
    const col = it.color === '#ffffff' ? '#e9e9ff' : it.color;
    g.shadowColor = col; g.shadowBlur = 10;
    ticketPath(g, 8, 8, 244, 130, 14);
    const gr = g.createLinearGradient(0, 8, 0, 138);
    gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.15, '#ffd34d'); gr.addColorStop(1, '#c98a00');
    g.fillStyle = gr; g.fill(); g.shadowBlur = 0;
    ticketPath(g, 22, 20, 216, 106, 10);
    const gi = g.createLinearGradient(0, 20, 0, 126);
    if (it.color === '#ffffff') { gi.addColorStop(0, '#ff6b6b'); gi.addColorStop(0.33, '#ffd84d'); gi.addColorStop(0.66, '#4dd2ff'); gi.addColorStop(1, '#b06bff'); }
    else { gi.addColorStop(0, shade(col, 0.35)); gi.addColorStop(1, shade(col, -0.25)); }
    g.fillStyle = gi; g.fill();
    g.strokeStyle = shade(col === '#e9e9ff' ? '#c98a00' : col, -0.45); g.lineWidth = 3; g.stroke();
    g.fillStyle = '#2a0a00'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 58px Arial Black, Arial, sans-serif'; g.fillText(String(it.points), 130, 62);
    g.font = '900 30px Arial Black, Arial, sans-serif'; g.fillText('PTS', 130, 106);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [sx, sy] of [[48, 52], [212, 52], [48, 98], [212, 98]]) star(g, sx, sy, 9);
    return c;
  }
  function star(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }
  function drawGem(color) {
    const c = off(160, 160), g = c.getContext('2d');
    const base = color === 'rainbow' ? null : color;
    const fill = (y0, y1, f) => {
      const gr = g.createLinearGradient(20, y0, 140, y1);
      if (!base) { ['#ff5d5d', '#ffd34d', '#5dff9a', '#5dc8ff', '#c65dff'].forEach((cc, i) => gr.addColorStop(i / 4, cc)); }
      else { gr.addColorStop(0, shade(base, 0.6 * f)); gr.addColorStop(1, shade(base, -0.35)); }
      return gr;
    };
    g.shadowColor = base || '#fff'; g.shadowBlur = 22;
    // couronne
    g.beginPath(); g.moveTo(30, 62); g.lineTo(52, 32); g.lineTo(108, 32); g.lineTo(130, 62); g.closePath();
    g.fillStyle = fill(30, 62, 1); g.fill(); g.shadowBlur = 0;
    // pavillon
    g.beginPath(); g.moveTo(30, 62); g.lineTo(130, 62); g.lineTo(80, 136); g.closePath(); g.fillStyle = fill(62, 136, 0.3); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(30, 62); g.lineTo(130, 62); g.moveTo(52, 32); g.lineTo(64, 62); g.lineTo(80, 136); g.lineTo(96, 62); g.lineTo(108, 32);
    g.moveTo(80, 32); g.lineTo(64, 62); g.moveTo(80, 32); g.lineTo(96, 62); g.stroke();
    g.beginPath(); g.moveTo(30, 62); g.lineTo(52, 32); g.lineTo(108, 32); g.lineTo(130, 62); g.lineTo(80, 136); g.closePath(); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.9)'; star(g, 60, 42, 7);
    return c;
  }
  function drawChest() {
    const c = off(180, 160), g = c.getContext('2d');
    g.shadowColor = '#ffd34d'; g.shadowBlur = 24;
    const wood = g.createLinearGradient(0, 60, 0, 150); wood.addColorStop(0, '#b0601e'); wood.addColorStop(1, '#5a2a08');
    g.fillStyle = wood; g.fillRect(20, 70, 140, 76); g.shadowBlur = 0;
    const lid = g.createLinearGradient(0, 22, 0, 72); lid.addColorStop(0, '#d27a2c'); lid.addColorStop(1, '#7a3a0c');
    g.beginPath(); g.moveTo(20, 72); g.lineTo(20, 50); g.quadraticCurveTo(90, 4, 160, 50); g.lineTo(160, 72); g.closePath(); g.fillStyle = lid; g.fill();
    g.fillStyle = '#ffcf3a';
    for (const x of [20, 72, 108, 150]) g.fillRect(x - (x === 20 ? 0 : 0), 30, 10, 116);
    g.fillRect(20, 66, 140, 9); g.fillRect(20, 138, 140, 8);
    g.beginPath(); g.arc(90, 92, 15, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5a2a08'; g.font = '900 24px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 90, 93);
    g.strokeStyle = '#3a1500'; g.lineWidth = 3; g.strokeRect(20, 70, 140, 76);
    return c;
  }

  // ---------- Effets ----------
  const floats = []; // textes de gains
  const drops = [];  // objets qui tombent dans le bac ou par les côtés
  const parts = [];  // étincelles
  let shakeUntil = 0;
  let flash = null; // { color, t0, dur } : éclair coloré sur le plateau pour les pouvoirs
  const lastPos = new Map();

  function onFx(e) {
    switch (e.type) {
      case 'fall': {
        const lp = lastPos.get(e.id);
        drops.push({ key: e.item, x: lp ? lp.x : e.x ?? W / 2, a: lp ? lp.a : 0, t0: performance.now(), side: false });
        const big = e.points >= 500;
        const p = proj(e.x ?? W / 2, D);
        floats.push({ x: Math.max(130, Math.min(IW - 130, p.x)), y: FRONT_Y - 30, t0: performance.now(), text: '+' + fmt(e.points), who: e.player ? '@' + e.player : '', big });
        if (big) burst(p.x, FRONT_Y - 40, 40);
        sfx(big ? 'big' : 'fall');
        break;
      }
      case 'lost': {
        const lp = lastPos.get(e.id);
        drops.push({ key: e.item, x: e.x, a: lp ? lp.a : 0, t0: performance.now(), side: true, y: lp ? lp.y : D * 0.85 });
        break;
      }
      case 'launch': {
        sfx('launch');
        setTimeout(() => sfx('land'), 450); // le jeton se pose sur le plateau
        const n = state?.commands || ['1', '2', '3'];
        if (e.deviatedFrom !== null && e.deviatedFrom !== undefined) {
          announce(`↪️ Jeton dévié : fente ${n[e.deviatedFrom]} → ${n[e.slot]}&nbsp;!`, 'red');
          swerve = { from: e.deviatedFrom, to: e.slot, t0: performance.now() };
        }
        if (e.jinx) { shakeUntil = performance.now() + 900; sfx('shake'); flashOn('rgba(255,60,40,0.35)', 700); }
        break;
      }
      case 'power': {
        const t = '@' + e.target, b = '@' + e.by;
        const msg = {
          jinxShake: `🌪️ ${b} piège le lancer de ${t}&nbsp;!`,
          deviate: `↪️ ${b} va dévier le jeton de ${t}&nbsp;!`,
          loseTokens: e.amount ? `💥 ${t} perd ${e.amount} jeton${e.amount > 1 ? 's' : ''} (${b})` : `💥 ${b} attaque ${t}, qui garde son dernier jeton`,
          steal: e.amount ? `🦹 ${b} vole ${e.amount} jeton${e.amount > 1 ? 's' : ''} à ${t}&nbsp;!` : `🦹 ${b} tente de voler ${t}, qui garde son dernier jeton`,
        }[e.kind];
        if (msg) announce(msg, 'red');
        flashOn(e.kind === 'steal' ? 'rgba(150,40,255,0.35)' : e.kind === 'deviate' ? 'rgba(40,160,255,0.3)' : 'rgba(255,40,60,0.35)', 600);
        sfx('power');
        break;
      }
      case 'shield': announce(`🛡️ @${e.player} est protégé·e ${e.seconds}&nbsp;s&nbsp;!`, 'shield'); sfx('shield'); break;
      case 'blocked': announce(`🛡️ Bloqué ! @${e.target} est protégé·e`, 'shield'); flashOn('rgba(255,211,77,0.35)', 600); sfx('shield'); break;
      case 'pending': tick(`⏳ Pouvoir de @${e.by} en attente pour ${e.target ? '@' + e.target : 'le prochain joueur'}`); break;
      case 'peaceful': tick(`🕊️ Mode paisible : pouvoir de @${e.by} désactivé`); break;
      case 'shake': shakeUntil = performance.now() + 600; tick(`🌹 Secousse offerte par @${e.by}`); sfx('shake'); break;
      case 'spawn': announce(`🎁 @${e.by} fait apparaître : ${items[e.item]?.label || e.item}&nbsp;!`); sfx('big'); break;
      case 'coinRain': announce(`🪙 Pluie de jetons offerte par @${e.by}&nbsp;!`); break;
      case 'queueSkip': tick(`⚡ @${e.player} passe en position ${e.position}`); break;
      case 'tokens':
        // Gain de jetons bien visible : likes et abonnement
        if (e.reason !== 'arrivée') {
          const why = e.reason === 'likes' ? '❤️ likes' : e.reason === 'abonnement' ? '➕ abonnement' : e.reason;
          announce(e.gained > 0 ? `🪙 +${e.gained} jetons pour @${e.player} (${why})` : `🪙 @${e.player} a déjà le maximum de jetons`, 'tokens');
          sfx('turn');
        }
        break;
      case 'join': tick(`👋 @${e.player} rejoint la partie`); break;
      case 'turn': sfx('turn'); break;
      default: break;
    }
  }
  function fmt(n) { return Number(n).toLocaleString('fr-FR'); }
  function burst(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 6;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, t0: performance.now(), life: 700 + Math.random() * 600, c: Math.random() < 0.5 ? '#ffd34d' : '#ff4d5e' });
    }
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function tick(text) {
    const box = $('ticker');
    const el = document.createElement('div'); el.className = 'tick'; el.textContent = text;
    box.prepend(el); box.appendChild(document.createElement('br'));
    while (box.querySelectorAll('.tick').length > 2) { const last = box.querySelectorAll('.tick'); last[last.length - 1].remove(); }
    box.querySelectorAll('br').forEach((b, i) => { if (i >= box.querySelectorAll('.tick').length) b.remove(); });
    setTimeout(() => el.classList.add('out'), 3000);
    setTimeout(() => el.remove(), 3600);
  }
  function announce(html, cls = '') {
    const box = $('announce');
    const parts = html.split('&nbsp;');
    box.innerHTML = '';
    const el = document.createElement('div'); el.className = 'ann ' + cls;
    el.textContent = parts.join(' ');
    box.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 3200);
  }

  // ---------- Récompenses : « tel cadeau → tel effet », en rotation en bas de l'écran ----------
  let rewards = { show: true, seconds: 4, list: [] };
  let rwIndex = 0;
  const RW_ITEM_IMG = { ...ITEM_FILES };
  function rewardLines() {
    const base = [];
    if (state) {
      base.push({ html: `<span class="rw-gift">❤️ ${state.likesPerRefill} likes</span><span class="rw-arrow">→</span><span class="rw-eff">🪙 ${state.tokensPerLikeRefill} jetons</span>` });
      base.push({ html: '<span class="rw-gift">➕ Abonne-toi</span><span class="rw-arrow">→</span><span class="rw-eff">🪙 ${state.followTokens} jetons</span>' });
      if (state.peaceful) base.push({ html: '<span class="rw-eff">🕊️ Mode paisible : aucun pouvoir contre les joueurs</span>' });
    }
    if (!rewards.show) return base;
    const gifts = rewards.list.map((r) => {
      const gImg = r.image ? `<img class="rw-img" src="${esc(r.image)}" alt="" referrerpolicy="no-referrer">` : '🎁';
      const iImg = r.item && RW_ITEM_IMG[r.item] ? `<img class="rw-img" src="assets/${RW_ITEM_IMG[r.item]}" alt="">` : r.icon;
      const cost = r.cost ? ` <small>${esc(r.cost)}</small>` : '';
      return { html: `<span class="rw-gift">${gImg} ${esc(r.gift === 'Cadeau' && r.cost ? 'Cadeau' : r.gift)}${cost}</span><span class="rw-arrow">→</span><span class="rw-eff">${iImg} ${esc(r.text)}</span>` };
    });
    return [...base, ...gifts];
  }
  function nextReward() {
    const lines = rewardLines();
    const el = $('rw-line');
    if (!lines.length) { el.innerHTML = ''; return; }
    rwIndex = rwIndex % lines.length;
    el.classList.add('out');
    setTimeout(() => {
      const fresh = el.cloneNode(false); fresh.className = '';
      fresh.innerHTML = lines[rwIndex].html;
      el.replaceWith(fresh);
      rwIndex++;
    }, 300);
    setTimeout(nextReward, (rewards.seconds || 4) * 1000);
  }
  setTimeout(nextReward, 1500);

  // ---------- Sons : voir audio.js (synthétisés, donc originaux) ----------
  function sfx(kind) { window.TPAudio.sfx(kind); }

  // ---------- Interface (HTML) ----------
  function renderHud() {
    if (!state) return;
    const t = state.turn;
    $('turn').classList.toggle('hidden', !t);
    if (t) {
      $('turn-name').textContent = '@' + t.nickname;
      const marks = (t.shieldMs > 0 ? `🛡️${Math.ceil(t.shieldMs / 1000)}s ` : '') + (t.jinx ? '🌪️ ' : '') + (t.deviate ? '↪️ ' : '');
      $('turn-tokens').textContent = `${marks}🪙 ${t.tokens}`;
      $('turn-hint').textContent = t.phase === 'aim' ? `Écris ${state.commands[0]}, ${state.commands[1]} ou ${state.commands[2]}` : 'Jeton lancé !';
    }
    const idle = !t && state.queueLength === 0 && state.status === 'running';
    $('idle').classList.toggle('hidden', !idle);
    $('idle-tokens').textContent = state.startTokens;
    $('idle-cmds').textContent = `${state.commands[0]}, ${state.commands[1]} ou ${state.commands[2]}`;
    $('paused').classList.toggle('hidden', state.status !== 'paused');
    $('board-list').innerHTML = state.leaderboard.length
      ? state.leaderboard.map((p, i) => `<li><span class="n">${i + 1}. ${esc(p.nickname)}</span><span class="v">${fmt(p.points)}</span></li>`).join('')
      : '<li><span class="n">Pas encore de points</span></li>';
    const roster = state.roster || [];
    let pos = 0;
    $('queue-list').innerHTML = roster.length
      ? roster.map((p) => {
        const mark = p.current ? '▶ ' : p.empty ? '' : `${++pos}. `;
        const cls = [p.current ? 'cur' : '', p.boosted ? 'boost' : '', p.empty ? 'empty' : ''].join(' ');
        return `<li class="${cls}"><span class="n">${mark}${p.shield ? '🛡️' : ''}${esc(p.nickname)}</span><span class="v">🪙 ${p.tokens}</span></li>`;
      }).join('')
      : '<li><span class="n">Personne</span></li>';
    $('queue-n').textContent = state.queueLength + (state.turn ? 1 : 0) > roster.length ? `(${state.queueLength + (state.turn ? 1 : 0)})` : '';

    turnClock = { at: performance.now(), remaining: t ? t.remainingMs : 0, total: t ? t.totalMs : 1, phase: t?.phase, paused: state.status === 'paused' };
  }
  let turnClock = null;
  function updateTurnBar() {
    if (!turnClock || !state?.turn) return;
    const rem = turnClock.phase === 'aim' ? Math.max(0, turnClock.remaining - (turnClock.paused ? 0 : performance.now() - turnClock.at)) : 0;
    $('turn-bar').style.transform = `scaleX(${rem / turnClock.total})`;
    $('turn-count').textContent = turnClock.phase === 'aim' ? Math.ceil(rem / 1000) : '✓';
    $('turn').classList.toggle('urgent', turnClock.phase === 'aim' && rem < 3000);
  }

  // ---------- Rendu ----------
  function interp() {
    if (!snaps.length) return null;
    const est = lastT + (performance.now() - lastRecv);
    const rt = est - Math.min(400, Math.max(70, jitter + 30));
    let a = snaps[0], b = snaps[snaps.length - 1];
    for (let i = snaps.length - 1; i > 0; i--) { if (snaps[i - 1].t <= rt) { a = snaps[i - 1]; b = snaps[i]; break; } }
    const span = b.t - a.t;
    const f = span > 0 ? Math.max(0, Math.min(1, (rt - a.t) / span)) : 1;
    const list = [];
    for (const ob of b.o.values()) {
      const oa = a.o.get(ob.id);
      if (oa) {
        let da = ob.a - oa.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
        list.push({ ...ob, x: oa.x + (ob.x - oa.x) * f, y: oa.y + (ob.y - oa.y) * f, a: oa.a + da * f, air: oa.air + (ob.air - oa.air) * f });
      } else list.push(ob);
    }
    return { p: a.p + (b.p - a.p) * f, s: b.s, list };
  }

  function drawItem(key, x, y, a, scale, alpha = 1) {
    const it = items[key]; if (!it) return;
    const p = proj(x, y);
    const k = p.k * scale;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(p.x, p.y);
    if (it.kind === 'coin') {
      const d = 30 * k;
      ctx.drawImage(img['coin.png'], -d / 2, -d * 0.34, d, d * 0.68);
    } else if (it.kind === 'ticket') {
      const s = sprites[key]; const w = 48 * k, h = w * (s && s.width ? s.height / s.width : 146 / 260);
      ctx.scale(1, SQUASH); ctx.rotate(a);
      if (s) ctx.drawImage(s, -w / 2, -h / 2, w, h);
    } else if (it.kind === 'gem') {
      const s = sprites[key]; const w = 40 * k;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, w * 0.12, w * 0.4, w * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      const h = s && s.width ? w * s.height / s.width : w;
      if (s) ctx.drawImage(s, -w / 2, -h * 0.85, w, h);
    } else if (it.kind === 'chest') {
      const s = sprites[key]; const w = 50 * k;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, w * 0.1, w * 0.48, w * 0.14, 0, 0, Math.PI * 2); ctx.fill();
      const h = s && s.width ? w * s.height / s.width : w * 160 / 180;
      if (s) ctx.drawImage(s, -w / 2, -h * 0.9, w, h);
    }
    ctx.restore();
  }

  function drawAirItem(o) {
    // L'objet descend depuis la fente (jeton) ou depuis le haut (objet bonus).
    const it = items[o.key]; if (!it) return;
    const land = proj(o.x, o.y);
    let sx, sy;
    if (it.kind === 'coin') {
      let best = 0; let bd = 1e9;
      SLOT_SCREEN.forEach((s, i) => { const d = Math.abs(s[0] - land.x); if (d < bd) { bd = d; best = i; } });
      [sx, sy] = SLOT_SCREEN[best];
    } else { sx = land.x; sy = land.y - 520; }
    const e = o.air * o.air; // accélère en tombant
    const x = land.x + (sx - land.x) * e, y = land.y + (sy - land.y) * e;
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - o.air)})`;
    ctx.beginPath(); ctx.ellipse(land.x, land.y + 4, 14 * land.k, 5 * land.k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(x, y);
    if (it.kind === 'coin') {
      const d = 30 * land.k; const spin = Math.abs(Math.cos(o.air * 9));
      ctx.drawImage(img['coin.png'], -d / 2, -d * 0.5 * (0.25 + 0.75 * spin), d, d * (0.25 + 0.75 * spin));
    } else {
      ctx.translate(-land.x, -land.y);
      drawItem(o.key, o.x, o.y, o.a, 1.25);
    }
    ctx.restore();
  }

  function label(o) {
    if (!o.label) return;
    const p = proj(o.x, o.y);
    const text = '@' + o.label;
    ctx.save();
    ctx.font = '800 22px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 16;
    const y = p.y - 34 - (o.air ? o.air * 30 : 0);
    ctx.fillStyle = 'rgba(30,0,8,0.85)'; ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2;
    roundRect(p.x - w / 2, y - 15, w, 30, 15); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, p.x, y + 1);
    ctx.restore();
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function drawPusher(pf) {
    const pi = img['pusher.png']; if (!pi.complete) return;
    const front = proj(0, pf), frontR = proj(W, pf);
    const w = (frontR.x - front.x) * 1.04;
    const h = w * pi.height / pi.width * 0.85;
    ctx.drawImage(pi, CX - w / 2, front.y - h + 4, w, h);
  }

  function drawSlotNumbers(now) {
    if (!state?.turn || state.turn.phase !== 'aim') return;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    SLOT_SCREEN.forEach(([x, y], i) => {
      const pulse = 1 + 0.08 * Math.sin(now / 160 + i);
      ctx.font = `900 ${Math.round(54 * pulse)}px Arial Black, Arial`;
      ctx.lineWidth = 8; ctx.strokeStyle = '#3a0008'; ctx.strokeText(state.commands[i], x, y + 118);
      ctx.fillStyle = '#ffd34d'; ctx.fillText(state.commands[i], x, y + 118);
    });
    ctx.restore();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const snap = interp();
    let sx = 0, sy = 0;
    if ((snap && snap.s) || now < shakeUntil) { sx = (Math.random() - 0.5) * 14; sy = (Math.random() - 0.5) * 8; }
    ctx.setTransform(view.s * dpr, 0, 0, view.s * dpr, (view.ox) * dpr, (view.oy) * dpr);
    if (img['machine.jpg'].complete) ctx.drawImage(img['machine.jpg'], 0, 0, IW, IH);
    ctx.translate(sx, sy);
    drawSlotNumbers(now);

    if (snap) {
      // Le poussoir et ce qui est posé dessus sont masqués hors du plateau
      ctx.save();
      ctx.beginPath(); ctx.moveTo(CX - BACK_HALF - 6, 600); ctx.lineTo(CX + BACK_HALF + 6, 600);
      ctx.lineTo(CX + FRONT_HALF + 30, FRONT_Y + 60); ctx.lineTo(CX - FRONT_HALF - 30, FRONT_Y + 60); ctx.closePath(); ctx.clip();
      drawPusher(snap.p);
      ctx.restore();

      const grounded = snap.list.filter((o) => !o.air).sort((a, b) => a.y - b.y);
      lastPos.clear();
      for (const o of snap.list) lastPos.set(o.id, o);
      for (const o of grounded) drawItem(o.key, o.x, o.y, o.a, 1);
      for (const o of snap.list) if (o.air) drawAirItem(o);
      for (const o of snap.list) label(o);
    }

    // Objets qui tombent
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]; const t = (now - d.t0) / 550;
      if (t >= 1) { drops.splice(i, 1); continue; }
      if (d.side) drawItem(d.key, d.x < W / 2 ? d.x - t * 40 : d.x + t * 40, d.y + t * 30, d.a, 1 - t * 0.5, 1 - t);
      else {
        const p = proj(d.x, D + 4);
        ctx.save(); ctx.globalAlpha = 1 - t;
        ctx.translate(0, t * t * (BAC_Y - p.y));
        drawItem(d.key, d.x, D + 4, d.a, 1 - t * 0.3);
        ctx.restore();
      }
    }
    // Étincelles
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; const t = (now - p.t0) / p.life;
      if (t >= 1) { parts.splice(i, 1); continue; }
      p.x += p.vx; p.y += p.vy; p.vy += 0.25;
      ctx.globalAlpha = 1 - t; ctx.fillStyle = p.c; ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
    // Gains
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]; const t = (now - f.t0) / (f.big ? 2600 : 1600);
      if (t >= 1) { floats.splice(i, 1); continue; }
      const y = f.y - t * (f.big ? 220 : 130);
      ctx.save(); ctx.globalAlpha = t > 0.75 ? (1 - t) * 4 : 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const size = f.big ? 74 : 46;
      ctx.font = `900 ${size}px Arial Black, Arial`;
      ctx.lineWidth = 9; ctx.strokeStyle = '#3a0008'; ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = f.big ? '#fff36b' : '#ffd34d'; ctx.fillText(f.text, f.x, y);
      if (f.who) {
        ctx.font = '800 26px system-ui, sans-serif'; ctx.lineWidth = 6; ctx.strokeText(f.who, f.x, y + size * 0.72);
        ctx.fillStyle = '#fff'; ctx.fillText(f.who, f.x, y + size * 0.72);
      }
      ctx.restore();
    }
    // Éclair coloré des pouvoirs, flèche du jeton dévié
    if (flash) {
      const t = (now - flash.t0) / flash.dur;
      if (t >= 1) flash = null;
      else {
        ctx.save(); ctx.globalAlpha = 1 - t; ctx.fillStyle = flash.color;
        ctx.beginPath(); ctx.moveTo(CX - BACK_HALF, BACK_Y - 240); ctx.lineTo(CX + BACK_HALF, BACK_Y - 240);
        ctx.lineTo(CX + FRONT_HALF, FRONT_Y); ctx.lineTo(CX - FRONT_HALF, FRONT_Y); ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }
    if (swerve) {
      const t = (now - swerve.t0) / 1200;
      if (t >= 1) swerve = null;
      else {
        const [x1, y1] = SLOT_SCREEN[swerve.from], [x2, y2] = SLOT_SCREEN[swerve.to];
        ctx.save(); ctx.globalAlpha = 1 - t; ctx.strokeStyle = '#4dc8ff'; ctx.lineWidth = 10; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1, y1 + 40); ctx.quadraticCurveTo((x1 + x2) / 2, y1 - 60, x2, y2 + 40); ctx.stroke();
        const a = Math.atan2(40, x2 - (x1 + x2) / 2);
        ctx.fillStyle = '#4dc8ff'; ctx.beginPath(); ctx.moveTo(x2, y2 + 52);
        ctx.lineTo(x2 - 26 * Math.cos(a - 0.5), y2 + 52 - 26 * Math.sin(a - 0.5)); ctx.lineTo(x2 - 26 * Math.cos(a + 0.5), y2 + 52 - 26 * Math.sin(a + 0.5)); ctx.fill();
        ctx.restore();
      }
    }
    updateTurnBar();
  }
  function flashOn(color, dur) { flash = { color, t0: performance.now(), dur }; }
  let swerve = null;
  requestAnimationFrame(frame);

  // ---------- Plein écran, écran allumé, son ----------
  let wakeLock = null;
  async function goFull() {
    if (window.TPAudio.unlock()) $('sound-hint').classList.add('hidden');
    try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); } catch { /* iOS : utiliser "Ajouter à l'écran d'accueil" */ }
    try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* refusé */ }
  }
  $('fs').addEventListener('click', goFull);
  document.addEventListener('pointerdown', goFull);
  document.addEventListener('fullscreenchange', () => $('fs').classList.toggle('hidden', !!document.fullscreenElement));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && document.fullscreenElement) goFull(); });
})();
