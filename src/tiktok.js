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

    const emit = (ev) => { if (ev && ev.userId) this.onEvent(ev); };
    conn.on(WebcastEvent.MEMBER, (d) => emit(mapEvent('join', d)));
    conn.on(WebcastEvent.CHAT, (d) => emit(mapEvent('chat', d)));
    conn.on(WebcastEvent.LIKE, (d) => emit(mapEvent('like', d)));
    conn.on(WebcastEvent.FOLLOW, (d) => emit(mapEvent('follow', d)));
    conn.on(WebcastEvent.GIFT, (d) => emit(mapEvent('gift', d)));
    conn.on(WebcastEvent.ROOM_USER, (d) => this.setStatus({ viewers: Number(d.viewerCount ?? d.total ?? d.totalUser) || 0 }));
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

// Traduit un événement brut de la bibliothèque en événement du jeu.
// La version 2.x de tiktok-live-connector transmet les messages TikTok « bruts » (format v3) :
// commentaire dans `content`, likes dans `count`, identifiant dans `user.id`, cadeau dans `gift`.
// Les anciens noms (comment, likeCount, userId, giftDetails) restent acceptés.
function mapEvent(type, d) {
  if (!d) return null;
  const u = d.user || {};
  const id = u.userId ?? u.id;
  const uniqueId = u.uniqueId || u.displayId || '';
  const base = {
    type,
    userId: id !== undefined && id !== null && id !== '' && id !== '0' ? String(id) : String(uniqueId || ''),
    uniqueId,
    nickname: u.nickname || uniqueId,
    avatar: u.avatarThumb?.urlList?.[0] || u.avatarThumb?.url_list?.[0] || u.profilePictureUrl || '',
    isFollower: Number(u.followInfo?.followStatus) >= 1,
  };
  switch (type) {
    case 'chat': return { ...base, comment: d.comment ?? d.content ?? '' };
    case 'like': return { ...base, likeCount: Number(d.likeCount ?? d.count) || 0 };
    case 'gift': {
      const g = d.gift || {};
      const det = d.giftDetails || {};
      const ext = d.extendedGiftInfo || {};
      const giftType = det.giftType ?? g.type ?? d.giftType;
      // Cadeau en série (combo) : on attend la fin de la série pour compter une seule fois, sans doublon.
      if (Number(giftType) === 1 && !d.repeatEnd) return null;
      const img = g.image?.urlList?.[0] || g.icon?.urlList?.[0] || det.giftImage?.giftPictureUrl || ext.image?.url_list?.[0] || '';
      const giftId = d.giftId ?? g.id;
      return {
        ...base,
        giftId: giftId !== undefined && giftId !== null ? String(giftId) : '',
        giftImage: img,
        giftName: g.name || det.giftName || ext.name || d.giftName || '',
        diamondCount: Number(g.diamondCount ?? det.diamondCount ?? ext.diamond_count ?? d.diamondCount) || 0,
        repeatCount: Number(d.repeatCount) || 1,
      };
    }
    default: return base;
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

module.exports = { TikTokSource, explainError, mapEvent };
