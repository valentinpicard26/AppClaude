'use strict';
// Liste des effets (pouvoirs) qu'un cadeau TikTok peut déclencher. C'est la seule liste à compléter quand on ajoute
// un pouvoir : elle est envoyée à l'application de contrôle, qui la propose dans le menu de chaque cadeau.

// Pouvoirs proposés dans le contrôle (choix du créateur).
const EFFECTS = [
  { id: 'shake', action: 'shake', param: 1, icon: '🌹', label: 'Secousse de la machine' },
  { id: 'jinxShake', action: 'jinxShake', param: 1, icon: '🌪️', label: 'Secousse pendant le lancer du joueur' },
  { id: 'steal3', action: 'steal', param: 3, icon: '🦹', label: 'Vole 3 jetons au joueur' },
  { id: 'lose3', action: 'loseTokens', param: 3, icon: '💥', label: 'Le joueur perd 3 jetons' },
  { id: 'block1', action: 'blockSlot', param: 0, icon: '🔒', label: 'Bloque la fente 1 pendant le tour du joueur' },
  { id: 'block2', action: 'blockSlot', param: 1, icon: '🔒', label: 'Bloque la fente 2 pendant le tour du joueur' },
  { id: 'block3', action: 'blockSlot', param: 2, icon: '🔒', label: 'Bloque la fente 3 pendant le tour du joueur' },
];

// Effets retirés du menu, mais toujours gérés par le moteur (pour pouvoir les remettre facilement plus tard).
const RETIRED_EFFECTS = [
  { id: 'coinRain2', action: 'coinRain', param: 2, icon: '🪙', label: 'Pluie de 2 jetons' },
  { id: 'coinRain5', action: 'coinRain', param: 5, icon: '🪙', label: 'Pluie de 5 jetons' },
  { id: 'coinRain10', action: 'coinRain', param: 10, icon: '🪙', label: 'Pluie de 10 jetons' },
  { id: 'queueSkip2', action: 'queueSkip', param: 2, icon: '⚡', label: 'Passe 2 places dans la file' },
  { id: 'queueFront', action: 'queueSkip', param: 0, icon: '⚡', label: 'Passe en tête de la file' },
  { id: 'shield', action: 'shield', param: 0, icon: '🛡️', label: 'Bouclier contre les pouvoirs' },
  { id: 'deviate', action: 'deviate', param: 1, icon: '↪️', label: 'Dévie le jeton du joueur' },
  { id: 'lose2', action: 'loseTokens', param: 2, icon: '💥', label: 'Le joueur perd 2 jetons' },
];

function fmt(n) { return Number(n).toLocaleString('fr-FR'); }

function chestEffects(config) {
  return (config?.items || []).filter((i) => i.kind === 'chest').map((i) => ({
    id: 'spawn:' + i.key, action: 'spawn', param: i.key, icon: '🎁', item: i.key,
    label: `Fait tomber le ${i.label.toLowerCase()} sur le plateau (${fmt(i.points)} à ${fmt(i.pointsMax || i.points)} pts)`,
  }));
}

// Liste proposée dans le menu « effet » du contrôle, sans classement.
function effectsList(config) {
  return [...EFFECTS, ...chestEffects(config)];
}

// Tous les effets que le moteur sait jouer (y compris ceux retirés du menu).
function allEffects(config) {
  return [...EFFECTS, ...chestEffects(config), ...RETIRED_EFFECTS];
}

function effectToRule(id) {
  if (String(id).startsWith('spawn:')) return { action: 'spawn', param: String(id).slice(6) };
  const e = [...EFFECTS, ...RETIRED_EFFECTS].find((x) => x.id === id);
  return e ? { action: e.action, param: e.param } : { action: 'none', param: 0 };
}

// Retrouve l'effet qui correspond à une liaison (action + paramètre).
function findEffect(rule, config) {
  return allEffects(config).find((e) => e.action === rule.action && String(e.param) === String(rule.param)) || null;
}

module.exports = { effectsList, allEffects, effectToRule, findEffect, EFFECTS, RETIRED_EFFECTS };
