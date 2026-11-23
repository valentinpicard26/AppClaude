'use strict';
// Réglages du jeu. Toutes les valeurs sont modifiables depuis l'application de contrôle.
// Les valeurs marquées "PROPOSÉ" sont des valeurs par défaut à confirmer par le créateur.

const fs = require('fs');
const path = require('path');

const TICKET_COLORS = {
  20: '#ffd21f', 40: '#ff8a1f', 60: '#ff3b30', 80: '#ff4fa3', 100: '#b14dff',
  120: '#3b7bff', 140: '#19c7e6', 160: '#22c55e', 180: '#a3e635', 200: '#ffffff',
};

function defaultItems() {
  const items = [{ key: 'coin', label: 'Jeton', kind: 'coin', points: 10, weight: 0 }];
  // Fréquence des tickets (PROPOSÉ) : les petits tickets sont plus fréquents.
  // Tickets de 20 à 100 (décision du créateur : pas de tickets au-delà de 100).
  const weights = { 20: 30, 40: 22, 60: 15, 80: 10, 100: 8 };
  for (const v of [20, 40, 60, 80, 100]) {
    items.push({ key: 'ticket' + v, label: 'Ticket ' + v, kind: 'ticket', points: v, weight: weights[v], color: TICKET_COLORS[v] });
  }
  items.push(
    { key: 'diamant', label: 'Diamant', kind: 'gem', points: 500, color: '#7fe9ff' },
    { key: 'rubis', label: 'Rubis', kind: 'gem', points: 800, color: '#ff2d55' },
    { key: 'emeraude', label: 'Émeraude', kind: 'gem', points: 1000, color: '#21d07a' },
    { key: 'amethyste', label: 'Améthyste', kind: 'gem', points: 1200, color: '#a855f7' },
    { key: 'topaze', label: 'Topaze', kind: 'gem', points: 1500, color: '#ffb020' },
    { key: 'cristal', label: 'Cristal arc-en-ciel', kind: 'gem', points: 2000, color: 'rainbow' },
    { key: 'coffre', label: 'Coffre mystère', kind: 'chest', points: 2000, pointsMax: 5000, color: '#c0842b' },
  );
  return items;
}

// Règles de cadeaux (PROPOSÉ, "À trancher" dans le cahier des charges).
// Une règle avec un nom de cadeau passe avant les règles par valeur (en diamants TikTok).
// Actions : shake (secousse), coinRain (pluie de jetons, param = nombre),
// spawn (objet bonus, param = clé d'objet), queueSkip (passer devant, param = nombre de places, 0 = tout devant),
// shield (bouclier pour le donateur), et pouvoirs qui gênent le joueur du tour : jinxShake (secousse au lancer),
// deviate (jeton dévié), loseTokens (perte, param = nombre), steal (vol au profit du donateur, param = nombre), none.
function defaultGiftRules() {
  return [
    { name: 'Rose', minDiamonds: 0, maxDiamonds: 0, action: 'shake', param: 1 },
    { name: '', minDiamonds: 1, maxDiamonds: 9, action: 'shake', param: 1 },
    { name: '', minDiamonds: 10, maxDiamonds: 29, action: 'queueSkip', param: 3 },
    { name: '', minDiamonds: 30, maxDiamonds: 98, action: 'coinRain', param: 5 },
    { name: '', minDiamonds: 99, maxDiamonds: 198, action: 'spawn', param: 'diamant' },
    { name: '', minDiamonds: 199, maxDiamonds: 298, action: 'jinxShake', param: 1 },
    { name: '', minDiamonds: 299, maxDiamonds: 398, action: 'deviate', param: 1 },
    { name: '', minDiamonds: 399, maxDiamonds: 498, action: 'loseTokens', param: 2 },
    { name: '', minDiamonds: 499, maxDiamonds: 698, action: 'shield', param: 0 },
    { name: '', minDiamonds: 699, maxDiamonds: 998, action: 'steal', param: 3 },
    { name: '', minDiamonds: 999, maxDiamonds: 1498, action: 'spawn', param: 'rubis' },
    { name: '', minDiamonds: 1499, maxDiamonds: 1998, action: 'spawn', param: 'emeraude' },
    { name: '', minDiamonds: 1999, maxDiamonds: 2998, action: 'spawn', param: 'amethyste' },
    { name: '', minDiamonds: 2999, maxDiamonds: 3998, action: 'spawn', param: 'topaze' },
    { name: '', minDiamonds: 3999, maxDiamonds: 4998, action: 'spawn', param: 'cristal' },
    { name: '', minDiamonds: 4999, maxDiamonds: 999999, action: 'spawn', param: 'coffre' },
  ];
}

