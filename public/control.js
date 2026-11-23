'use strict';
/* Application de contrôle (téléphone du créateur). */
(() => {
  const $ = (id) => document.getElementById(id);
  const socket = io({ transports: ['websocket', 'polling'] });
  let st = null;
  let settingsLoaded = false;
  let rulesLoaded = false;

  const call = (name, data) => new Promise((resolve) => socket.emit(name, data, (r) => resolve(r || { ok: false })));
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2200); }
  async function act(name, data, okMsg) {
    const r = await call(name, data);
    if (!r.ok) toast('⚠️ ' + (r.error || 'Erreur')); else if (okMsg) toast(okMsg);
    return r;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Connexion / mot de passe ----------
  function getPw() { try { return localStorage.getItem('tp-admin') || ''; } catch { return ''; } }
  function setPw(v) { try { localStorage.setItem('tp-admin', v); } catch { /* navigation privée */ } }
  async function auth(pw) {
    const r = await call('control:auth', { password: pw });
    if (r.ok) { setPw(pw); $('login').classList.add('hidden'); $('app').classList.remove('hidden'); }
    else { $('login').classList.remove('hidden'); $('app').classList.add('hidden'); if (pw) $('pw-err').textContent = 'Mot de passe incorrect'; }
  }
  socket.on('connect', () => auth(getPw()));
  $('pw-go').onclick = () => auth($('pw').value);
  $('pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') auth($('pw').value); });

  // ---------- Onglets ----------
  function go(tab) {
    document.querySelectorAll('section[data-tab]').forEach((s) => s.classList.toggle('hidden', s.dataset.tab !== tab));
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.go === tab));
    const f = $('preview');
    if (tab === 'preview') { if (!f.src) f.src = '/'; } else if (f.src) { f.removeAttribute('src'); } // l'aperçu ne tourne que s'il est affiché
    try { localStorage.setItem('tp-tab', tab); } catch { /* */ }
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('nav button').forEach((b) => { b.onclick = () => go(b.dataset.go); });
  try { const t = localStorage.getItem('tp-tab'); if (t && t !== 'preview') go(t); } catch { /* */ }
  $('game-link').href = location.origin + '/'; $('game-link').textContent = location.origin + '/';

  // ---------- Live & partie ----------
  $('live-connect').onclick = async () => { toast('Connexion…'); await act('live:connect', { username: $('live-user').value }, 'Live lié ✅'); };
  $('live-disconnect').onclick = () => act('live:disconnect', null, 'Live délié');
  $('g-pause').onclick = $('q-pause').onclick = () => act('game:pause', null, 'Pause');
  $('g-resume').onclick = $('q-resume').onclick = () => act('game:resume', null, 'C\'est parti !');
  $('g-stop').onclick = () => act('game:stop', null, 'Arrêté (live délié, jeu en pause)');
  $('g-refill').onclick = () => act('game:refill', null, 'Plateau rempli');
  $('g-resetweekly').onclick = () => { if (confirm('Effacer le classement de la semaine ? (définitif)')) act('game:resetWeekly', null, 'Classement de la semaine remis à zéro'); };
  $('g-resetboard').onclick = () => { if (confirm('Remettre le classement du live à zéro ?')) act('game:resetLeaderboard', null, 'Classement remis à zéro'); };
  $('g-reset').onclick = () => { if (confirm('Tout effacer (joueurs, jetons, points) et repartir de zéro ?')) act('game:resetAll', null, 'Nouvelle partie'); };

  // ---------- Réglages ----------
  const FIELDS = {
    'f-turn': [
      ['turnSeconds', 'Durée du tour (s)', 'Validé : 8 à 10 s'],
      ['afterLaunchMs', 'Pause après le lancer (ms)', 'Le temps de voir le jeton tomber'],
      ['graceSeconds', 'Délai de grâce (s)', 'Ce qui tombe juste après le tour revient encore au joueur'],
      ['maxMissedTurns', 'Tours sans réponse avant sortie de la file', 'Le viewer revient dès qu\'il interagit'],
    ],
    'f-tokens': [
      ['startTokens', 'Jetons à l\'arrivée'], ['maxTokens', 'Stock maximum'],
      ['likesPerRefill', 'Likes pour une recharge'], ['tokensPerLikeRefill', 'Jetons par recharge'],
      ['followTokens', 'Jetons par abonnement'],
      ['joinTokensFollowersOnly', 'Jetons d\'arrivée réservés aux abonnés', 'Option proposée, à trancher'],
    ],
    'f-cmds': [['commandsLeft', 'Gauche'], ['commandsCenter', 'Centre'], ['commandsRight', 'Droite']],
    'f-machine': [
      ['coinsOnPlate', 'Jetons posés au départ', 'Appliqué au prochain « Remplir le plateau »'],
      ['ticketsOnPlate', 'Tickets sur le plateau'], ['maxObjects', 'Objets maximum', 'Baisser si le téléphone rame'],
      ['pusherStroke', 'Course du poussoir'], ['pusherPeriodSeconds', 'Aller-retour du poussoir (s)'],
      ['sideGapRatio', 'Ouverture des côtés (0 à 0,8)', 'Ce qui tombe par les côtés est perdu'],
      ['shakeIntensity', 'Intensité des secousses (1 à 10)'], ['shakeDurationMs', 'Durée des secousses (ms)'],
      ['coinRainDelayMs', 'Intervalle pluie de jetons (ms)'],
    ],
    'f-powers': [
      ['peaceful', 'Mode paisible', 'Coupe les pouvoirs qui gênent'],
      ['shieldSeconds', 'Durée du bouclier (s)'],
      ['powerCooldownSeconds', 'Délai entre deux pouvoirs (s)', 'Un joueur touché trop tôt subit l\'effet à son tour suivant'],
    ],
    'f-misc': [['showRewards', 'Afficher « cadeau → effet » aux viewers', 'En rotation en bas de l\'écran du jeu, avec les likes et l\'abonnement'], ['rewardsSeconds', 'Durée de chaque ligne (s)'],['sounds', 'Bruitages'], ['sfxVolume', 'Volume des bruitages (0 à 100)'], ['music', 'Musique d\'ambiance', 'Générée par le jeu : originale et libre de droits'], ['musicVolume', 'Volume de la musique (0 à 100)'], ['blockedNames', 'Pseudos bloqués', 'Séparés par des virgules']],
  };

  function renderSettings(cfg) {
    for (const [box, list] of Object.entries(FIELDS)) {
      $(box).innerHTML = list.map(([k, label, hint]) => {
        const v = cfg[k];
        let input;
        if (typeof v === 'boolean') input = `<input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}>`;
        else if (typeof v === 'number') input = `<input type="number" step="any" inputmode="decimal" data-k="${k}" value="${v}">`;
        else input = `<input type="text" data-k="${k}" value="${esc(v)}">`;
        return `<div class="field"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span>${input}</div>`;
      }).join('');
    }
    $('items').innerHTML = cfg.items.map((it) => `<tr>
      <td>${esc(it.label)}</td>
      <td><input type="number" data-item="${it.key}" data-f="points" value="${it.points}">${it.kind === 'chest' ? `<br><small>à</small> <input type="number" data-item="${it.key}" data-f="pointsMax" value="${it.pointsMax}">` : ''}</td>
      <td>${it.kind === 'ticket' ? `<input type="number" data-item="${it.key}" data-f="weight" value="${it.weight}">` : '<small class="muted">cadeau</small>'}</td></tr>`).join('');
  }

  function collectSettings() {
    const patch = {};
    document.querySelectorAll('section[data-tab=settings] [data-k]').forEach((el) => {
      patch[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(String(el.value).replace(',', '.')) : el.value;
    });
    const items = {};
    document.querySelectorAll('[data-item]').forEach((el) => { (items[el.dataset.item] ||= { key: el.dataset.item })[el.dataset.f] = Number(el.value); });
    patch.items = Object.values(items);
    return patch;
  }
  $('save-settings').onclick = async () => { const r = await act('config:update', collectSettings(), 'Réglages enregistrés ✅'); if (r.ok) settingsLoaded = false; };
  $('reset-settings').onclick = async () => { if (confirm('Revenir à tous les réglages par défaut ?')) { await act('config:reset', null, 'Réglages par défaut'); settingsLoaded = false; rulesLoaded = false; } };

  // ---------- Cadeaux ----------
  const ACTIONS = {
    shake: 'Secousse', coinRain: 'Pluie de jetons', spawn: 'Objet bonus', queueSkip: 'Passer devant',
    shield: '🛡️ Bouclier (pour le donateur)', jinxShake: '🌪️ Secousse au lancer', deviate: '↪️ Jeton dévié',
    loseTokens: '💥 Perte de jetons', steal: '🦹 Vol de jetons', none: 'Rien',
  };
  function ruleHtml(r, items) {
    const spawnOpts = items.filter((i) => i.kind !== 'coin').map((i) => `<option value="${i.key}" ${r.param === i.key ? 'selected' : ''}>${esc(i.label)}</option>`).join('');
    const paramLabel = { coinRain: 'Nombre de jetons', queueSkip: 'Places (0 = tout devant)', spawn: 'Objet', loseTokens: 'Jetons perdus', steal: 'Jetons volés' }[r.action] || 'Paramètre (inutilisé)';
    return `<div class="rule">
      <label class="full">Nom du cadeau (vide = règle par valeur)<input data-r="name" value="${esc(r.name)}"></label>
      <label>Diamants min<input type="number" data-r="minDiamonds" value="${r.minDiamonds}"></label>
      <label>Diamants max<input type="number" data-r="maxDiamonds" value="${r.maxDiamonds}"></label>
      <label>Effet<select data-r="action">${Object.entries(ACTIONS).map(([k, v]) => `<option value="${k}" ${r.action === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>${paramLabel}${r.action === 'spawn' ? `<select data-r="param">${spawnOpts}</select>` : `<input type="number" data-r="param" value="${Number(r.param) || 0}">`}</label>
      <button class="danger full" data-del>Supprimer</button></div>`;
  }
  let rulesDraft = [];
  function renderRules() {
    const items = st.config.items;
    // Les règles liées à un cadeau précis se règlent dans le catalogue ; ici, les autres.
    const idx = rulesDraft.map((r, i) => (r.giftId ? -1 : i)).filter((i) => i >= 0);
    $('rules').innerHTML = idx.map((i) => ruleHtml(rulesDraft[i], items)).join('');
    $('rules').querySelectorAll('.rule').forEach((el, j) => {
      const i = idx[j];
      el.querySelectorAll('[data-r]').forEach((inp) => {
        inp.onchange = () => {
          const k = inp.dataset.r;
          rulesDraft[i][k] = inp.type === 'number' ? Number(inp.value) : inp.value;
          if (k === 'action') { rulesDraft[i].param = { spawn: 'diamant', coinRain: 5, loseTokens: 2, steal: 3, queueSkip: 3 }[inp.value] ?? 1; renderRules(); }
        };
      });
      el.querySelector('[data-del]').onclick = () => { rulesDraft.splice(i, 1); renderRules(); };
    });
  }
  // ---------- Catalogue des cadeaux ----------
  const DEFAULT_PARAM = { spawn: 'diamant', coinRain: 5, loseTokens: 2, steal: 3, queueSkip: 3 };
  function ruleFor(diamonds, name) {
    const n = String(name || '').trim().toLowerCase();
    return rulesDraft.find((r) => !r.giftId && r.name && r.name.trim().toLowerCase() === n)
      || rulesDraft.find((r) => !r.giftId && !r.name && diamonds >= r.minDiamonds && diamonds <= r.maxDiamonds);
  }
  function paramCtl(r, items) {
    if (r.action === 'spawn') return `<select data-g="param">${items.filter((i) => i.kind !== 'coin').map((i) => `<option value="${i.key}" ${r.param === i.key ? 'selected' : ''}>${esc(i.label)}</option>`).join('')}</select>`;
    if (['coinRain', 'loseTokens', 'steal', 'queueSkip'].includes(r.action)) return `<input type="number" min="0" data-g="param" value="${Number(r.param) || 0}" title="Nombre">`;
    return '';
  }
  function renderCatalog() {
    const cat = st.config.giftCatalog || [];
    const q = $('gifts-search').value.trim().toLowerCase();
    const onlySet = $('gifts-filter').value === 'set';
    const items = st.config.items;
    const rows = cat.filter((g) => (!q || g.name.toLowerCase().includes(q)) && (!onlySet || rulesDraft.some((r) => r.giftId === g.id))).slice(0, 400);
    if (!cat.length) { $('catalog').innerHTML = '<p class="muted small" style="padding:8px">Catalogue vide : charge-le depuis TikTok, ou ajoute un cadeau à la main.</p>'; return; }
    $('catalog').innerHTML = rows.map((g) => {
      const r = rulesDraft.find((x) => x.giftId === g.id);
      const def = r ? null : ruleFor(g.diamonds, g.name);
      return `<div class="gift ${r ? 'set' : ''}" data-id="${esc(g.id)}">
        ${g.image ? `<img src="${esc(g.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="noimg">🎁</span>'}
        <div class="gname">${esc(g.name)}<small>💎 ${g.diamonds}</small></div>
        <div class="gctl"><select data-g="action"><option value="">${def ? 'Par valeur : ' + esc(ACTIONS[def.action]) : '— Aucun effet —'}</option>
          ${Object.entries(ACTIONS).map(([k, v]) => `<option value="${k}" ${r && r.action === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          ${r ? paramCtl(r, items) : ''}</div></div>`;
    }).join('') + (cat.length > rows.length && !q && !onlySet ? '<p class="muted small" style="padding:8px">Utilise la recherche pour voir les autres cadeaux.</p>' : '');
    $('catalog').querySelectorAll('.gift').forEach((el) => {
      const g = cat.find((x) => x.id === el.dataset.id);
      el.querySelector('[data-g=action]').onchange = (e) => {
        const i = rulesDraft.findIndex((x) => x.giftId === g.id);
        if (!e.target.value) { if (i >= 0) rulesDraft.splice(i, 1); }
        else {
          const rule = { name: g.name, giftId: g.id, minDiamonds: 0, maxDiamonds: 0, action: e.target.value, param: DEFAULT_PARAM[e.target.value] ?? 1 };
          if (i >= 0) rulesDraft[i] = rule; else rulesDraft.push(rule);
        }
        renderCatalog();
        toast('Pense à enregistrer');
      };
      const p = el.querySelector('[data-g=param]');
      if (p) p.onchange = () => { const r = rulesDraft.find((x) => x.giftId === g.id); r.param = p.type === 'number' ? Number(p.value) : p.value; };
    });
  }
  $('gifts-search').oninput = renderCatalog;
  $('gifts-filter').onchange = renderCatalog;
  $('gifts-fetch').onclick = async () => {
    toast('Chargement des cadeaux…');
    const r = await act('gifts:fetch', { username: $('live-user').value });
    if (r.ok) { toast(`${r.count} cadeaux chargés ✅`); catalogKey = ''; }
  };
  $('man-add').onclick = async () => {
    const name = $('man-name').value.trim(); const diamonds = Number($('man-dia').value) || 0;
    if (!name) return toast('Indique le nom du cadeau');
    const cat = (st.config.giftCatalog || []).filter((g) => g.name.toLowerCase() !== name.toLowerCase());
    const r = await act('config:update', { giftCatalog: [...cat, { id: 'manuel-' + name.toLowerCase().replace(/\s+/g, '-'), name, diamonds, image: '' }] }, 'Cadeau ajouté');
    if (r.ok) { $('man-name').value = ''; $('man-dia').value = ''; catalogKey = ''; }
  };
  let catalogKey = '';

  $('add-rule').onclick = () => { rulesDraft.push({ name: '', minDiamonds: 0, maxDiamonds: 0, action: 'shake', param: 1 }); renderRules(); };
  $('save-rules').onclick = async () => { const r = await act('config:update', { giftRules: rulesDraft }, 'Cadeaux enregistrés ✅'); if (r.ok) rulesLoaded = false; };

  // ---------- Copie des réglages sur le téléphone ----------
  // Render gratuit efface les fichiers à chaque redémarrage : on garde une copie locale et on propose de la restaurer.
  const BACKUP = 'tp-config-backup';
  function readBackup() { try { return JSON.parse(localStorage.getItem(BACKUP) || 'null'); } catch { return null; } }
  function writeBackup(cfg) { try { localStorage.setItem(BACKUP, JSON.stringify(cfg)); } catch { /* */ } }
  let restoreDismissed = false;
  $('restore-yes').onclick = async () => {
    const b = readBackup(); if (!b) return;
    const r = await act('config:update', b, 'Réglages restaurés ✅');
    if (r.ok) { settingsLoaded = false; rulesLoaded = false; catalogKey = ''; $('restore').classList.add('hidden'); }
  };
  $('restore-no').onclick = () => { restoreDismissed = true; $('restore').classList.add('hidden'); };

  // ---------- Simulateur ----------
  document.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => act('sim:addViewers', Number(b.dataset.add), 'Viewer(s) ajouté(s)'); });
  $('sim-auto').onchange = (e) => act('sim:auto', e.target.checked, e.target.checked ? 'Simulation auto activée' : 'Simulation auto coupée');
  function who() {
    const id = $('sim-who').value; const p = st?.players.find((x) => x.id === id);
    return p ? { userId: p.id, nickname: p.nickname } : null;
  }
  async function simEvent(ev) {
    const w = who(); if (!w) return toast('Ajoute d\'abord un viewer');
    const r = await act('sim:event', { ...w, ...ev });
    if (r.ok) $('sim-result').textContent = `Résultat : ${r.result}`;
  }
  document.querySelectorAll('[data-chat]').forEach((b) => { b.onclick = () => simEvent({ type: 'chat', comment: b.dataset.chat }); });
  document.querySelectorAll('[data-ev]').forEach((b) => {
    b.onclick = () => {
      const e = b.dataset.ev;
      if (e === 'like100') simEvent({ type: 'like', likeCount: 100 });
      else if (e === 'follow') simEvent({ type: 'follow' });
      else if (e === 'rose') simEvent({ type: 'gift', giftName: 'Rose', diamondCount: 1, repeatCount: 1 });
      else if (e === 'leave') simEvent({ type: 'leave' });
    };
  });
  // Boutons de pouvoirs : envoient le cadeau correspondant à la première règle qui déclenche cet effet.
  document.querySelectorAll('[data-power]').forEach((b) => {
    b.onclick = () => {
      const r = st?.config.giftRules.find((x) => x.action === b.dataset.power);
      if (!r) return toast('Aucun cadeau n\'est réglé pour cet effet (onglet Cadeaux)');
      simEvent({ type: 'gift', giftName: r.name || 'Cadeau test', diamondCount: r.name ? 1 : r.minDiamonds, repeatCount: 1 });
    };
  });
  $('peaceful').onchange = async (e) => {
    const r = await act('config:update', { peaceful: e.target.checked }, e.target.checked ? '🕊️ Mode paisible activé' : 'Pouvoirs réactivés');
    if (r.ok) settingsLoaded = false;
  };
  $('send-gift').onclick = () => {
    const name = $('gift-name').value.trim();
    const g = (st?.config.giftCatalog || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
    simEvent({ type: 'gift', giftName: name, giftId: g ? g.id : '', diamondCount: g ? g.diamonds : Number($('gift-diamonds').value), repeatCount: Number($('gift-count').value) || 1 });
  };

  // ---------- Mise à jour de l'état ----------
  const LIVE_STATES = { disconnected: 'non lié', connecting: 'connexion…', connected: 'connecté ✅', error: 'erreur ❌', ended: 'live terminé' };
  socket.on('control:state', (s) => {
    st = s;
    const pill = $('status-pill');
    pill.textContent = s.status === 'running' ? 'en jeu' : 'en pause'; pill.className = 'pill ' + s.status;
    $('warn').classList.toggle('hidden', s.passwordSet);
    $('warn').textContent = 'Aucun mot de passe défini (variable ADMIN_PASSWORD) : n\'importe qui connaissant l\'adresse peut ouvrir ce contrôle.';
    if (!$('live-user').value && s.config.liveUsername) $('live-user').value = '@' + s.config.liveUsername;
    $('live-state').textContent = LIVE_STATES[s.live.state] || s.live.state;
    $('live-viewers').textContent = s.live.state === 'connected' ? `· ${s.live.viewers} spectateurs` : '';
    $('live-err').textContent = s.live.error || '';
    $('sign-key').textContent = s.hasSignKey ? 'configurée' : 'absente (offre gratuite limitée)';
    const S = s.stats;
    $('stats').innerHTML = [['Viewers vus', S.players], ['Actifs', S.active], ['En file', S.queueLength], ['Likes', S.likes], ['Messages', S.comments], ['Cadeaux', S.gifts], ['Diamants', S.diamonds], ['Abonnés', S.follows], ['Objets', s.objects]]
      .map(([l, v]) => `<div class="stat"><b>${Number(v).toLocaleString('fr-FR')}</b><span>${l}</span></div>`).join('');
    const slow = s.simSpeed < 0.95;
    $('health').innerHTML = `Version <b>${esc(s.version)}</b> · Vitesse du jeu <b style="color:${slow ? '#ff8a8a' : 'inherit'}">${Math.round(s.simSpeed * 100)} %</b> · Processeur du serveur ${s.cpu} %${slow ? ' — le serveur est trop lent, le jeu tourne au ralenti' : ''}`;
    const sto = s.storage || {};
    $('storage').innerHTML = sto.kind === 'base de données'
      ? (sto.ok ? `💾 Sauvegarde : <b>base de données (Neon)</b> ✅${sto.lastSaveAt ? ' · dernière sauvegarde ' + new Date(sto.lastSaveAt).toLocaleTimeString('fr-FR') : ''}` : `💾 Sauvegarde : <b style="color:#ff8a8a">erreur</b> — ${esc(sto.error || '')}`)
      : `💾 Sauvegarde : <b>fichier local</b>${sto.fallback || sto.error ? ' — <span style="color:#ff8a8a">' + esc(sto.fallback || sto.error) + '</span>' : ''} · effacé à chaque redémarrage de Render (ajoute DATABASE_URL pour une sauvegarde durable)`;
    $('week-key').textContent = s.weekly ? s.weekly.week : '';
    $('weekly').innerHTML = s.weekly && s.weekly.top.length ? s.weekly.top.map((p) => `<li>${esc(p.nickname)} — ${p.points.toLocaleString('fr-FR')} pts</li>`).join('') : '<li class="muted">Pas encore de points cette semaine</li>';
    $('donors').innerHTML = S.donors.length ? S.donors.map((d) => `<li>${esc(d.nickname)} — ${d.diamonds} 💎</li>`).join('') : '<li class="muted">Aucun cadeau</li>';
    $('players').innerHTML = s.players.slice(0, 50).map((p) => `<tr class="${p.active ? '' : 'off'}"><td>${esc(p.nickname)}</td><td>${p.tokens}</td><td>${p.points.toLocaleString('fr-FR')}</td><td>${p.inQueue ? '⏳' : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Aucun joueur</td></tr>';
    $('log').textContent = s.log.slice().reverse().map((l) => new Date(l.t).toLocaleTimeString('fr-FR') + ' ' + l.line).join('\n');
    $('sim-auto').checked = s.simAuto;
    $('peaceful').checked = !!s.config.peaceful;
    const sel = $('sim-who'); const cur = sel.value;
    const opts = s.players.map((p) => `<option value="${esc(p.id)}">${esc(p.nickname)} (🪙${p.tokens})</option>`).join('');
    if (sel.dataset.h !== opts) { sel.innerHTML = opts; sel.dataset.h = opts; if (cur) sel.value = cur; }
    if (!settingsLoaded) { renderSettings(s.config); settingsLoaded = true; }
    if (!rulesLoaded) { rulesDraft = JSON.parse(JSON.stringify(s.config.giftRules)); renderRules(); rulesLoaded = true; catalogKey = ''; }
    const ck = (s.config.giftCatalog || []).length + ':' + (s.config.giftCatalog || []).map((g) => g.id).join(',').length;
    if (ck !== catalogKey) { catalogKey = ck; renderCatalog(); $('gift-names').innerHTML = (s.config.giftCatalog || []).map((g) => `<option value="${esc(g.name)}">💎 ${g.diamonds}</option>`).join(''); }
    if (s.configCustomized) { writeBackup(s.config); $('restore').classList.add('hidden'); }
    else $('restore').classList.toggle('hidden', restoreDismissed || !readBackup());
  });
})();
