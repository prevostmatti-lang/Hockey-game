// « Tête haute ! » : le joueur patine en vue première personne, passe et tire d'un swipe.
//   - doigt appuyé : patiner ; le glisser à gauche ou à droite : tourner
//   - swipe vers le haut : passe ou tir, dans la direction du swipe, d'autant plus fort que le swipe est rapide
//   - boutons 👀 : regarder par-dessus l'épaule
import { LEVELS, SCENARIOS } from './scenarios.js';
import { explain, describeOption } from './evaluate.js';
import { createSim, angleTo, wrap } from './sim.js';
import { createWorld } from './world.js';
import { drawReplay } from './diagram.js';
import { sfx, speak, unlockAudio, toggleMute, isMuted } from './audio.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const world = createWorld(canvas);

const STORE_KEY = 'tetehaute.v1';
const HAND_KEY = 'tetehaute.hand';
const END_DELAY = 1.5;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const G = {
  phase: 'menu',
  hand: null,
  level: null,
  queue: [],
  index: 0,
  sim: null,
  meshes: [],
  evIdx: 0,
  seen: new Set(),
  radar: null,
  results: [],
  menuYaw: 0,
  shown: false,
};

// ---------- sauvegarde locale ----------
function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible */
  }
}

// ---------- écrans ----------
const SCREENS = ['#hand', '#menu', '#intro', '#result', '#summary'];
function showScreen(id) {
  for (const s of SCREENS) $(s).hidden = s !== id;
  $('#hud').hidden = id !== null;
}

function setHand(hand) {
  G.hand = hand;
  save(HAND_KEY, hand);
  world.setHand(hand);
  goMenu();
}

function renderMenu() {
  const best = load(STORE_KEY, { best: {} }).best || {};
  const list = $('#levels');
  list.innerHTML = '';
  for (const l of LEVELS) {
    const n = SCENARIOS.filter((s) => s.level === l.id).length;
    const b = document.createElement('button');
    b.className = 'level';
    b.style.setProperty('--c', l.color);
    b.innerHTML = `<span class="lv-name">${l.name}</span><span class="lv-ages">${l.ages}</span><span class="lv-stars">⭐ ${best[l.id] || 0} / ${n * 3}</span>`;
    b.addEventListener('click', () => startLevel(l.id));
    list.appendChild(b);
  }
  $('#hand-label').textContent = G.hand === 'L' ? 'à gauche (gaucher)' : 'à droite (droitier)';
  $('#portrait-tip').hidden = window.innerWidth > window.innerHeight;
}

function goMenu() {
  G.phase = 'menu';
  G.sim = null;
  world.clearActors();
  world.setStickVisible(false);
  world.setHolding(false);
  world.puck.position.set(0, 0.02, 0);
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  if (!G.hand) {
    showScreen('#hand');
    return;
  }
  renderMenu();
  showScreen('#menu');
}

// ---------- déroulement ----------
function startLevel(levelId) {
  unlockAudio();
  G.level = LEVELS.find((l) => l.id === levelId);
  G.queue = SCENARIOS.filter((s) => s.level === levelId);
  G.index = 0;
  G.results = [];
  showIntro();
}

function loadScenario(scn) {
  G.sim = createSim(scn, G.level, G.hand);
  G.evIdx = 0;
  G.seen = new Set();
  G.radar = null;
  G.shown = false;
  world.clearActors();
  world.setStickVisible(true);
  G.meshes = G.sim.state.actors.map((a) => world.addActor({ team: a.team, num: a.num, goalie: a.goalie }));
  syncRender();
}

function showIntro() {
  const scn = G.queue[G.index];
  loadScenario(scn);
  G.phase = 'intro';
  $('#intro-step').textContent = `${G.level.name} · Situation ${G.index + 1} / ${G.queue.length}`;
  $('#intro-title').textContent = scn.title;
  $('#intro-text').innerHTML = `Le n°${scn.passer.num} va te passer le palet.<br /><b>Avant qu’il arrive, regarde où sont tes coéquipiers 👀</b>`;
  showScreen('#intro');
}