function defaultConfig() {
  return {
    // Tour
    turnSeconds: 10,            // Validé : 8 à 10 s
    afterLaunchMs: 1200,        // temps pour voir le jeton tomber avant de passer au suivant
    graceSeconds: 3,            // PROPOSÉ : délai de grâce après la fin d'un tour
    maxMissedTurns: 2,          // PROPOSÉ : après N tours sans réponse, le viewer sort de la file (parti du live ?)
    // Jetons
    startTokens: 5,             // Validé
    maxTokens: 20,              // Validé
    likesPerRefill: 100,        // Validé
    tokensPerLikeRefill: 5,     // Validé
    followTokens: 5,            // Validé
    joinTokensFollowersOnly: false, // PROPOSÉ (à trancher)
    // Commandes de chat (séparées par des virgules)
    commandsLeft: '1',
    commandsCenter: '2',
    commandsRight: '3',
    // Machine
    coinsOnPlate: 90,           // jetons posés au démarrage
    ticketsOnPlate: 6,          // tickets maintenus sur le plateau
    maxObjects: 150,            // limite pour garder le jeu fluide
    pusherStroke: 70,           // course du poussoir (unités de plateau, profondeur 400)
    pusherPeriodSeconds: 3.2,   // durée d'un aller-retour
    sideGapRatio: 0.3,          // part avant des côtés ouverte (ce qui tombe par là est perdu)
    shakeIntensity: 5,          // 1 à 10
    shakeDurationMs: 600,
    coinRainDelayMs: 180,
    // Pouvoirs
    peaceful: false,            // mode paisible : coupe les pouvoirs qui gênent
    shieldSeconds: 60,          // PROPOSÉ : durée du bouclier
    powerCooldownSeconds: 20,   // PROPOSÉ : délai entre deux pouvoirs sur un même joueur
    // Divers
    liveUsername: '',
    sounds: true,
    sfxVolume: 70,              // volume des bruitages (0 à 100)
    music: true,                // musique d'ambiance générée (originale, libre de droits)
    musicVolume: 35,            // volume de la musique (0 à 100)
    blockedNames: '',           // pseudos ou identifiants bloqués, séparés par des virgules
    items: defaultItems(),
    giftRules: defaultGiftRules(),
    giftCatalog: [],            // liste des cadeaux TikTok connus : { id, name, diamonds, image }
  };
}

const NUMERIC_LIMITS = {
  turnSeconds: [3, 60], afterLaunchMs: [0, 5000], graceSeconds: [0, 15], maxMissedTurns: [1, 20],
  startTokens: [0, 100], maxTokens: [1, 200], likesPerRefill: [1, 100000], tokensPerLikeRefill: [0, 100],
  followTokens: [0, 100], coinsOnPlate: [0, 200], ticketsOnPlate: [0, 30], maxObjects: [20, 300],
  pusherStroke: [20, 150], pusherPeriodSeconds: [1, 10], sideGapRatio: [0, 0.8], shakeIntensity: [1, 10],
  shakeDurationMs: [100, 3000], coinRainDelayMs: [50, 2000],
  shieldSeconds: [5, 600], powerCooldownSeconds: [0, 300], sfxVolume: [0, 100], musicVolume: [0, 100],
};

