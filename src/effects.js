'use strict';
// Liste des effets qu'un cadeau peut déclencher. C'est la seule liste à compléter quand on ajoute un pouvoir :
// elle est envoyée à l'application de contrôle, qui la propose dans le menu de chaque cadeau.

const BASE_EFFECTS = [
  { id: 'shake', action: 'shake', param: 1, icon: '🌹', label: 'Secousse de la machine', group: 'Effets doux' },
  { id: 'coinRain2', action: 'coinRain', param: 2, icon: '🪙', label: 'Pluie de 2 jetons', group: 'Effets doux' },
  { id: 'coinRain5', action: 'coinRain', param: 5, icon: '🪙', label: 'Pluie de 5 jetons', group: 'Effets doux' },
  { id: 'coinRain10', action: 'coinRain', param: 10, icon: '🪙', label: 'Pluie de 10 jetons', group: 'Effets doux' },
  { id: 'queueSkip2', action: 'queueSkip', param: 2, icon: '⚡', label: 'Passe 2 places dans la file', group: 'Effets doux' },
  { id: 'queueFront', action: 'queueSkip', param: 0, icon: '⚡', label: 'Passe en tête de la file', group: 'Effets doux' },
  { id: 'shield', action: 'shield', param: 0, icon: '🛡️', label: 'Bouclier contre les pouvoirs', group: 'Protection' },
  { id: 'jinxShake', action: 'jinxShake', param: 1, icon: '🌪️', label: 'Secoue la machine au lancer du joueur', group: 'Pouvoirs qui gênent' },
  { id: 'deviate', action: 'deviate', param: 1, icon: '↪️', label: 'Dévie le jeton du joueur', group: 'Pouvoirs qui gênent' },
  { id: 'lose2', action: 'loseTokens', param: 2, icon: '💥', label: 'Le joueur perd 2 jetons', group: 'Pouvoirs qui gênent' },
  { id: 'lose3', action: 'loseTokens', param: 3, icon: '💥', label: 'Le joueur perd 3 jetons', group: 'Pouvoirs qui gênent' },
  { id: 'steal3', action: 'steal', param: 3, icon: '🦹', label: 'Vole 3 jetons au joueur', group: 'Pouvoirs qui gênent' },
];

function fmt(n) { return Number(n).toLocaleString('fr-FR'); }

// Liste complète, avec un effet « faire apparaître » par objet bonus (gemmes, coffre), selon les réglages en cours.
function effectsList(config) {
  // Les pierres précieuses apparaissent d'elles-mêmes au hasard : seul le coffre est déclenché par un cadeau.
  const spawns = (config?.items || []).filter((i) => i.kind === 'chest').map((i) => ({
    id: 'spawn:' + i.key, action: 'spawn', param: i.key, icon: '🎁', item: i.key, group: 'Objets bonus',
    label: `${i.label} sur le plateau (${i.kind === 'chest' ? `${fmt(i.points)} à ${fmt(i.pointsMax || i.points)}` : fmt(i.points)} pts)`,
  }));
  return [...BASE_EFFECTS, ...spawns];
}

function effectToRule(id) {
  if (String(id).startsWith('spawn:')) return { action: 'spawn', param: String(id).slice(6) };
  const e = BASE_EFFECTS.find((x) => x.id === id);
  return e ? { action: e.action, param: e.param } : { action: 'none', param: 0 };
}

// Retrouve l'effet de la liste qui correspond à une liaison (action + paramètre).
function findEffect(rule, config) {
  return effectsList(config).find((e) => e.action === rule.action && String(e.param) === String(rule.param)) || null;
}

module.exports = { effectsList, effectToRule, findEffect, BASE_EFFECTS };
