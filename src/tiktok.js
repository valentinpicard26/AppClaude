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
    const options = { enableExtendedGiftInfo: true, processInitialData: false };
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
      this.setStatus({ state: 'error', error: String(e?.message || e).slice(0, 300) });
      throw e;
    }
  }

  async disconnect() {
    const c = this.conn;
    this.conn = null;
    if (c) { try { await c.disconnect(); } catch { /* ignore */ } }
    this.setStatus({ state: 'disconnected', viewers: 0 });
  }
}

module.exports = { TikTokSource };
