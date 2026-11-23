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
      ['ticketsOnPlate', 'Tickets sur le plateau'],
      ['gemEverySeconds', 'Pierre précieuse : une toutes les … s (en moyenne)', 'Apparition au hasard ; 0 = jamais'],
      ['maxGemsOnPlate', 'Pierres précieuses en même temps (max)'], ['maxObjects', 'Objets maximum', 'Baisser si le téléphone rame'],
      ['pusherStroke', 'Course du poussoir'], ['pusherPeriodSeconds', 'Aller-retour du poussoir (s)'],
      ['sideGapRatio', 'Ouverture des côtés (0 à 0,8)', 'Ce qui tombe par les côtés est perdu'],
      ['shakeIntensity', 'Intensité des secousses (1 à 10)'], ['shakeDurationMs', 'Durée des secousses (ms)'],
      ['shakeGapMs', 'Pause entre deux secousses (ms)', 'Jamais deux secousses en même temps'],
      ['shakeCreditMs', 'Points d\'une secousse : délai après la secousse (ms)', 'Ce qui tombe pendant la secousse et ce délai revient à celui qui l\'a offerte'],
      ['coinRainDelayMs', 'Intervalle pluie de jetons (ms)'],
    ],
    'f-powers': [
      ['peaceful', 'Mode paisible', 'Coupe les pouvoirs qui gênent'],
      ['shieldSeconds', 'Durée du bouclier (s)'],
      ['powerCooldownSeconds', 'Délai entre deux pouvoirs (s)', 'Un joueur touché trop tôt subit l\'effet à son tour suivant'],
    ],
    'f-misc': [['celebrateLeader', '« Félicitations » au premier du classement'], ['leaderRepeatSeconds', 'Le refaire toutes les … s s\'il reste premier', '0 = seulement quand il change'], ['leaderVoice', 'Voix française « Félicitations à … »', 'Sinon : applaudissements seuls'],['showRewards', 'Afficher « cadeau → effet » aux viewers', 'En rotation en bas de l\'écran du jeu, avec les likes et l\'abonnement'], ['rewardsSeconds', 'Durée de chaque ligne (s)'],['sounds', 'Bruitages'], ['sfxVolume', 'Volume des bruitages (0 à 100)'], ['music', 'Musique d\'ambiance', 'Générée par le jeu : originale et libre de droits'], ['musicVolume', 'Volume de la musique (0 à 100)'], ['blockedNames', 'Pseudos bloqués', 'Séparés par des virgules']],
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
      <td>${it.kind === 'ticket' || it.kind === 'gem' ? `<input type="number" data-item="${it.key}" data-f="weight" value="${it.weight}">` : `<small class="muted">${it.kind === 'chest' ? 'cadeau lié' : 'lancé'}</small>`}</td></tr>`).join('');
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

  // ---------- Cadeaux : liaisons « cadeau TikTok → effet » ----------
  // La liste des effets vient du serveur (src/effects.js) : un nouveau pouvoir y apparaît automatiquement.
  let rulesDraft = [];
  let catalogKey = '';
  const gkey = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
  function giftInfo(r) {
    const cat = st?.config.giftCatalog || [];
    return cat.find((g) => r.giftId && g.id === String(r.giftId)) || cat.find((g) => gkey(g.name) === gkey(r.name)) || { name: r.name, image: '' };
  }
  function effectOptions(r) {
    const effects = st?.effects || [];
    const cur = effects.find((e) => e.action === r.action && String(e.param) === String(r.param));
    // Effet qui n'est plus proposé (retiré du menu) : affiché tel quel, à remplacer.
    const old = cur ? '' : `<option value="" selected>⚠️ Effet retiré (${esc(r.action)}) : choisis-en un</option>`;
    return old + effects.map((e) => `<option value="${esc(e.id)}" ${cur && cur.id === e.id ? 'selected' : ''}>${e.icon} ${esc(e.label)}</option>`).join('');
  }
  function imgHtml(g) { return g && g.image ? `<img src="${esc(g.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="noimg">🎁</span>'; }
  // Cadeaux ajoutés à la main dans cette session (envoyés au serveur à l'enregistrement).
  let extraGifts = [];
  function catalog() {
    const all = [...(st?.config.giftCatalog || []), ...extraGifts];
    const seen = new Set();
    return all.filter((g) => { const k = gkey(g.name); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => (a.diamonds || 0) - (b.diamonds || 0) || a.name.localeCompare(b.name));
  }
  function giftOptions(r) {
    const cur = giftInfo(r);
    const list = catalog();
    const inList = list.some((g) => gkey(g.name) === gkey(cur.name));
    return (inList ? '' : `<option value="name:${esc(r.name)}" selected>${esc(r.name)}</option>`)
      + list.map((g) => `<option value="${esc(g.id)}" ${gkey(g.name) === gkey(cur.name) ? 'selected' : ''}>${esc(g.name)}${g.diamonds ? ` — ${g.diamonds} pièce${g.diamonds > 1 ? 's' : ''} TikTok` : ''}</option>`).join('');
  }
  function renderLinks() {
    if (!st) return;
    $('cat-count').textContent = catalog().length;
    const counts = {};
    rulesDraft.forEach((r) => { const k = gkey(r.name); counts[k] = (counts[k] || 0) + 1; });
    $('links').innerHTML = rulesDraft.length ? rulesDraft.map((r, i) => {
      const g = giftInfo(r);
      const dup = counts[gkey(r.name)] > 1;
      return `<div class="link-row ${dup ? 'dup' : ''}" data-i="${i}">${imgHtml(g)}
        <select data-gift title="Cadeau TikTok">${giftOptions(r)}</select>
        <button class="del" data-del title="Retirer">🗑️</button>
        <select data-eff title="Effet">${effectOptions(r)}</select></div>`;
    }).join('') : '<p class="muted small">Aucun cadeau lié pour l\'instant : appuie sur « + Lier un cadeau ».</p>';
    $('links').querySelectorAll('.link-row').forEach((el) => {
      const i = Number(el.dataset.i);
      el.querySelector('[data-gift]').onchange = (e) => {
        const g = catalog().find((x) => x.id === e.target.value);
        if (!g) return;
        rulesDraft[i].name = g.name; rulesDraft[i].giftId = g.id;
        renderLinks();
        if (rulesDraft.filter((r) => gkey(r.name) === gkey(g.name)).length > 1) toast('⚠️ Ce cadeau est déjà lié sur une autre ligne');
        else toast('Pense à enregistrer');
      };
      el.querySelector('[data-eff]').onchange = (e) => {
        const eff = (st.effects || []).find((x) => x.id === e.target.value);
        if (eff) { rulesDraft[i].action = eff.action; rulesDraft[i].param = eff.param; toast('Pense à enregistrer'); }
      };
      el.querySelector('[data-del]').onclick = () => { rulesDraft.splice(i, 1); renderLinks(); toast('Pense à enregistrer'); };
    });
  }
  $('link-add').onclick = () => {
    const used = new Set(rulesDraft.map((r) => gkey(r.name)));
    const g = catalog().find((x) => !used.has(gkey(x.name))) || catalog()[0];
    if (!g) return toast('Aucun cadeau dans la liste : ajoute-en un plus bas');
    rulesDraft.unshift({ name: g.name, giftId: g.id, action: 'shake', param: 1 });
    renderLinks();
    toast('Choisis le cadeau et son effet, puis enregistre');
  };
  $('pick-other-ok').onclick = () => {
    const name = $('pick-other').value.trim();
    if (!name) return toast('Indique le nom du cadeau');
    $('pick-other').value = '';
    if (catalog().some((g) => gkey(g.name) === gkey(name))) return toast('Ce cadeau est déjà dans la liste');
    extraGifts.push({ id: 'nom-' + gkey(name), name, diamonds: 0, image: '' });
    renderLinks();
    toast('Ajouté au menu des cadeaux');
  };
  $('gifts-fetch').onclick = async () => {
    toast('Chargement des cadeaux…');
    const r = await act('gifts:fetch', { username: $('live-user').value });
    if (r.ok) toast(`${r.count} cadeaux chargés ✅`);
  };
  $('save-rules').onclick = async () => {
    const dups = rulesDraft.filter((r, i) => rulesDraft.findIndex((x) => gkey(x.name) === gkey(r.name)) !== i);
    if (dups.length) return toast(`⚠️ ${dups[0].name} est lié deux fois : retire une des lignes`);
    const patch = { giftRules: rulesDraft };
    if (extraGifts.length) patch.giftCatalog = [...(st.config.giftCatalog || []), ...extraGifts];
    const r = await act('config:update', patch, 'Cadeaux enregistrés ✅');
    if (r.ok) { rulesLoaded = false; extraGifts = []; }
  };

  // ---------- Copie des réglages sur le téléphone ----------
  // Render gratuit efface les fichiers à chaque redémarrage : on garde une copie locale et on propose de la restaurer.
  const BACKUP = 'tp-config-backup';
  function readBackup() { try { return JSON.parse(localStorage.getItem(BACKUP) || 'null'); } catch { return null; } }
  function writeBackup(cfg) { try { localStorage.setItem(BACKUP, JSON.stringify(cfg)); } catch { /* */ } }
  let restoreDismissed = false;
  $('restore-yes').onclick = async () => {
    const b = readBackup(); if (!b) return;
    const r = await act('config:update', b, 'Réglages restaurés ✅');
    if (r.ok) { settingsLoaded = false; rulesLoaded = false; $('restore').classList.add('hidden'); }
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
  $('peaceful').onchange = async (e) => {
    const r = await act('config:update', { peaceful: e.target.checked }, e.target.checked ? '🕊️ Mode paisible activé' : 'Pouvoirs réactivés');
    if (r.ok) settingsLoaded = false;
  };
  $('send-gift').onclick = () => {
    const r = rulesDraft[Number($('sim-gift').value)];
    if (!r) return toast('Lie d\'abord un cadeau (onglet Cadeaux)');
    const g = giftInfo(r);
    simEvent({ type: 'gift', giftName: g.name || r.name, giftId: r.giftId, diamondCount: g.diamonds || 0, repeatCount: Number($('gift-count').value) || 1 });
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
    $('donors').innerHTML = S.donors.length ? S.donors.map((d) => `<li>${esc(d.nickname)} — ${d.diamonds} 💎</li>`).join('') : '<li class="muted">Aucun cadeau</li>';
    $('players').innerHTML = s.players.slice(0, 50).map((p) => `<tr class="${p.active ? '' : 'off'}"><td>${esc(p.nickname)}</td><td>${p.tokens}</td><td>${p.points.toLocaleString('fr-FR')}</td><td>${p.inQueue ? '⏳' : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Aucun joueur</td></tr>';
    $('log').textContent = s.log.slice().reverse().map((l) => new Date(l.t).toLocaleTimeString('fr-FR') + ' ' + l.line).join('\n');
    $('sim-auto').checked = s.simAuto;
    $('peaceful').checked = !!s.config.peaceful;
    const sel = $('sim-who'); const cur = sel.value;
    const opts = s.players.map((p) => `<option value="${esc(p.id)}">${esc(p.nickname)} (🪙${p.tokens})</option>`).join('');
    if (sel.dataset.h !== opts) { sel.innerHTML = opts; sel.dataset.h = opts; if (cur) sel.value = cur; }
    if (!settingsLoaded) { renderSettings(s.config); settingsLoaded = true; }
    if (!rulesLoaded) { rulesDraft = JSON.parse(JSON.stringify(s.config.giftRules)); renderLinks(); rulesLoaded = true; }
    const ck = (s.config.giftCatalog || []).map((g) => g.id + (g.image ? '*' : '')).join(',');
    if (ck !== catalogKey) { catalogKey = ck; renderLinks(); } // nouveaux cadeaux reçus ou chargés : menus à jour
    const simOpts = rulesDraft.map((r, i) => { const e = (s.effects || []).find((x) => x.action === r.action && String(x.param) === String(r.param)); return `<option value="${i}">${esc(r.name)} → ${e ? e.icon + ' ' + esc(e.label) : esc(r.action)}</option>`; }).join('');
    if ($('sim-gift').dataset.h !== simOpts) { const v = $('sim-gift').value; $('sim-gift').innerHTML = simOpts; $('sim-gift').dataset.h = simOpts; if (v) $('sim-gift').value = v; }
    if (s.configCustomized) { writeBackup(s.config); $('restore').classList.add('hidden'); }
    else $('restore').classList.toggle('hidden', restoreDismissed || !readBackup());
  });
})();
