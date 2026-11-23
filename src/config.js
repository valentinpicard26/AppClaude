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
  const weights = { 20: 30, 40: 22, 60: 15, 80: 10, 100: 8, 120: 5, 140: 4, 160: 3, 180: 2, 200: 1 };
  for (const v of [20, 40, 60, 80, 100, 120, 140, 160, 180, 200]) {
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
// spawn (objet bonus, param = clé d'objet), queueSkip (passer devant, param = nombre de places, 0 = tout devant), none.
function defaultGiftRules() {
  return [
    { name: 'Rose', minDiamonds: 0, maxDiamonds: 0, action: 'shake', param: 1 },
    { name: '', minDiamonds: 1, maxDiamonds: 9, action: 'shake', param: 1 },
    { name: '', minDiamonds: 10, maxDiamonds: 29, action: 'queueSkip', param: 3 },
    { name: '', minDiamonds: 30, maxDiamonds: 98, action: 'coinRain', param: 5 },
    { name: '', minDiamonds: 99, maxDiamonds: 198, action: 'spawn', param: 'diamant' },
    { name: '', minDiamonds: 199, maxDiamonds: 298, action: 'spawn', param: 'rubis' },
    { name: '', minDiamonds: 299, maxDiamonds: 498, action: 'spawn', param: 'emeraude' },
    { name: '', minDiamonds: 499, maxDiamonds: 998, action: 'spawn', param: 'amethyste' },
    { name: '', minDiamonds: 999, maxDiamonds: 2998, action: 'spawn', param: 'topaze' },
    { name: '', minDiamonds: 2999, maxDiamonds: 4998, action: 'spawn', param: 'cristal' },
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
    // Divers
    liveUsername: '',
    sounds: true,
    blockedNames: '',           // pseudos ou identifiants bloqués, séparés par des virgules
    items: defaultItems(),
    giftRules: defaultGiftRules(),
  };
}

const NUMERIC_LIMITS = {
  turnSeconds: [3, 60], afterLaunchMs: [0, 5000], graceSeconds: [0, 15], maxMissedTurns: [1, 20],
  startTokens: [0, 100], maxTokens: [1, 200], likesPerRefill: [1, 100000], tokensPerLikeRefill: [0, 100],
  followTokens: [0, 100], coinsOnPlate: [0, 200], ticketsOnPlate: [0, 30], maxObjects: [20, 300],
  pusherStroke: [20, 150], pusherPeriodSeconds: [1, 10], sideGapRatio: [0, 0.8], shakeIntensity: [1, 10],
  shakeDurationMs: [100, 3000], coinRainDelayMs: [50, 2000],
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
      const actions = ['shake', 'coinRain', 'spawn', 'queueSkip', 'none'];
      out.giftRules = v.slice(0, 50).filter((r) => r && actions.includes(r.action)).map((r) => ({
        name: String(r.name || '').slice(0, 60),
        minDiamonds: Math.max(0, Number(r.minDiamonds) || 0),
        maxDiamonds: Math.max(0, Number(r.maxDiamonds) || 0),
        action: r.action,
        param: r.action === 'spawn' ? String(r.param || 'diamant') : Math.max(0, Math.round(Number(r.param) || 0)),
      }));
    }
  }
  if (out.startTokens > out.maxTokens) out.startTokens = out.maxTokens;
  return out;
}

function loadConfig(file) {
  const base = defaultConfig();
  try {
    if (file && fs.existsSync(file)) {
      return applyConfigPatch(base, JSON.parse(fs.readFileSync(file, 'utf8')));
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

module.exports = { defaultConfig, applyConfigPatch, loadConfig, saveConfig, NUMERIC_LIMITS };
