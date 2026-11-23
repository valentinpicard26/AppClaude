'use strict';
// Connecteur TikTok LIVE (bibliothèque non officielle tiktok-live-connector).
// Traduit les événements du live en événements du jeu : { type, userId, nickname, ... }.
// NON TESTÉ sur un vrai live à ce stade (étape 5 du plan) : le simulateur sert pour tout le reste.

class TikTokSource {
  constructor({ onEvent, onStatus, log = console.log }) {
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.log = log;
    this.conn = null;
    this.status = { state: 'disconnected', username: null, error: null, viewers: 0 };
  }

  setStatus(patch) {
    this.status = { ...this.status, ...patch };
    this.onStatus(this.status);
  }

  async connect(username, { signApiKey } = {}) {
    await this.disconnect();
    username = String(username || '').replace(/^@/, '').trim();
    if (!username) throw new Error('Pseudo TikTok manquant');
    let lib;
    try {
      lib = require('tiktok-live-connector');
    } catch (e) {
      this.setStatus({ state: 'error', error: 'Bibliothèque tiktok-live-connector non installée' });
      throw e;
    }
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = lib;
    // enableExtendedGiftInfo reste coupé : il demande la liste des cadeaux à chaque connexion, et Euler Stream
    // réserve cette fonction à son offre payante « Business ». Le nom et la valeur arrivent avec chaque cadeau.
    const options = { enableExtendedGiftInfo: false, processInitialData: false };
    if (signApiKey) options.signApiKey = signApiKey;
    const conn = new TikTokLiveConnection(username, options);
    this.conn = conn;
    this.setStatus({ state: 'connecting', username, error: null });

    const user = (d) => {
      const u = d.user || d;
      // userId est stable ; uniqueId (@pseudo) peut changer : on identifie par userId.
      const userId = u.userId ?? u.id ?? u.uniqueId;
      return { userId: userId !== undefined && userId !== null ? String(userId) : '', uniqueId: u.uniqueId, nickname: u.nickname || u.uniqueId,
        isFollower: Number(u.followInfo?.followStatus) >= 1 };
    };
    const emit = (ev) => { if (ev.userId) this.onEvent(ev); };

    conn.on(WebcastEvent.MEMBER, (d) => emit({ type: 'join', ...user(d) }));
    conn.on(WebcastEvent.CHAT, (d) => emit({ type: 'chat', ...user(d), comment: d.comment }));
    conn.on(WebcastEvent.LIKE, (d) => emit({ type: 'like', ...user(d), likeCount: d.likeCount }));
    conn.on(WebcastEvent.FOLLOW, (d) => emit({ type: 'follow', ...user(d) }));
    conn.on(WebcastEvent.GIFT, (d) => {
      const giftType = d.giftDetails?.giftType ?? d.giftType;
      if (giftType === 1 && !d.repeatEnd) return; // série en cours : on compte seulement à la fin (pas de doublon)
      const ext = d.extendedGiftInfo || {};
      emit({
        type: 'gift', ...user(d),
        giftId: d.giftId !== undefined ? String(d.giftId) : '',
        giftImage: d.giftDetails?.giftImage?.giftPictureUrl || ext.image?.url_list?.[0] || '',
        giftName: d.giftDetails?.giftName || ext.name || d.giftName || '',
        diamondCount: d.giftDetails?.diamondCount ?? ext.diamond_count ?? d.diamondCount ?? 0,
        repeatCount: d.repeatCount || 1,
      });
    });
    conn.on(WebcastEvent.ROOM_USER, (d) => this.setStatus({ viewers: d.viewerCount || 0 }));
    conn.on(WebcastEvent.STREAM_END, () => this.setStatus({ state: 'ended' }));
    conn.on(ControlEvent.DISCONNECTED, () => { if (this.conn === conn) this.setStatus({ state: 'disconnected' }); });
    conn.on(ControlEvent.ERROR, (err) => this.log('[tiktok] erreur', err?.message || err));

    try {
      await conn.connect();
      this.setStatus({ state: 'connected' });
    } catch (e) {
      this.conn = null;
      const msg = explainError(e);
      this.setStatus({ state: 'error', error: msg });
      throw new Error(msg);
    }
  }

  // Liste des cadeaux disponibles. Avec un live lié, on utilise la connexion ; sinon on tente de retrouver
  // la salle du créateur à partir de son pseudo (peut échouer s'il n'est pas en direct).
  async fetchGifts(username, { signApiKey } = {}) {
    const { TikTokLiveConnection } = require('tiktok-live-connector');
    let conn = this.conn;
    if (!conn) {
      username = String(username || '').replace(/^@/, '').trim();
      if (!username) throw new Error('Pseudo TikTok manquant (onglet Live)');
      conn = new TikTokLiveConnection(username, signApiKey ? { signApiKey } : {});
      await conn.fetchRoomId();
    }
    let raw;
    try {
      raw = (conn.availableGifts && conn.availableGifts.length ? conn.availableGifts : await conn.fetchAvailableGifts()) || [];
    } catch (e) {
      throw new Error(explainError(e));
    }
    const list = Array.isArray(raw) ? raw : (raw.gifts || []);
    return list.map((g) => ({
      id: g.id ?? g.giftId,
      name: g.name || g.giftName || g.describe || '',
      diamonds: g.diamond_count ?? g.diamondCount ?? 0,
      image: g.image?.url_list?.[0] || g.icon?.url_list?.[0] || g.image?.urlList?.[0] || '',
    }));
  }

  async disconnect() {
    const c = this.conn;
    this.conn = null;
    if (c) { try { await c.disconnect(); } catch { /* ignore */ } }
    this.setStatus({ state: 'disconnected', viewers: 0 });
  }
}

// Traduit les erreurs connues du connecteur en explication claire, en gardant le message d'origine.
function explainError(e) {
  const raw = String(e?.message || e || '').slice(0, 300);
  let fr = '';
  if (/Business plan|requires a .*plan|PremiumFeature|paid plan/i.test(raw)) {
    fr = 'Fonction réservée à l\'offre payante d\'Euler Stream (service de signature).';
  } else if (/isn't online|UserOffline|offline/i.test(raw)) {
    fr = 'Le compte n\'est pas en direct : lance d\'abord le live sur TikTok, puis « Lier le live ».';
  } else if (/captcha|blocked/i.test(raw)) {
    fr = 'TikTok semble bloquer le serveur.';
  } else if (/rate ?limit|too many/i.test(raw)) {
    fr = 'Trop de demandes au service de signature : attends quelques minutes ou vérifie la clé.';
  } else if (/lack of permission|401|403|Forbidden|Unauthorized/i.test(raw)) {
    fr = 'Accès refusé par le service de signature : vérifie la clé TIKTOK_SIGN_API_KEY.';
  }
  return fr ? `${fr} (${raw})` : raw;
}

module.exports = { TikTokSource, explainError };
