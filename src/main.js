// Boucle de jeu « Tête haute ! » : regarder → recevoir → décider → comprendre.
import { LEVELS, SCENARIOS } from './scenarios.js';
import { evaluate, gradeDecision, explain, describeOption, finalPos, NET } from './evaluate.js';
import { createWorld, EYE } from './world.js';
import { drawDiagram } from './diagram.js';
import { sfx, speak, unlockAudio, toggleMute, isMuted } from './audio.js';

const $ = (s) => document.querySelector(s);
const world = createWorld($('#scene'));

const RECEIVE_TIME = 0.7;
const RESOLVE_TIME = 1.2;
const STORE_KEY = 'tetehaute.v1';

const S = {
  phase: 'menu',
  level: null,
  queue: [],
  index: 0,
  scn: null,
  ev: null,
  actors: [],
  me: { x: 0, z: 0 },
  yaw: 0,
  t: 0,
  clock: 0,
  saw: false,
  results: [],
  anim: null,
  shown: false,
};

// ---------- utilitaires ----------
const lerp = (a, b, k) => a + (b - a) * k;
const lerpP = (a, b, k) => ({ x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k) });
const smooth = (k) => k * k * (3 - 2 * k);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const forward = (yaw) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

function stickPos() {
  const f = forward(S.yaw);
  // La droite de l'écran correspond à (-cos, sin) dans notre repère.
  return { x: S.me.x + f.x * 0.95 - Math.cos(S.yaw) * 0.1, z: S.me.z + f.z * 0.95 + Math.sin(S.yaw) * 0.1 };
}

function setPuck(p, y = 0.02) {
  world.puck.position.set(p.x, y, p.z);
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || { best: {} };
  } catch {
    return { best: {} };
  }
}

function saveBest(levelId, stars) {
  const p = loadProgress();
  p.best[levelId] = Math.max(p.best[levelId] || 0, stars);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    /* rien */
  }
}

// ---------- écrans ----------
const SCREENS = ['#menu', '#intro', '#result', '#summary'];
function showScreen(id) {
  for (const s of SCREENS) $(s).hidden = s !== id;
  $('#hud').hidden = id !== null;
}

function renderMenu() {
  const best = loadProgress().best;
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
  $('#portrait-tip').hidden = window.innerWidth > window.innerHeight;
}

function goMenu() {
  S.phase = 'menu';
  world.clearActors();
  world.setStickVisible(false);
  world.setHolding(false);
  setPuck({ x: 0, z: 0 });
  S.me = { x: 0, z: -12 };
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  renderMenu();
  showScreen('#menu');
}

// ---------- déroulement ----------
function startLevel(levelId) {
  unlockAudio();
  S.level = LEVELS.find((l) => l.id === levelId);
  S.queue = SCENARIOS.filter((s) => s.level === levelId);
  S.index = 0;
  S.results = [];
  showIntro();
}

function loadScenario(scn) {
  S.scn = scn;
  S.ev = evaluate(scn);
  S.me = { ...scn.me };
  world.clearActors();
  world.setStickVisible(true);
  S.actors = [];
  const add = (spec, data) => {
    const a = world.addActor(spec);
    const actor = { ...a, data, team: !!spec.team, start: { x: data.x, z: data.z }, end: finalPos(data), pos: { x: data.x, z: data.z } };
    actor.setPos(data.x, data.z);
    S.actors.push(actor);
    return actor;
  };
  S.passer = add({ team: true, num: scn.passer.num }, scn.passer);
  S.passer.face(scn.me.x, scn.me.z);
  for (const t of scn.teammates) add({ team: true, num: t.num, pickable: true }, t);
  for (const o of scn.opponents) {
    const a = add({ team: false, goalie: o.goalie }, o);
    if (o.goalie) a.face(0, 0);
    else a.face(scn.me.x, scn.me.z);
  }
  S.yaw = angleTo(S.me, scn.passer);
  const f = forward(angleTo(scn.passer, S.me));
  world.setHolding(false);
  S.passerStick = { x: scn.passer.x + f.x * 1.0, z: scn.passer.z + f.z * 1.0 };
  setPuck(S.passerStick);
}