// Fusionne une mise à jour partielle en validant les types et les bornes.
function applyConfigPatch(cfg, patch) {
  const out = { ...cfg };
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in cfg)) continue;
    if (k in NUMERIC_LIMITS) {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      const [lo, hi] = NUMERIC_LIMITS[k];
      out[k] = Math.min(hi, Math.max(lo, n));
    } else if (typeof cfg[k] === 'boolean') {
      out[k] = Boolean(v);
    } else if (typeof cfg[k] === 'string') {
      out[k] = String(v).slice(0, 2000);
    } else if (k === 'items' && Array.isArray(v)) {
      out.items = cfg.items.map((it) => {
        const p = v.find((x) => x && x.key === it.key);
        if (!p) return it;
        const n = { ...it };
        if (Number.isFinite(Number(p.points))) n.points = Math.max(0, Math.round(Number(p.points)));
        if (p.pointsMax !== undefined && Number.isFinite(Number(p.pointsMax))) n.pointsMax = Math.max(n.points, Math.round(Number(p.pointsMax)));
        if (p.weight !== undefined && Number.isFinite(Number(p.weight))) n.weight = Math.max(0, Number(p.weight));
        return n;
      });
    } else if (k === 'giftRules' && Array.isArray(v)) {
      const actions = ['shake', 'coinRain', 'spawn', 'queueSkip', 'shield', 'jinxShake', 'deviate', 'loseTokens', 'steal', 'none'];
      out.giftRules = v.slice(0, 300).filter((r) => r && actions.includes(r.action)).map((r) => ({
        name: String(r.name || '').slice(0, 60),
        giftId: r.giftId ? String(r.giftId).slice(0, 40) : '',
        minDiamonds: Math.max(0, Number(r.minDiamonds) || 0),
        maxDiamonds: Math.max(0, Number(r.maxDiamonds) || 0),
        action: r.action,
        param: r.action === 'spawn' ? String(r.param || 'diamant') : Math.max(0, Math.round(Number(r.param) || 0)),
      }));
    } else if (k === 'giftCatalog' && Array.isArray(v)) {
      out.giftCatalog = sanitizeCatalog(v);
    }
  }
  if (out.startTokens > out.maxTokens) out.startTokens = out.maxTokens;
  return out;
}

function sanitizeCatalog(list) {
  const seen = new Set();
  const out = [];
  for (const g of list.slice(0, 2000)) {
    if (!g) continue;
    const id = String(g.id ?? '').slice(0, 40);
    const name = String(g.name || '').slice(0, 60);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const image = typeof g.image === 'string' && /^https:\/\//.test(g.image) ? g.image.slice(0, 500) : '';
    out.push({ id, name, diamonds: Math.max(0, Math.round(Number(g.diamonds) || 0)), image });
  }
  return out.sort((a, b) => a.diamonds - b.diamonds || a.name.localeCompare(b.name));
}

// Ajoute ou met à jour des cadeaux dans le catalogue (par identifiant).
function mergeCatalog(catalog, gifts) {
  const map = new Map((catalog || []).map((g) => [g.id, g]));
  for (const g of sanitizeCatalog(gifts)) map.set(g.id, { ...map.get(g.id), ...g, image: g.image || map.get(g.id)?.image || '' });
  return sanitizeCatalog([...map.values()]);
}

function loadConfig(file) {
  const base = defaultConfig();
  try {
    if (file && fs.existsSync(file)) {
      const cfg = applyConfigPatch(base, JSON.parse(fs.readFileSync(file, 'utf8')));
      Object.defineProperty(cfg, 'fromFile', { value: true, enumerable: false });
      return cfg;
    }
  } catch (e) {
    console.error('[config] lecture impossible, valeurs par défaut utilisées :', e.message);
  }
  return base;
}

function saveConfig(file, cfg) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, file);
}

module.exports = { defaultConfig, applyConfigPatch, loadConfig, saveConfig, mergeCatalog, NUMERIC_LIMITS };
