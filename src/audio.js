// Petits sons synthétisés (aucun fichier à télécharger) et voix off en français.
let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem('tetehaute.muted') === '1';
} catch {
  /* stockage indisponible */
}

export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq, dur, { type = 'sine', vol = 0.15, when = 0, to } = {}) {
  if (muted || !ctx) return;
  const t0 = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

// Bruit (pour la foule et le patinage), généré une fois.
let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) {
      b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); // bruit « rose » : plus doux
      d[i] = b * 6;
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  return src;
}

/** Clameur du public : le bruit monte puis retombe. */
function cheer(vol = 0.22, dur = 2.4) {
  if (muted || !ctx) return;
  const t0 = ctx.currentTime;
  const src = noise();
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 900;
  f.Q.value = 0.6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.25);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

// Ambiance de patinoire pendant le jeu : murmure du public, très discret.
let ambience = null;
export function setAmbience(on) {
  if (!ctx) return;
  if (on && !muted && !ambience) {
    const src = noise();
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 1.2);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
    ambience = { src, g };
  } else if ((!on || muted) && ambience) {
    const a = ambience;
    ambience = null;
    a.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
    a.src.stop(ctx.currentTime + 1.2);
  }
}

export const sfx = {
  whistle: () => {
    tone(2900, 0.12, { type: 'square', vol: 0.05 });
    tone(2700, 0.25, { type: 'square', vol: 0.05, when: 0.14 });
  },
  puck: () => tone(180, 0.08, { type: 'triangle', vol: 0.3, to: 90 }),
  good: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, { vol: 0.12, when: i * 0.1 })),
  bad: () => tone(300, 0.35, { type: 'sawtooth', vol: 0.06, to: 140 }),
  // Sirène de but (accord grave, comme dans une patinoire) et le public qui se lève.
  horn: () => {
    tone(220, 1.6, { type: 'sawtooth', vol: 0.08 });
    tone(277, 1.6, { type: 'sawtooth', vol: 0.06 });
    tone(330, 1.6, { type: 'sawtooth', vol: 0.04 });
    cheer(0.25, 3);
  },
  cheer: () => cheer(0.12, 1.6),
  ooh: () => cheer(0.08, 1.0),
};

export function speak(text) {
  if (muted || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[^\p{L}\p{N}\s.,!?'°-]/gu, ''));
    u.lang = 'fr-FR';
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  } catch {
    /* voix indisponible */
  }
}

export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem('tetehaute.muted', muted ? '1' : '0');
  } catch {
    /* rien */
  }
  if (muted && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  if (muted) setAmbience(false);
  return muted;
}
