// « Tête haute ! » : le joueur patine en vue première personne, passe et tire d'un swipe.
//   - doigt appuyé : patiner ; le glisser à gauche ou à droite : tourner
//   - swipe vers le haut : passe ou tir, dans la direction du swipe, d'autant plus fort que le swipe est rapide
//   - pouce sur le côté : tourner selon l'angle ; ramené vers l'arrière : regarder derrière ; tout en bas : reculer
//   - lâcher l'écran : glisser ; double tap : freiner
import { LEVELS, SCENARIOS, DEFENSE_SCENARIOS } from './scenarios.js';
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
  mode: 'attack',
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
  for (const mode of ['attack', 'defense']) {
    const h = document.createElement('p');
    h.className = 'mode-title';
    h.textContent = mode === 'attack' ? '⚔️ Attaque : marque un but' : '🛡️ Défense : protège ton but';
    list.appendChild(h);
    const row = document.createElement('div');
    row.className = 'levels';
    for (const l of LEVELS) {
      const n = scenariosFor(mode, l.id).length;
      const b = document.createElement('button');
      b.className = 'level';
      b.style.setProperty('--c', l.color);
      b.innerHTML = `<span class="lv-name">${l.name}</span><span class="lv-ages">${l.ages}</span><span class="lv-stars">⭐ ${best[bestKey(mode, l.id)] || 0} / ${n * 3}</span>`;
      b.addEventListener('click', () => startLevel(l.id, mode));
      row.appendChild(b);
    }
    list.appendChild(row);
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
const scenariosFor = (mode, levelId) => (mode === 'defense' ? DEFENSE_SCENARIOS : SCENARIOS).filter((s) => s.level === levelId);
const bestKey = (mode, levelId) => (mode === 'defense' ? `D-${levelId}` : levelId);

function startLevel(levelId, mode = G.mode) {
  unlockAudio();
  G.mode = mode;
  G.level = LEVELS.find((l) => l.id === levelId);
  G.queue = scenariosFor(mode, levelId);
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
  $('#intro-step').textContent = `${G.mode === 'defense' ? '🛡️ Défense' : '⚔️ Attaque'} · ${G.level.name} · Situation ${G.index + 1} / ${G.queue.length}`;
  $('#intro-title').textContent = scn.title;
  if (scn.mode === 'defense') {
    $('#intro-text').innerHTML = `${scn.mission}<br /><span class="hint">⬇ Tire ton pouce tout droit vers le bas pour patiner à reculons. Double tap pour freiner.</span>`;
    $('#intro-goal').textContent = '🛡️ Objectif : récupérer le palet sans encaisser de but.';
  } else {
    $('#intro-text').innerHTML = `Le n°${scn.passer.num} va te passer le palet.<br /><b>Avant qu’il arrive, ramène ton pouce vers l’arrière pour regarder où sont tes coéquipiers 👀</b>`;
    $('#intro-goal').textContent = '🎯 Objectif : marquer un but avec ton équipe.';
  }
  showScreen('#intro');
}

function beginPlay() {
  unlockAudio();
  G.phase = 'play';
  resetInput();
  $('#hud-level').textContent = `${G.mode === 'defense' ? '🛡️' : '⚔️'} ${G.level.name}`;
  $('#hud-step').textContent = `${G.index + 1} / ${G.queue.length}`;
  $('#ctl-hint').hidden = G.index > 0;
  $('#ctl-hint').textContent = G.mode === 'defense' ? '☝️ Doigt appuyé : avancer · pouce en arrière : regarder derrière · tout en bas : reculer' : '☝️ Doigt appuyé : avancer · pouce sur le côté : tourner · pouce en arrière : regarder derrière';
  showScreen(null);
  sfx.whistle();
  if (G.mode === 'defense') {
    setBanner('🛡️ Défends ton but !', 'scan');
    speak('Défends ton but ! Repère tous les attaquants.');
  } else {
    setBanner('👀 Regarde autour de toi !', 'scan');
    speak('Regarde autour de toi avant de recevoir le palet !');
  }
}

// ---------- contrôles ----------
// Le pouce fonctionne comme un joystick autour de l'endroit où il s'est posé :
//   - vers le haut ou sur le côté (jusqu'à ~100°) : on patine et on tourne, d'autant plus que l'angle est grand ;
//   - ramené vers l'arrière, à gauche ou à droite : on regarde derrière soi de ce côté (sans pousser) ;
//   - tiré tout droit vers le bas : on patine à reculons ;
//   - lever le doigt : on glisse en ralentissant ; double tap : on freine.
const DEG = Math.PI / 180;
const DEAD = 16; // px : petite zone morte autour du point de départ
const input = { skate: false, back: false, brake: false, turn: 0, head: 0, headAngle: null };
const pointers = new Map();
let skateId = null;
let brakePulse = false;
let lastTap = 0;
const keys = new Set();

function resetInput() {
  pointers.clear();
  skateId = null;
  brakePulse = false;
  keys.clear();
  showStick(null);
}

/** Lit le joystick : renvoie la zone et l'angle du pouce (0 = vers le haut, + = à droite). */
function readStick(sp) {
  const last = sp.samples[sp.samples.length - 1];
  const dx = last.x - sp.x0;
  const dy = last.y - sp.y0;
  const r = Math.hypot(dx, dy);
  if (r < DEAD) return { zone: 'push', theta: 0, dx, dy };
  const theta = Math.atan2(dx, -dy);
  const a = Math.abs(theta);
  if (a <= 100 * DEG) return { zone: 'push', theta, dx, dy };
  if (a < 160 * DEG) return { zone: 'look', theta, dx, dy };
  return { zone: 'back', theta, dx, dy };
}

function updateInput() {
  const sp = skateId != null ? pointers.get(skateId) : null;
  const st = sp ? readStick(sp) : null;
  input.skate = (st && st.zone === 'push') || keys.has('ArrowUp') || keys.has('w') || keys.has('z');
  input.back = (st && st.zone === 'back') || keys.has('ArrowDown') || keys.has('s');
  input.brake = brakePulse || keys.has('b');
  brakePulse = false;
  let turn = st && st.zone === 'push' ? clamp(st.theta / (90 * DEG), -1, 1) : 0;
  if (keys.has('ArrowLeft')) turn = -1;
  if (keys.has('ArrowRight')) turn = 1;
  input.turn = turn;
  // Regarder derrière : la vue suit l'angle du pouce (à droite = regard à droite).
  input.headAngle = st && st.zone === 'look' ? -st.theta : null;
  input.head = keys.has('q') || keys.has('a') ? 1 : keys.has('e') ? -1 : 0;
  showStick(sp, st);
}

/** Petit repère visuel sous le pouce : anneau au point de départ, bouton qui suit le doigt. */
function showStick(sp, st) {
  const el = $('#stick');
  if (!sp) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.style.left = `${sp.x0}px`;
  el.style.top = `${sp.y0}px`;
  const r = Math.hypot(st.dx, st.dy) || 1;
  const k = Math.min(1, 46 / r);
  $('#stick-knob').style.transform = `translate(${st.dx * k}px, ${st.dy * k}px)`;
  el.dataset.zone = st.zone;
  $('#stick-knob').textContent = st.zone === 'look' ? '👀' : st.zone === 'back' ? '⬇' : '';
}

canvas.addEventListener('pointerdown', (e) => {
  if (G.phase !== 'play') return;
  e.preventDefault();
  const now = performance.now();
  pointers.set(e.pointerId, { x0: e.clientX, y0: e.clientY, t0: now, maxR: 0, samples: [{ t: now, x: e.clientX, y: e.clientY }] });
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
  p.maxR = Math.max(p.maxR, Math.hypot(e.clientX - p.x0, e.clientY - p.y0));
  while (p.samples.length > 2 && now - p.samples[0].t > 400) p.samples.shift();
});

function endPointer(e, isUp) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);
  if (isUp) {
    const now = performance.now();
    p.samples.push({ t: now, x: e.clientX, y: e.clientY });
    const flicked = tryFlick(p);
    // Double tap (deux touches brèves au même endroit) : freinage.
    const isTap = !flicked && now - p.t0 < 250 && p.maxR < 14;
    if (isTap) {
      if (now - lastTap < 380) {
        brakePulse = true;
        lastTap = 0;
        setBanner('🛑 Freinage !', 'info');
      } else lastTap = now;
    }
  }
  if (e.pointerId === skateId) {
    // Si un autre doigt est posé, il prend le relais pour patiner.
    const next = pointers.keys().next();
    skateId = next.done ? null : next.value;
    if (!next.done) {
      const q = pointers.get(skateId);
      const last = q.samples[q.samples.length - 1];
      q.x0 = last.x;
      q.y0 = last.y;
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

// Clavier (pratique pour tester sur ordinateur) : flèches, Q/E pour regarder derrière, B pour freiner, espace pour tirer tout droit.
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
  for (const a of watched()) {
    if (Math.abs(wrap(angleTo(st.me, a) - view)) < half) G.seen.add(a.num);
  }
}
/** Joueurs à repérer : les coéquipiers en attaque, les attaquants adverses en défense. */
function watched() {
  const st = G.sim.state;
  return st.actors.filter((a) => !a.goalie && (st.defense ? !a.team : a.team && a.role !== 'passer'));
}
function allSeen() {
  return watched().every((a) => G.seen.has(a.num));
}

// ---------- événements de la simulation ----------
function handleEvents() {
  const st = G.sim.state;
  while (G.evIdx < st.events.length) {
    const ev = st.events[G.evIdx++];
    if ((ev.type === 'oppPass' || ev.type === 'oppShot') && G.radar == null) G.radar = allSeen();
    if (ev.type === 'oppPass' || ev.type === 'oppShot') sfx.puck();
    else if (ev.type === 'pass' && st.passer && ev.from === st.passer.num && !st.received) {
      setBanner('🏒 Le palet arrive…', 'info');
      sfx.puck();
    } else if (ev.type === 'receive' && !st.defense) {
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
  recovered: '💪 Palet récupéré !',
  goalAgainst: '😬 But encaissé !',
  saveUs: '🧤 Arrêt de ton gardien !',
  wideAgainst: '😅 Tir à côté !',
};

function onOver(over) {
  if (G.radar == null) G.radar = allSeen();
  if (over.type === 'goal') {
    flash('BUT ! 🚨');
    sfx.horn();
  } else if (over.type === 'recovered') {
    flash('💪 Récupéré !');
    sfx.good();
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

const DUTY_TEXT = {
  goalside: 'Ta mission : rester entre le porteur et ton but.',
  lane: (n) => `Ta mission : couper la passe vers le n°${n}.`,
  mark: (n) => `Ta mission : marquer le n°${n}, entre lui et ton but.`,
};

function defenseOutcome(o) {
  switch (o.type) {
    case 'recovered':
      if (o.how === 'poke') return ['💪 Tu as piqué le palet avec ta crosse !', ''];
      if (o.how === 'intercept') return ['✋ Interception ! Tu as coupé la passe.', ''];
      if (o.how === 'block') return ['🛡️ Tir bloqué ! Bravo pour le courage.', ''];
      if (o.how === 'mate') return [`🤝 Ton coéquipier n°${o.num} a récupéré le palet.`, ''];
      return ['💪 Palet récupéré !', ''];
    case 'goalAgainst':
      return ['😬 But encaissé.', 'Regarde le schéma : le rond vert montre où tu aurais dû être.'];
    case 'saveUs':
      return ['🧤 Ton gardien a arrêté le tir.', 'Pas de but, mais essaie de récupérer le palet avant le tir.'];
    case 'wideAgainst':
      return ['😅 L’attaquant a tiré à côté.', 'Essaie de récupérer le palet avant le tir.'];
    case 'time':
      return ['⏱️ Tu as tenu jusqu’au bout !', ''];
    default:
      return ['Fin de l’action.', ''];
  }
}

function showDefenseResult() {
  const st = G.sim.state;
  const o = st.over;
  const radar = !!G.radar;
  const ratio = st.dutyT > 0 ? st.dutyOkT / st.dutyT : 0;
  const ownAction = o.type === 'recovered' && ['poke', 'intercept', 'block'].includes(o.how);
  const placement = ratio >= 0.55 || ownAction;
  // Le gardien qui arrête le tir ne compte pas : c'est au joueur de récupérer le palet.
  const zero = o.type === 'recovered' || o.type === 'time';
  const stars = [radar, placement, zero].filter(Boolean).length;
  G.results[G.index] = stars;

  const titles = ['Oups !', 'Presque !', 'Bien joué !', 'Génial !'];
  $('#res-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('#res-title').textContent = titles[stars];
  $('#chip-radar').classList.toggle('on', radar);
  $('#chip-decision').textContent = '📍 Placement';
  $('#chip-decision').classList.toggle('on', placement);
  $('#chip-goal').textContent = '💪 Récupéré';
  $('#chip-goal').classList.toggle('on', zero);

  const [outcome, tip] = defenseOutcome(o);
  $('#res-outcome').textContent = outcome;
  const [kind, num] = String(st.scn.duty).split(':');
  const duty = typeof DUTY_TEXT[kind] === 'function' ? DUTY_TEXT[kind](num) : DUTY_TEXT[kind];
  const pct = Math.round(ratio * 100);
  $('#res-decision').textContent = `${placement ? '✅' : '❌'} ${duty} Tu étais bien placé ${pct} % du temps.`;
  const best = $('#res-best');
  best.hidden = !tip;
  best.textContent = tip ? `💡 ${tip}` : '';
  $('#res-backhand').hidden = true;
  $('#res-radar').textContent = radar
    ? '👀 Tête haute ! Tu avais repéré tous les attaquants.'
    : '👀 Repère tous les attaquants dès le début : ramène ton pouce vers l’arrière pour regarder derrière toi.';
  $('#res-radar').className = radar ? 'ok' : 'warn';
  $('#res-lesson').textContent = st.scn.lesson;
  $('#legend-best').textContent = '◯ bonne place';
  $('#btn-next').textContent = G.index + 1 < G.queue.length ? 'Suivant ▶' : 'Résultats ▶';
  showScreen('#result');
  drawReplay($('#res-diagram'), st, null);
  speak(`${titles[stars]} ${outcome}`);
}

function showResult() {
  G.shown = true;
  G.phase = 'result';
  const st = G.sim.state;
  if (st.defense) return showDefenseResult();
  $('#chip-decision').textContent = '🧠 Décision';
  $('#chip-goal').textContent = '🥅 But';
  $('#legend-best').textContent = '━ meilleure option';
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
    : '👀 Avant de jouer le palet, ramène ton pouce vers l’arrière, à gauche ou à droite, pour repérer tous tes coéquipiers.';
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
  const key = bestKey(G.mode, G.level.id);
  store.best[key] = Math.max(store.best[key] || 0, total);
  save(STORE_KEY, store);
  const r = total / max;
  $('#sum-stars').textContent = `⭐ ${total} / ${max}`;
  $('#sum-title').textContent = r >= 0.85 ? 'Champion ! 🏆' : r >= 0.5 ? 'Belle présence ! 💪' : 'Continue, tu progresses ! 🙂';
  $('#sum-text').textContent =
    r >= 0.85
      ? 'Tu joues la tête haute et tu prends les bonnes décisions. Essaie la catégorie suivante !'
      : G.mode === 'defense'
        ? 'Rejoue pour gagner plus d’étoiles : repère tous les attaquants et place-toi entre eux et ton but.'
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
$('#btn-again').addEventListener('click', () => startLevel(G.level.id, G.mode));
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
  if (G.phase === 'result') drawReplay($('#res-diagram'), G.sim.state, G.sim.state.defense ? null : G.sim.state.releases.at(-1) || null);
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