function showIntro() {
  const scn = S.queue[S.index];
  loadScenario(scn);
  S.phase = 'intro';
  $('#intro-step').textContent = `${S.level.name} · Situation ${S.index + 1} / ${S.queue.length}`;
  $('#intro-title').textContent = scn.title;
  showScreen('#intro');
}

function beginScan() {
  unlockAudio();
  S.phase = 'scan';
  S.t = 0;
  S.clock = 0;
  S.saw = false;
  $('#hud-level').textContent = S.level.name;
  $('#hud-step').textContent = `${S.index + 1} / ${S.queue.length}`;
  $('#btn-skate').hidden = true;
  $('#look-hint').hidden = false;
  setBanner('👀 Regarde partout !', 'scan');
  showScreen(null);
  sfx.whistle();
  speak('Regarde partout avant de recevoir le palet !');
}

function startReceive() {
  S.phase = 'receive';
  S.t = 0;
  S.yawFrom = S.yaw;
  S.faceYaw = angleTo(S.me, NET);
  $('#look-hint').hidden = true;
  setBanner('🏒 Le palet arrive…', 'receive');
  sfx.puck();
}

function startDecide() {
  S.phase = 'decide';
  world.setHolding(true);
  S.t = 0;
  $('#btn-skate').hidden = false;
  setBanner('👉 À toi ! Passe, tire ou patine', 'decide');
  speak('À toi ! Passe, tire, ou patine.');
  S.thief =
    S.actors.find((a) => a.data.presser) ||
    S.actors
      .filter((a) => !a.team && !a.data.goalie)
      .sort((a, b) => Math.hypot(a.end.x - S.me.x, a.end.z - S.me.z) - Math.hypot(b.end.x - S.me.x, b.end.z - S.me.z))[0];
}

function inView(p) {
  return Math.abs(wrap(angleTo(S.me, p) - S.yaw)) < (world.getHfov() / 2) * 0.85;
}

function bestTargetPos() {
  const b = S.ev.best;
  if (b.type === 'pass') {
    const a = S.actors.find((x) => x.team && x.data.num === b.num && x !== S.passer);
    return a.pos;
  }
  return NET;
}

function resolve(choice) {
  if (S.phase !== 'decide') return;
  S.phase = 'resolve';
  S.t = 0;
  S.shown = false;
  $('#btn-skate').hidden = true;
  setBanner('', 'none');
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();

  const opt =
    choice.type === 'timeout'
      ? { type: 'timeout', key: 'timeout', score: 0, reason: 'timeout' }
      : S.ev.options.find((o) => o.key === (choice.type === 'pass' ? `pass:${choice.num}` : choice.type));
  S.choice = opt;
  world.setHolding(opt.type === 'skate');
  const from = stickPos();
  const meStart = { ...S.me };
  let to = null;
  let lift = 0;
  S.goal = false;

  if (opt.type === 'pass') {
    to = opt.blocker || opt.target;
    sfx.puck();
  } else if (opt.type === 'shoot') {
    if (opt.blocker) to = opt.blocker;
    else if (opt.score >= 50) {
      S.goal = true;
      to = { x: S.me.x < 0 ? -0.6 : 0.6, z: 26.3 };
      lift = 0.6;
    } else {
      to = { x: 0, z: 25.4 };
      lift = 0.4;
    }
    sfx.puck();
  } else if (opt.type === 'timeout') {
    to = S.thief ? S.thief.pos : from;
    sfx.bad();
  }

  const skateDist = opt.type === 'skate' ? (opt.score >= 60 ? 4 : 1.8) : 0;
  const dir = forward(S.faceYaw);
  S.anim = (k) => {
    if (opt.type === 'skate') {
      S.me = { x: meStart.x + dir.x * skateDist * smooth(k), z: meStart.z + dir.z * skateDist * smooth(k) };
      setPuck(stickPos());
    } else {
      const kk = Math.min(1, k * 1.6);
      const p = lerpP(from, to, kk);
      setPuck(p, 0.02 + Math.sin(kk * Math.PI) * lift * 0.5 + (kk >= 1 ? lift * 0.4 : 0));
    }
  };
}

