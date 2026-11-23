'use strict';
// Liste affichée aux viewers : « tel cadeau → tel effet », construite à partir des réglages de l'onglet Cadeaux.
// La valeur d'un cadeau (diamond_count côté TikTok) correspond au prix en pièces TikTok que voit le viewer.

const { HARMFUL } = require('./game');

function effectText(rule, config) {
  const item = (config.items || []).find((i) => i.key === rule.param);
  const n = Number(rule.param) || 0;
  switch (rule.action) {
    case 'shake': return { icon: '🌹', text: 'Secousse de la machine' };
    case 'coinRain': return { icon: '🪙', text: `Pluie de ${n} jetons` };
    case 'spawn': {
      if (!item) return null;
      const pts = item.kind === 'chest' ? `${fmt(item.points)} à ${fmt(item.pointsMax || item.points)} pts` : `${fmt(item.points)} pts`;
      return { icon: '🎁', text: `${item.label} sur le plateau (${pts})`, item: item.key };
    }
    case 'queueSkip': return { icon: '⚡', text: n > 0 ? `Passe ${n} place${n > 1 ? 's' : ''} dans la file` : 'Passe en tête de la file' };
    case 'shield': return { icon: '🛡️', text: `Bouclier anti-pouvoirs (${config.shieldSeconds} s)` };
    case 'jinxShake': return { icon: '🌪️', text: 'Secoue la machine au lancer du joueur' };
    case 'deviate': return { icon: '↪️', text: 'Dévie le jeton du joueur' };
    case 'loseTokens': return { icon: '💥', text: `Le joueur perd ${n} jeton${n > 1 ? 's' : ''}` };
    case 'steal': return { icon: '🦹', text: `Vole ${n} jeton${n > 1 ? 's' : ''} au joueur` };
    default: return null;
  }
}

function fmt(n) { return Number(n).toLocaleString('fr-FR'); }

function costText(min, max) {
  if (max >= 99999) return `${fmt(min)} pièces et +`;
  if (min === max) return `${fmt(min)} pièce${min > 1 ? 's' : ''}`;
  return `${fmt(min)} à ${fmt(max)} pièces`;
}

function rewardsList(config) {
  const out = [];
  const catalog = config.giftCatalog || [];
  for (const r of config.giftRules || []) {
    if (config.peaceful && HARMFUL.includes(r.action)) continue; // pouvoirs coupés : on ne les annonce pas
    const eff = effectText(r, config);
    if (!eff) continue;
    if (r.giftId || r.name) {
      const g = catalog.find((x) => (r.giftId && x.id === String(r.giftId)) || x.name.toLowerCase() === String(r.name).toLowerCase());
      out.push({ gift: r.name || g?.name || 'Cadeau', image: g?.image || '', cost: g ? costText(g.diamonds, g.diamonds) : '', sort: g ? g.diamonds : 0, ...eff });
    } else {
      out.push({ gift: 'Cadeau', image: '', cost: costText(r.minDiamonds, r.maxDiamonds), sort: r.minDiamonds, ...eff });
    }
  }
  return out.sort((a, b) => a.sort - b.sort).map(({ sort, ...rest }) => rest);
}

module.exports = { rewardsList, effectText, costText };