function beginPlay() {
  unlockAudio();
  G.phase = 'play';
  resetInput();
  $('#hud-level').textContent = G.level.name;
  $('#hud-step').textContent = `${G.index + 1} / ${G.queue.length}`;
  $('#ctl-hint').hidden = G.index > 0;
  setBanner('👀 Regarde autour de toi !', 'scan');
  showScreen(null);
  sfx.whistle();
  speak('Regarde autour de toi avant de recevoir le palet !');
}

// ---------- contrôles ----------
const input = { skate: false, turn: 0, head: 0 };
const pointers = new Map();
let skateId = null;
let lookBtn = 0;
const keys = new Set();

function resetInput() {
  pointers.clear();
  skateId = null;
  lookBtn = 0;
  keys.clear();
}

function updateInput() {
  const sp = skateId != null ? pointers.get(skateId) : null;
  input.skate = !!sp || keys.has('ArrowUp') || keys.has('w') || keys.has('z');
  let turn = 0;
  if (sp) {
    const last = sp.samples[sp.samples.length - 1];
    const dx = (last.x - sp.x0) / (canvas.clientWidth * 0.18);
    turn = Math.abs(dx) < 0.08 ? 0 : clamp(dx, -1, 1);
  }
  if (keys.has('ArrowLeft')) turn = -1;
  if (keys.has('ArrowRight')) turn = 1;
  input.turn = turn;
  input.head = lookBtn || (keys.has('q') || keys.has('a') ? 1 : keys.has('e') ? -1 : 0);
}

canvas.addEventListener('pointerdown', (e) => {
  if (G.phase !== 'play') return;
  e.preventDefault();
  const now = performance.now();
  pointers.set(e.pointerId, { x0: e.clientX, y0: e.clientY, samples: [{ t: now, x: e.clientX, y: e.clientY }] });
  if (skateId == null) skateId = e.pointerId;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* pointeur synthétique */
  }
  $('#ctl-hint').hidden = true;
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const now = performance.now();
  p.samples.push({ t: now, x: e.clientX, y: e.clientY });
  while (p.samples.length > 2 && now - p.samples[0].t > 400) p.samples.shift();
});

function endPointer(e, isUp) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);
  if (isUp) {
    p.samples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    tryFlick(p);
  }
  if (e.pointerId === skateId) {
    // Si un autre doigt est posé, il prend le relais pour patiner.
    const next = pointers.keys().next();
    skateId = next.done ? null : next.value;
    if (!next.done) {
      const q = pointers.get(skateId);
      const last = q.samples[q.samples.length - 1];
      q.x0 = last.x;
    }
  }
}
canvas.addEventListener('pointerup', (e) => endPointer(e, true));
canvas.addEventListener('pointercancel', (e) => endPointer(e, false));

/** Un swipe rapide vers le haut lâche le palet : la direction donne la visée, la vitesse donne la force. */
function tryFlick(p) {
  if (G.phase !== 'play' || !G.sim) return false;
  const st = G.sim.state;
  if (st.puck.owner !== st.me) return false;
  const S = p.samples;
  // On ignore une petite pause du doigt juste avant de le lever.
  let endIdx = S.length - 1;
  while (endIdx > 0 && Math.hypot(S[endIdx].x - S[endIdx - 1].x, S[endIdx].y - S[endIdx - 1].y) < 3) endIdx--;
  const e = S[endIdx];
  if (S[S.length - 1].t - e.t > 180) return false;
  let s0 = S[0];
  for (const q of S) {
    if (e.t - q.t <= 220) {
      s0 = q;
      break;
    }
  }
  const dt = Math.max(16, e.t - s0.t);
  const dx = e.x - s0.x;
  const dy = e.y - s0.y; // négatif = vers le haut
  if (-dy < 30 || -dy < Math.abs(dx) * 0.25) return false;
  const H = canvas.clientHeight;
  const speed = ((Math.hypot(dx, dy) / dt) * 1000) / H; // en hauteurs d'écran par seconde
  if (speed < 0.9) return false;
  const power = clamp((speed - 0.9) / 4.5, 0, 1);

  // On prolonge le swipe jusqu'à l'horizon : on vise là où le doigt « pointe » sur la glace.
  const W = canvas.clientWidth;
  const yT = world.horizonY() + 12;
  let kx;
  if (e.y <= yT) kx = e.x;
  else if (s0.y > yT + 20) kx = s0.x + dx * ((yT - s0.y) / dy);
  else kx = e.x + dx * 2;
  kx = clamp(kx, -W, 2 * W);
  const pt = world.groundPoint(kx, yT);
  const me = st.me;
  const aim = pt ? angleTo(me, pt) : me.yaw + me.head;

  if (G.radar == null) G.radar = allSeen();
  const info = G.sim.release(aim, power);
  if (!info) return false;
  sfx.puck();
  if (info.backhand) setBanner('Revers !', 'info');
  return true;
}