function finishResolve() {
  S.shown = true;
  const opt = S.choice;
  const decision = gradeDecision(opt, S.ev.best);
  const scanStar = S.saw ? 1 : 0;
  const stars = decision + scanStar;
  S.results[S.index] = stars;

  if (S.goal) {
    flash('BUT ! 🚨');
    sfx.horn();
  } else if (decision === 2) sfx.good();
  else sfx.bad();

  const isBest = opt.key === S.ev.best.key;
  const titles = ['Oups !', 'Presque !', 'Bien joué !', 'Génial !'];
  $('#res-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('#res-title').textContent = titles[stars];
  $('#res-choice').textContent =
    opt.type === 'timeout' ? '⏱️ Tu n’as pas décidé à temps.' : `${isBest ? '✅' : decision === 1 ? '👍' : '❌'} Ton choix : ${describeOption(opt)}`;
  $('#res-why').textContent = explain(opt);
  const bestLine = $('#res-best');
  bestLine.hidden = isBest;
  if (!isBest) bestLine.textContent = `💡 Meilleure option : ${describeOption(S.ev.best)}. ${explain(S.ev.best)}`;
  $('#res-scan').textContent = S.saw
    ? '👀 Bravo, tu avais repéré la bonne option avant de recevoir le palet !'
    : '👀 Pense à tourner la tête AVANT de recevoir le palet.';
  $('#res-scan').className = S.saw ? 'ok' : 'warn';
  $('#res-lesson').textContent = S.scn.lesson;
  $('#btn-next').textContent = S.index + 1 < S.queue.length ? 'Suivant ▶' : 'Résultats ▶';
  showScreen('#result');
  drawDiagram($('#res-diagram'), S.scn, S.ev, opt);
  speak(`${titles[stars]} ${explain(opt)}`);
}

function next() {
  S.index += 1;
  if (S.index < S.queue.length) showIntro();
  else showSummary();
}

function showSummary() {
  S.phase = 'summary';
  const total = S.results.reduce((a, b) => a + b, 0);
  const max = S.queue.length * 3;
  saveBest(S.level.id, total);
  const r = total / max;
  $('#sum-stars').textContent = `⭐ ${total} / ${max}`;
  $('#sum-title').textContent = r >= 0.85 ? 'Champion ! 🏆' : r >= 0.5 ? 'Belle présence ! 💪' : 'Continue, tu progresses ! 🙂';
  $('#sum-text').textContent =
    r >= 0.85
      ? 'Tu as la tête haute et tu prends les bonnes décisions. Essaie la catégorie suivante !'
      : 'Rejoue pour gagner plus d’étoiles : regarde partout avant de recevoir le palet.';
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
  // Le bandeau disparaît vite pour ne pas cacher les joueurs.
  if (text) setBanner.timer = setTimeout(() => (b.hidden = true), 1800);
}

function setTimer(k) {
  $('#timer-fill').style.transform = `scaleX(${Math.max(0, Math.min(1, k))})`;
}

function flash(text) {
  const f = $('#flash');
  f.textContent = text;
  f.classList.remove('show');
  void f.offsetWidth;
  f.classList.add('show');
}

// ---------- boucle ----------
function update(dt) {
  const L = S.level;
  if (S.phase === 'menu') {
    S.yaw += dt * 0.12;
    world.setView(0, -12, S.yaw, 3.5);
    return;
  }
  if (['scan', 'receive', 'decide'].includes(S.phase)) {
    S.clock += dt;
    const k = smooth(Math.min(1, S.clock / (L.scanTime + RECEIVE_TIME)));
    for (const a of S.actors) {
      if (S.phase === 'decide' && a === S.thief) continue;
      a.pos = lerpP(a.start, a.end, k);
      a.setPos(a.pos.x, a.pos.z);
    }
  }

  switch (S.phase) {
    case 'scan': {
      S.t += dt;
      if (!S.saw && inView(bestTargetPos())) S.saw = true;
      setTimer(1 - S.t / L.scanTime);
      if (S.t >= L.scanTime) startReceive();
      break;
    }
    case 'receive': {
      S.t += dt;
      const k = Math.min(1, S.t / RECEIVE_TIME);
      S.yaw = S.yawFrom + wrap(S.faceYaw - S.yawFrom) * smooth(k);
      setPuck(lerpP(S.passerStick, stickPos(), k));
      setTimer(1);
      if (k >= 1) startDecide();
      break;
    }
    case 'decide': {
      S.t += dt;
      const k = Math.min(1, S.t / L.decideTime);
      if (S.thief) {
        const d = Math.hypot(S.thief.end.x - S.me.x, S.thief.end.z - S.me.z) || 1;
        const near = { x: S.me.x + ((S.thief.end.x - S.me.x) / d) * 1.1, z: S.me.z + ((S.thief.end.z - S.me.z) / d) * 1.1 };
        S.thief.pos = lerpP(S.thief.end, near, k);
        S.thief.setPos(S.thief.pos.x, S.thief.pos.z);
      }
      setPuck(stickPos());
      setTimer(1 - k);
      if (k >= 1) resolve({ type: 'timeout' });
      break;
    }
    case 'resolve': {
      S.t += dt;
      S.anim(Math.min(1, S.t / RESOLVE_TIME));
      if (S.t >= RESOLVE_TIME && !S.shown) finishResolve();
      break;
    }
    default:
  }
  world.setView(S.me.x, S.me.z, S.yaw, EYE);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  world.render();
  requestAnimationFrame(frame);
}

// ---------- contrôles tactiles ----------
const canvas = $('#scene');
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, t: performance.now(), yaw: S.yaw, moved: 0 };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  drag.moved = Math.max(drag.moved, Math.abs(dx), Math.abs(e.clientY - drag.y));
  if (S.phase === 'scan' || S.phase === 'decide') {
    // Comme une visite virtuelle : on « tire » le décor avec le doigt.
    S.yaw = drag.yaw + (dx / canvas.clientWidth) * world.getHfov() * 1.2;
    if (S.phase === 'scan') $('#look-hint').hidden = true;
  }
});
const endDrag = (e) => {
  if (!drag) return;
  const isTap = drag.moved < 12 && performance.now() - drag.t < 400;
  drag = null;
  if (isTap && S.phase === 'decide') {
    const r = canvas.getBoundingClientRect();
    const pick = world.pick(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (pick) resolve(pick);
  }
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => (drag = null));

// Clavier (pratique sur ordinateur pour tester)
window.addEventListener('keydown', (e) => {
  if (S.phase !== 'scan' && S.phase !== 'decide') return;
  if (e.key === 'ArrowLeft') S.yaw += 0.25;
  if (e.key === 'ArrowRight') S.yaw -= 0.25;
  if (e.key === ' ' && S.phase === 'decide') resolve({ type: 'skate' });
});

$('#btn-skate').addEventListener('click', () => resolve({ type: 'skate' }));
$('#btn-go').addEventListener('click', beginScan);
$('#btn-next').addEventListener('click', next);
$('#btn-retry').addEventListener('click', showIntro);
$('#btn-again').addEventListener('click', () => startLevel(S.level.id));
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
  if (S.phase === 'menu') renderMenu();
  if (S.phase === 'resolve' || !$('#result').hidden) drawDiagram($('#res-diagram'), S.scn, S.ev, S.choice);
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Accès de débogage pour les tests automatisés
window.__game = { S, resolve, beginScan, startLevel };

goMenu();
requestAnimationFrame(frame);
