'use strict';
// Liste affichée aux viewers : « tel cadeau → tel effet », construite à partir des liaisons de l'onglet Cadeaux.
// Le prix TikTok n'est pas affiché, pour ne pas confondre les pièces TikTok avec les jetons du jeu.

const { HARMFUL } = require('./game');
const { findEffect } = require('./effects');

function rewardsList(config) {
  const catalog = config.giftCatalog || [];
  const key = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
  const out = [];
  for (const r of config.giftRules || []) {
    if (!r.name && !r.giftId) continue;
    if (config.peaceful && HARMFUL.includes(r.action)) continue; // pouvoirs coupés : on ne les annonce pas
    const eff = findEffect(r, config);
    if (!eff) continue;
    const g = catalog.find((x) => (r.giftId && x.id === String(r.giftId))) || catalog.find((x) => key(x.name) === key(r.name));
    let text = eff.label;
    if (r.action === 'shield') text = `Bouclier contre les pouvoirs (${config.shieldSeconds} s)`;
    out.push({ gift: g?.name || r.name, image: g?.image || '', icon: eff.icon, text, item: eff.item || null, sort: g ? g.diamonds : 0 });
  }
  return out.sort((a, b) => a.sort - b.sort).map(({ sort, ...rest }) => rest);
}

module.exports = { rewardsList };
