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

export const sfx = {
  whistle: () => {
    tone(2900, 0.12, { type: 'square', vol: 0.05 });
    tone(2700, 0.25, { type: 'square', vol: 0.05, when: 0.14 });
  },
  puck: () => tone(180, 0.08, { type: 'triangle', vol: 0.3, to: 90 }),
  good: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, { vol: 0.12, when: i * 0.1 })),
  bad: () => tone(300, 0.35, { type: 'sawtooth', vol: 0.06, to: 140 }),
  horn: () => {
    tone(220, 1.0, { type: 'sawtooth', vol: 0.08 });
    tone(277, 1.0, { type: 'sawtooth', vol: 0.06 });
  },
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
  return muted;
}