for (const [id, dir] of [
  ['#look-left', 1],
  ['#look-right', -1],
]) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    lookBtn = dir;
    try {
      b.setPointerCapture(e.pointerId);
    } catch {
      /* rien */
    }
  });
  const stop = () => (lookBtn = 0);
  b.addEventListener('pointerup', stop);
  b.addEventListener('pointercancel', stop);
  b.addEventListener('lostpointercapture', stop);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Clavier (pratique pour tester sur ordinateur) : flèches, Q/E pour l'épaule, espace pour tirer tout droit.
window.addEventListener('keydown', (e) => {
  if (G.phase !== 'play') return;
  keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  if (e.key === ' ' && G.sim) {
    if (G.radar == null) G.radar = allSeen();
    if (G.sim.release(G.sim.state.me.yaw + G.sim.state.me.head, 0.7)) sfx.puck();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));

// ---------- « Radar » : a-t-il vu ses coéquipiers avant de jouer le palet ? ----------
function trackSeen() {
  const st = G.sim.state;
  const view = st.me.yaw + st.me.head;
  const half = (world.getHfov() / 2) * 0.9;
  for (const a of st.actors) {
    if (!a.team || a.role === 'passer') continue;
    if (Math.abs(wrap(angleTo(st.me, a) - view)) < half) G.seen.add(a.num);
  }
}
function allSeen() {
  return G.sim.state.actors.filter((a) => a.team && a.role !== 'passer').every((a) => G.seen.has(a.num));
}

// ---------- événements de la simulation ----------
function handleEvents() {
  const st = G.sim.state;
  while (G.evIdx < st.events.length) {
    const ev = st.events[G.evIdx++];
    if (ev.type === 'pass' && ev.from === st.passer.num && !st.received) {
      setBanner('🏒 Le palet arrive…', 'info');
      sfx.puck();
    } else if (ev.type === 'receive') {
      sfx.puck();
      if (st.releases.length === 0) {
        setBanner('👉 À toi ! Swipe pour passer ou tirer', 'decide');
        speak('À toi !');
      }
    } else if (ev.type === 'mateReceive' || ev.type === 'mateShot') sfx.puck();
    else if (ev.type === 'over') onOver(ev.over);
  }
}

const OUTCOMES = {
  goal: '🚨 BUT !',
  save: '🧤 Arrêt du gardien !',
  wide: '↗️ À côté !',
  intercept: '✋ Interception !',
  blocked: '🛡️ Tir bloqué !',
  stolen: '😬 Palet perdu !',
  mateStolen: '😬 Palet perdu !',
  lost: '😬 Palet perdu !',
  time: '⏱️ Temps écoulé !',
};

function onOver(over) {
  if (G.radar == null) G.radar = allSeen();
  if (over.type === 'goal') {
    flash('BUT ! 🚨');
    sfx.horn();
  } else {
    setBanner(OUTCOMES[over.type] || 'Fin', 'info');
    sfx.bad();
  }
}

// ---------- résultat ----------
function outcomeText(st) {
  const o = st.over;
  const n = o.num ?? '';
  switch (o.type) {
    case 'goal':
      if (o.scorer && o.scorer.isMe) return ['🚨 BUT ! Tu as marqué.', ''];
      if (o.scorer && o.scorer.num === st.lastPassFromMe) return [`🚨 BUT du n°${o.scorer.num} sur ta passe !`, ''];
      return ['🚨 BUT de ton équipe !', ''];
    case 'save':
      return ['🧤 Arrêt du gardien.', 'Vise un coin loin du gardien, ou fais une passe pour le faire bouger.'];
    case 'wide':
      return ['↗️ Tir à côté du but.', 'Swipe bien en direction du but.'];
    case 'intercept':
      return ['✋ Passe interceptée.', 'Avant de passer, vérifie qu’aucun adversaire n’est sur la ligne de passe.'];
    case 'blocked':
      return ['🛡️ Tir bloqué par un adversaire.', 'Décale-toi pour avoir le but en face de toi, sans adversaire devant.'];
    case 'stolen':
      return ['😬 Le défenseur t’a pris le palet.', 'Quand un adversaire arrive sur toi, passe le palet ou éloigne-toi avec.'];
    case 'mateStolen':
      return [`😬 Le n°${n} s’est fait prendre le palet.`, ''];
    case 'time':
      return ['⏱️ Temps écoulé.', 'Il faut jouer plus vite : regarde, décide, joue !'];
    default:
      return ['😬 Palet perdu.', ''];
  }
}

function showResult() {
  G.shown = true;
  G.phase = 'result';
  const st = G.sim.state;
  const rel = st.releases[st.releases.length - 1] || null;
  const radar = !!G.radar;
  const decision = !!rel && rel.grade === 2;
  const goal = st.over.type === 'goal';
  const stars = [radar, decision, goal].filter(Boolean).length;
  G.results[G.index] = stars;

  const titles = ['Oups !', 'Presque !', 'Bien joué !', 'Génial !'];
  $('#res-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('#res-title').textContent = titles[stars];
  $('#chip-radar').classList.toggle('on', radar);
  $('#chip-decision').classList.toggle('on', decision);
  $('#chip-goal').classList.toggle('on', goal);

  const [outcome, tip] = outcomeText(st);
  $('#res-outcome').textContent = outcome + (st.tooHard ? ' Ta passe était trop forte pour être contrôlée.' : '');

  const best = $('#res-best');
  best.hidden = true;
  if (rel) {
    const icon = rel.grade === 2 ? '✅' : rel.grade === 1 ? '👍' : '❌';
    const what = rel.chosen.type === 'nowhere' ? 'une passe dans le vide' : describeOption(rel.chosen);
    const why = rel.chosen.type === 'nowhere' ? 'Il n’y avait personne dans cette direction.' : explain(rel.chosen);
    $('#res-decision').textContent = `${icon} Ta décision : ${what}. ${why}`;
    if (rel.chosen.key !== rel.ev.best.key) {
      best.hidden = false;
      best.textContent = `💡 Meilleure option à ce moment-là : ${describeOption(rel.ev.best)}. ${explain(rel.ev.best)}`;
    }
  } else {
    $('#res-decision').textContent = '❌ Tu n’as ni passé ni tiré.';
  }
  if (tip && best.hidden) {
    best.hidden = false;
    best.textContent = `💡 ${tip}`;
  }
  const bh = $('#res-backhand');
  bh.hidden = !(rel && rel.backhand);
  if (rel && rel.backhand) {
    bh.textContent = `🏒 C’était un revers (ta palette est ${G.hand === 'L' ? 'à gauche' : 'à droite'}) : moins fort et moins précis. Quand tu peux, oriente-toi pour passer en coup droit.`;
  }
  $('#res-radar').textContent = radar
    ? '👀 Tête haute ! Tu avais repéré tous tes coéquipiers avant de jouer le palet.'
    : '👀 Avant de jouer le palet, utilise les boutons 👀 pour repérer tous tes coéquipiers.';
  $('#res-radar').className = radar ? 'ok' : 'warn';
  $('#res-lesson').textContent = st.scn.lesson;
  $('#btn-next').textContent = G.index + 1 < G.queue.length ? 'Suivant ▶' : 'Résultats ▶';
  showScreen('#result');
  drawReplay($('#res-diagram'), st, rel);
  speak(`${titles[stars]} ${outcome}`);
}

function next() {
  G.index += 1;
  if (G.index < G.queue.length) showIntro();
  else showSummary();
}

function showSummary() {
  G.phase = 'summary';
  const total = G.results.reduce((a, b) => a + (b || 0), 0);
  const max = G.queue.length * 3;
  const store = load(STORE_KEY, { best: {} });
  store.best = store.best || {};
  store.best[G.level.id] = Math.max(store.best[G.level.id] || 0, total);
  save(STORE_KEY, store);
  const r = total / max;
  $('#sum-stars').textContent = `⭐ ${total} / ${max}`;
  $('#sum-title').textContent = r >= 0.85 ? 'Champion ! 🏆' : r >= 0.5 ? 'Belle présence ! 💪' : 'Continue, tu progresses ! 🙂';
  $('#sum-text').textContent =
    r >= 0.85
      ? 'Tu joues la tête haute et tu prends les bonnes décisions. Essaie la catégorie suivante !'
      : 'Rejoue pour gagner plus d’étoiles : repère tes coéquipiers avant de recevoir le palet.';
  showScreen('#summary');
  speak($('#sum-title').textContent);
}

// ---------- interface ----------
function setBanner(text, kind) {
  const b = $('#banner');
  b.textContent = text;
  b.dataset.kind = kind;
  b.hidden = !text;
  clearTimeout(setBanner.timer);
  if (text) setBanner.timer = setTimeout(() => (b.hidden = true), 1600);
}

function flash(text) {
  const f = $('#flash');
  f.textContent = text;
  f.classList.remove('show');
  void f.offsetWidth;
  f.classList.add('show');
}

function syncRender() {
  const st = G.sim.state;
  st.actors.forEach((a, i) => {
    G.meshes[i].setPos(a.x, a.z);
    G.meshes[i].mesh.rotation.y = a.face;
  });
  const p = st.puck;
  const mine = p.owner === st.me;
  world.setHolding(mine);
  if (!mine) world.puck.position.set(p.x, p.y, p.z);
  world.setView(st.me.x, st.me.z, st.me.yaw + st.me.head);
}

// ---------- boucle ----------
function update(dt) {
  if (G.phase === 'menu' || G.phase === 'hand' || !G.sim) {
    G.menuYaw += dt * 0.12;
    world.setView(0, -12, G.menuYaw, 3.5);
    return;
  }
  if (G.phase === 'play') {
    updateInput();
    G.sim.step(dt, input);
    if (G.radar == null) trackSeen();
    handleEvents();
    const st = G.sim.state;
    $('#timer-fill').style.transform = `scaleX(${clamp(1 - st.t / G.level.time, 0, 1)})`;
    if (st.over && st.overT >= END_DELAY && !G.shown) showResult();
  }
  syncRender();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  world.render();
  requestAnimationFrame(frame);
}

// ---------- boutons ----------
for (const b of document.querySelectorAll('.hand-btn')) b.addEventListener('click', () => setHand(b.dataset.hand));
$('#btn-hand').addEventListener('click', () => showScreen('#hand'));
$('#btn-go').addEventListener('click', beginPlay);
$('#btn-next').addEventListener('click', next);
$('#btn-retry').addEventListener('click', showIntro);
$('#btn-again').addEventListener('click', () => startLevel(G.level.id));
$('#btn-menu').addEventListener('click', goMenu);
$('#btn-quit').addEventListener('click', goMenu);
$('#intro-back').addEventListener('click', goMenu);
const soundBtn = $('#btn-sound');
const paintSound = () => (soundBtn.textContent = isMuted() ? '🔇' : '🔊');
soundBtn.addEventListener('click', () => {
  toggleMute();
  paintSound();
});
paintSound();

window.addEventListener('resize', () => {
  world.resize();
  if (G.phase === 'menu') renderMenu();
  if (G.phase === 'result') drawReplay($('#res-diagram'), G.sim.state, G.sim.state.releases.at(-1) || null);
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Accès pour les tests automatisés
window.__game = { G, input, world, startLevel, beginPlay, setHand };

G.hand = load(HAND_KEY, null);
if (G.hand) world.setHand(G.hand);
goMenu();
requestAnimationFrame(frame);
