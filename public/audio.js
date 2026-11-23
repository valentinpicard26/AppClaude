'use strict';
/* Sons et musique du jeu, entièrement synthétisés dans le navigateur (Web Audio) :
   aucun fichier ni morceau existant, donc originaux et libres de droits par construction. */
window.TPAudio = (() => {
  let ctx = null, master = null, sfxBus = null, musicBus = null, reverb = null;
  const opts = { sounds: true, music: true, musicVolume: 35, sfxVolume: 70 };

  function setup() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createDynamicsCompressor(); // évite la saturation quand beaucoup de pièces tombent
    master.threshold.value = -14; master.ratio.value = 4;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.connect(master);
    // Petit écho doux pour la musique
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 1800;
    delay.connect(tone).connect(fb).connect(delay);
    reverb = ctx.createGain(); reverb.gain.value = 0.5;
    reverb.connect(delay); tone.connect(musicBus);
    applyVolumes();
  }

  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    sfxBus.gain.setTargetAtTime(opts.sounds ? (opts.sfxVolume / 100) * 0.9 : 0, t, 0.05);
    musicBus.gain.setTargetAtTime(opts.music ? (opts.musicVolume / 100) * 0.55 : 0, t, 0.3);
  }

  // À appeler sur un toucher de l'écran (les navigateurs bloquent le son avant).
  function unlock() {
    try {
      if (!ctx) setup();
      if (ctx.state === 'suspended') ctx.resume();
      startMusic();
    } catch { /* pas de son disponible */ }
    return isOn();
  }
  function isOn() { return !!ctx && ctx.state === 'running'; }

  function setOptions(o) {
    Object.assign(opts, o || {});
    applyVolumes();
  }

  // ---------- Bruitages ----------
  // Tintement métallique : quelques partiels inharmoniques qui s'éteignent vite, comme une pièce.
  function clink(t, { pitch = 1, vol = 0.5, decay = 0.35 } = {}) {
    const base = 2350 * pitch * (0.96 + Math.random() * 0.08);
    const partials = [[1, 1], [1.52, 0.6], [2.11, 0.45], [2.73, 0.3], [3.9, 0.15]];
    for (const [ratio, amp] of partials) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = base * ratio;
      const d = decay * (1.1 - ratio * 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * amp * 0.25, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, d));
      o.connect(g).connect(sfxBus); o.start(t); o.stop(t + d + 0.05);
    }
    // petit bruit d'impact
    noise(t, 0.03, 6000, vol * 0.25);
  }
  function noise(t, dur, freq, vol) {
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(sfxBus); src.start(t);
  }
  function tone(t, f, d, { type = 'sine', vol = 0.15, f2 = null } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(sfxBus); o.start(t); o.stop(t + d + 0.02);
  }

  let lastFall = 0;
  function sfx(kind) {
    if (!ctx || !opts.sounds || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.01;
    switch (kind) {
      case 'fall': {
        // Pièce qui tombe dans le bac : 2 ou 3 rebonds. Limité si beaucoup tombent en même temps.
        if (t - lastFall < 0.05) return;
        lastFall = t;
        clink(t, { pitch: 1, vol: 0.55 });
        clink(t + 0.09 + Math.random() * 0.03, { pitch: 1.05, vol: 0.3, decay: 0.25 });
        if (Math.random() < 0.6) clink(t + 0.17, { pitch: 1.1, vol: 0.15, decay: 0.18 });
        break;
      }
      case 'land': clink(t, { pitch: 0.8, vol: 0.3, decay: 0.2 }); break; // jeton qui se pose sur le plateau
      case 'launch': noise(t, 0.12, 900, 0.25); tone(t, 700, 0.12, { type: 'triangle', vol: 0.06, f2: 350 }); break;
      case 'big':
        [0, 4, 7, 12, 16].forEach((st, i) => tone(t + i * 0.08, 784 * 2 ** (st / 12), 0.35, { type: 'triangle', vol: 0.12 }));
        for (let i = 0; i < 6; i++) clink(t + 0.1 + i * 0.07, { pitch: 1 + i * 0.05, vol: 0.3 });
        break;
      case 'shake': noise(t, 0.5, 120, 0.9); tone(t, 70, 0.45, { type: 'sine', vol: 0.25, f2: 45 }); break;
      case 'turn': tone(t, 880, 0.12, { vol: 0.08 }); tone(t + 0.1, 1318, 0.2, { vol: 0.08 }); break;
      case 'power': tone(t, 220, 0.3, { type: 'sawtooth', vol: 0.07, f2: 90 }); noise(t, 0.25, 400, 0.4); break;
      case 'shield': tone(t, 523, 0.4, { vol: 0.1, f2: 1046 }); tone(t + 0.12, 784, 0.4, { vol: 0.08 }); break;
      default: break;
    }
  }

  // ---------- Musique d'ambiance générée ----------
  // Accords doux (Fa maj7 – Sol6 – Mi m7 – La m7), basse ronde et petites notes pentatoniques : calme, pas agaçant.
  const BPM = 74;
  const BEAT = 60 / BPM;
  const CHORDS = [
    { root: 41, notes: [53, 57, 60, 64] }, // Fa maj7
    { root: 43, notes: [55, 59, 62, 64] }, // Sol 6
    { root: 40, notes: [52, 55, 59, 62] }, // Mi m7
    { root: 45, notes: [57, 60, 64, 67] }, // La m7
  ];
  const PENTA = [69, 72, 74, 76, 79, 81, 84];
  const midi = (n) => 440 * 2 ** ((n - 69) / 12);
  let musicTimer = null, nextBar = 0, bar = 0;

  function pad(t, notes, dur) {
    for (const n of notes) {
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'triangle'; o.frequency.value = midi(n); o.detune.value = det;
        f.type = 'lowpass'; f.frequency.value = 900;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.03, t + 1.2);
        g.gain.setValueAtTime(0.03, t + dur - 1);
        g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.8);
        o.connect(f).connect(g).connect(musicBus); o.start(t); o.stop(t + dur + 1);
      }
    }
  }
  function bass(t, n, d) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = midi(n);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(musicBus); o.start(t); o.stop(t + d + 0.05);
  }
  function pluck(t, n, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = midi(n);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(g); g.connect(musicBus); g.connect(reverb);
    o.start(t); o.stop(t + 1.2);
  }
  function scheduleBar(t) {
    const c = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    const len = BEAT * 4;
    if (bar % 2 === 0) pad(t, c.notes, len * 2);
    bass(t, c.root, BEAT * 1.8);
    bass(t + BEAT * 2, c.root + (bar % 2 ? 7 : 0), BEAT * 1.6);
    // Petites notes : une sur deux environ, choisies proches de l'accord
    for (let i = 0; i < 8; i++) {
      if (Math.random() < 0.42) {
        const n = PENTA[Math.floor(Math.random() * PENTA.length)];
        pluck(t + i * BEAT / 2 + Math.random() * 0.02, n, 0.05 + Math.random() * 0.03);
      }
    }
    bar++;
  }
  function startMusic() {
    if (musicTimer || !ctx) return;
    nextBar = ctx.currentTime + 0.3;
    musicTimer = setInterval(() => {
      if (!opts.music || ctx.state !== 'running') { nextBar = Math.max(nextBar, ctx.currentTime + 0.1); return; }
      while (nextBar < ctx.currentTime + 1.5) { scheduleBar(nextBar); nextBar += BEAT * 4; }
    }, 300);
  }

  return { unlock, isOn, setOptions, sfx };
})();
