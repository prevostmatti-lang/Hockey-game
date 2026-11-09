// « Tête haute ! » : le joueur patine en vue première personne, passe et tire d'un swipe.
//   - doigt appuyé : patiner ; le glisser à gauche ou à droite : tourner
//   - swipe vers le haut : passe ou tir, dans la direction du swipe, d'autant plus fort que le swipe est rapide
//   - pouce sur le côté : tourner selon l'angle ; tiré vers le bas : reculer
//   - lâcher l'écran : glisser ; double tap : freiner
import { LEVELS, SCENARIOS, DEFENSE_SCENARIOS } from './scenarios.js';
import { explain, describeOption } from './evaluate.js';
import { createSim, angleTo, wrap } from './sim.js';
import { createWorld } from './world.js';
import { drawReplay } from './diagram.js';
import { sfx, speak, unlockAudio, toggleMute, isMuted } from './audio.js';
import { BLOCKS, calendar, weekOf, blockOf, isHoliday, sessionPlan, scaledLevel, PROGRAM_WEEKS } from './program.js';
import { createDrill, closeDrillUI } from './drills.js';
import { makeVariant } from './generator.js';

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
  session: null, // séance du programme en cours
  drill: null, // exercice court en cours
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
const SCREENS = ['#hand', '#menu', '#intro', '#result', '#summary', '#program', '#session-end'];
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
  for (const b of document.querySelectorAll('.view-btn')) b.classList.toggle('on', (b.dataset.view === '3') === !!G.view3);
  $('#btn-tuto').textContent = load(TUTO_KEY, false) ? '🎓 Revoir le tutoriel ✅' : '🎓 Tutoriel : apprends les gestes (2 min)';
  $('#btn-tuto').classList.toggle('new', !load(TUTO_KEY, false));
  $('#hand-label').textContent = G.hand === 'L' ? 'à gauche (gaucher)' : 'à droite (droitier)';
  $('#portrait-tip').hidden = true; // le jeu marche en paysage comme en portrait
}

function goMenu() {
  stopDrill();
  world.showMe(false);
  G.tuto = null;
  $('#tuto').hidden = true;
  $('#hud-step').hidden = false;
  $('#timer').hidden = false;
  G.session = null;
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
  stopAiming();
  $('#puck-ind').hidden = true;
  G.sim = createSim(scn, G.level, G.hand);
  G.evIdx = 0;
  G.seen = new Set();
  G.radar = null;
  G.shown = false;
  world.clearActors();
  world.setStickVisible(true);
  G.meshes = G.sim.state.actors.map((a) => world.addActor({ team: a.team, num: a.num, goalie: a.goalie, hand: a.hand }));
  syncRender();
}

function showIntro() {
  const scn = G.queue[G.index];
  if (G.session) G.mode = scn.mode === 'defense' ? 'defense' : 'attack';
  loadScenario(scn);
  G.phase = 'intro';
  $('#intro-step').textContent = G.session
    ? `${G.session.plan.title} · ${G.mode === 'defense' ? '🛡️ Défense' : '⚔️ Attaque'} · Situation ${G.index + 1}`
    : `${G.mode === 'defense' ? '🛡️ Défense' : '⚔️ Attaque'} · ${G.level.name} · Situation ${G.index + 1} / ${G.queue.length}`;
  $('#intro-title').textContent = scn.title;
  if (scn.mode === 'defense') {
    $('#intro-text').innerHTML = `${scn.mission}<br /><span class="hint">⬇ Tire ton pouce tout droit vers le bas pour patiner à reculons. Double tap pour freiner.</span>`;
    $('#intro-goal').textContent = '🛡️ Objectif : récupérer le palet sans encaisser de but.';
  } else {
    const gg = scn.giveGoTip ? `<br /><span class="hint">🔁 ${scn.giveGoTip}</span>` : '';
    $('#intro-text').innerHTML = `Le n°${scn.passer.num} va te passer le palet.<br /><b>Avant qu’il arrive, tourne-toi pour repérer où sont tes coéquipiers 👀</b>${gg}`;
    $('#intro-goal').textContent = '🎯 Objectif : marquer un but avec ton équipe.';
  }
  showScreen('#intro');
}

function beginPlay() {
  unlockAudio();
  G.phase = 'play';
  resetInput();
  $('#hud-level').textContent = `${G.mode === 'defense' ? '🛡️' : '⚔️'} ${G.level.name}`;
  $('#hud-step').textContent = G.session ? '⏱️' : `${G.index + 1} / ${G.queue.length}`;
  $('#ctl-hint').hidden = G.index > 0;
  $('#ctl-hint').hidden = true;
  showZones(G.index === 0);
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
//   - tiré tout droit vers le bas : on patine à reculons ;
//   - lever le doigt : on glisse en ralentissant ; double tap : on freine.
// L'écran est coupé en deux zones :
//   - paysage : moitié GAUCHE = déplacement (ce joystick), moitié DROITE = vision ;
//   - portrait : moitié BASSE = déplacement, moitié HAUTE = vision.
// La vision tourne la tête sans changer la direction du patinage ; quand on lève le doigt,
// le regard revient vers l'avant. Un swipe rapide vers le haut, dans n'importe quelle zone,
// fait la passe ou le tir.
const LOOK_SENS = 1.3; // glisser sur toute la largeur de l'écran = tourner la tête de 1,3 × le champ de vision
const FULL_SPEED_PX = 90; // pouce à 90 px du point de départ = vitesse maximale
let lookId = null;
let headLook = 0;
const DEG = Math.PI / 180;
const DEAD = 16; // px : petite zone morte autour du point de départ
const input = { skate: false, back: false, brake: false, turn: 0, throttle: 1, head: 0, headAngle: null };
const pointers = new Map();
let skateId = null;
let brakePulse = false;
let lastTap = 0;
const keys = new Set();
const VIEW_KEY = 'tetehaute.view';

function resetInput() {
  pointers.clear();
  skateId = null;
  lookId = null;
  headLook = 0;
  brakePulse = false;
  keys.clear();
  showStick(null);
}

/** Zone de déplacement : moitié gauche en paysage, moitié basse en portrait. */
function inMoveZone(x, y) {
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  return H > W ? y > H / 2 : x < W / 2;
}

function showZones(on) {
  const z = $('#zones');
  z.hidden = !on;
  z.dataset.layout = canvas.clientHeight > canvas.clientWidth ? 'portrait' : 'landscape';
}

/** Lit le joystick : renvoie la zone et l'angle du pouce (0 = vers le haut, + = à droite). */
function readStick(sp) {
  const last = sp.samples[sp.samples.length - 1];
  const dx = last.x - sp.x0;
  const dy = last.y - sp.y0;
  const r = Math.hypot(dx, dy);
  if (r < DEAD) return { zone: 'push', theta: 0, dx, dy };
  const theta = Math.atan2(dx, -dy);
  // Pouce vers le haut ou sur le côté : on avance et on tourne.
  // Pouce vers le bas, même en biais (au-delà de 105°) : on recule, et on se dirige en reculant.
  if (Math.abs(theta) <= 105 * DEG) return { zone: 'push', theta, dx, dy };
  return { zone: 'back', theta, dx, dy };
}

function updateInput() {
  const sp = skateId != null ? pointers.get(skateId) : null;
  const st = sp ? readStick(sp) : null;
  input.skate = (st && st.zone === 'push') || keys.has('ArrowUp') || keys.has('w') || keys.has('z');
  input.back = (st && st.zone === 'back') || keys.has('ArrowDown') || keys.has('s');
  input.brake = brakePulse || keys.has('b');
  brakePulse = false;
  // Angle du pouce (0 à 90°) ; la réponse exponentielle est appliquée dans la simulation (sim.js : turnRate).
  let turn = st && st.zone === 'push' ? clamp(st.theta / (90 * DEG), -1, 1) : 0;
  // En reculant : pouce en bas à gauche = reculer vers la gauche (le corps tourne doucement).
  if (st && st.zone === 'back') turn = clamp(-st.dx / 70, -1, 1) * 0.75;
  if (keys.has('ArrowLeft')) turn = -1;
  if (keys.has('ArrowRight')) turn = 1;
  input.turn = turn;
  // Regarder derrière : la vue suit l'angle du pouce (à droite = regard à droite).
  // Vitesse : selon la distance du pouce au point de départ (au clavier : vitesse maximale).
  input.throttle = sp ? clamp((Math.hypot(st.dx, st.dy) - DEAD) / (FULL_SPEED_PX - DEAD), 0.3, 1) : 1;
  // Vision : tant que le 2e doigt est posé, la tête suit son glissement ; sinon elle revient devant.
  input.headAngle = lookId != null ? headLook : null;
  input.head = 0;
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
  $('#stick-knob').textContent = st.zone === 'back' ? '⬇' : '';
}

canvas.addEventListener('pointerdown', (e) => {
  if (G.phase !== 'play') return;
  e.preventDefault();
  const now = performance.now();
  const p = { x0: e.clientX, y0: e.clientY, t0: now, maxR: 0, samples: [{ t: now, x: e.clientX, y: e.clientY }] };
  pointers.set(e.pointerId, p);
  if (inMoveZone(e.clientX, e.clientY)) {
    if (skateId == null) skateId = e.pointerId;
  } else if (lookId == null) {
    lookId = e.pointerId;
    headLook = G.sim ? G.sim.state.me.head : 0;
  }
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* pointeur synthétique */
  }
  $('#ctl-hint').hidden = true;
  showZones(false);
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const now = performance.now();
  const prev = p.samples[p.samples.length - 1];
  if (e.pointerId === lookId && G.phase === 'play') {
    // Glisser à droite = regarder à droite (jusqu'à presque derrière soi).
    headLook = clamp(headLook - ((e.clientX - prev.x) / canvas.clientWidth) * world.getHfov() * LOOK_SENS, -2.9, 2.9);
  }
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
        if (G.tuto) G.tuto.braked = true;
        lastTap = 0;
        setBanner('🛑 Freinage !', 'info');
      } else lastTap = now;
    }
  }
  if (e.pointerId === lookId) lookId = null;
  // Le doigt de déplacement levé : le prochain doigt posé reprendra le déplacement
  // (le doigt de vision encore posé reste la vision).
  if (e.pointerId === skateId) skateId = null;
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

  // Seule la DIRECTION du swipe compte (pas l'endroit où le doigt s'est posé) :
  // tout droit vers le haut = droit devant (là où l'on regarde), penché à droite = vers la droite.
  const me = st.me;
  const swipeAngle = Math.atan2(dx, -dy); // 0 = vers le haut, + = vers la droite
  const aim = me.yaw + me.head - clamp(swipeAngle, -1.3, 1.3) * 0.9;

  if (G.radar == null) G.radar = allSeen();
  // Swipe long (plus de 60 % de la hauteur de l'écran) : passe levée, au-dessus des crosses.
  const lifted = p.y0 - e.y > 0.6 * H;
  // Swipe vers le but (même long) : la cage apparaît, le jeu ralentit, et on choisit où tirer.
  if (G.sim.wouldShoot(aim)) {
    startAiming(aim, power);
    return true;
  }
  const info = G.sim.release(aim, power, { lifted });
  if (!info) return false;
  swingFor(info);
  sfx.puck();
  if (info.isShot && info.zone) setBanner(`🎯 Tir ${info.zoneLabel} !`, 'info');
  else if (info.lifted) setBanner('🪂 Passe levée !', 'info');
  else if (info.backhand) setBanner('Revers !', 'info');
  return true;
}

/** Geste de la crosse : coup droit = balayage vers le côté du coup droit, revers = vers l'autre côté. */
function swingFor(info) {
  const fore = G.hand === 'L' ? -1 : 1; // droitier : coup droit vers la gauche
  world.swingStick(info.backhand ? -fore : fore);
}

// ---------- cage et cibles de tir ----------
// Quand on swipe vers le but, le jeu passe au ralenti et la cage apparaît avec 5 cibles :
// vertes si elles sont libres, rouges si le gardien les couvre (selon sa position, sa posture,
// et la taille du gardien selon la catégorie). On a un temps limité (selon la catégorie) pour
// toucher une cible. Trop tard : le tir part là où on a swipé, sans aide.
// En U13, la cage est vue DEPUIS LA PALETTE : de côté, elle paraît plus étroite.
const AIM_SLOWMO = 0.15;
const NET = { x: 0, z: 26 }; // but attaqué

function shotPanelVisible() {
  if (!G.aiming || G.phase !== 'play' || !G.sim) return false;
  const st = G.sim.state;
  return st.puck.owner === st.me && !st.over;
}

function startAiming(aim, power) {
  G.aiming = { aim, power, t: 0, max: G.level.shotTime ?? 2 };
  const panel = $('#shot-panel');
  panel.style.setProperty('--target', `${G.level.targetSize ?? 44}px`);
  $('#banner').hidden = true;
  $('#shot-title').textContent = G.level.stickAngle ? '🏒 Vue depuis ta crosse : choisis vite !' : '🎯 Choisis où tirer !';
  sfx.whistle();
}

function stopAiming() {
  G.aiming = null;
  $('#shot-panel').hidden = true;
}

function aimTimeout() {
  const a = G.aiming;
  stopAiming();
  if (!G.sim) return;
  const info = G.sim.release(a.aim, a.power);
  if (!info) return;
  swingFor(info);
  sfx.puck();
  setBanner('⏱️ Trop tard pour viser : tir au hasard !', 'info');
}

function drawShotPanel() {
  const panel = $('#shot-panel');
  const show = shotPanelVisible();
  panel.hidden = !show;
  if (!show) return;
  const zones = G.sim.zones();
  const g = G.sim.state.goalie;
  const cv = $('#shot-canvas');
  const W = cv.clientWidth;
  const H = cv.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cv.width !== W * dpr) {
    cv.width = W * dpr;
    cv.height = H * dpr;
  }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  // Vue de face de la cage : 1,83 m × 1,22 m ; la gauche du tireur (x positif) est à gauche.
  const sc = Math.min((W - 16) / 1.83, (H - 14) / 1.22);
  // U13 : vue depuis la palette. De côté, la cage paraît plus étroite (angle de tir réel).
  const st = G.sim.state;
  const from = G.sim.blade(st.me);
  let squeeze = 1;
  if (G.level.stickAngle) squeeze = Math.max(0.35, Math.abs(NET.z - from.z) / (Math.hypot(NET.x - from.x, NET.z - from.z) || 1));
  const cx = W / 2;
  const by = H - 6;
  const X = (x) => cx - x * sc * squeeze;
  const Y = (y) => by - y * sc;
  c.fillStyle = 'rgba(255,255,255,0.92)';
  const NW = 1.83 * sc * squeeze;
  c.fillRect(X(0.915), Y(1.22), NW, 1.22 * sc);
  c.strokeStyle = 'rgba(0,0,0,0.12)';
  c.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    c.beginPath();
    c.moveTo(X(0.915) + (i * NW) / 8, Y(1.22));
    c.lineTo(X(0.915) + (i * NW) / 8, by);
    c.stroke();
  }
  c.strokeStyle = '#d7263d';
  c.lineWidth = 5;
  c.strokeRect(X(0.915), Y(1.22), NW, 1.22 * sc);
  // Gardien (dessiné à l'intérieur du cadre de la cage)
  c.save();
  c.beginPath();
  c.rect(X(0.915), Y(1.22), NW, 1.22 * sc);
  c.clip();
  c.translate(cx, 0);
  c.scale(squeeze, 1);
  c.translate(-cx, 0);
  const gs = G.level.goalieSize ?? 1;
  c.fillStyle = '#e5484d';
  const gx = cx - g.x * sc;
  const k = gs; // gardien plus ou moins grand selon la catégorie
  if (g.butterfly) {
    c.fillRect(gx - 0.86 * k * sc, Y(0.3), 1.72 * k * sc, 0.3 * sc); // jambières au sol
    c.fillRect(gx - 0.32 * k * sc, Y(0.86), 0.64 * k * sc, 0.56 * sc); // corps
    c.fillRect(gx - 0.56 * k * sc, Y(0.78), 0.24 * k * sc, 0.3 * sc); // mitaine
    c.fillRect(gx + 0.32 * k * sc, Y(0.78), 0.24 * k * sc, 0.3 * sc); // bouclier
  } else {
    c.fillRect(gx - 0.4 * k * sc, Y(0.22), 0.28 * k * sc, 0.22 * sc); // jambière
    c.fillRect(gx + 0.12 * k * sc, Y(0.22), 0.28 * k * sc, 0.22 * sc); // jambière
    c.fillRect(gx - 0.42 * k * sc, Y(1.05), 0.84 * k * sc, 0.83 * sc); // corps
    c.fillRect(gx - 0.6 * k * sc, Y(0.92), 0.18 * k * sc, 0.4 * sc); // mitaine
    c.fillRect(gx + 0.42 * k * sc, Y(0.92), 0.18 * k * sc, 0.4 * sc); // bouclier
  }
  c.fillStyle = '#f1c27d';
  c.beginPath();
  c.arc(gx, Y(g.butterfly ? 0.98 : 1.15), 0.1 * sc, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // Cibles (boutons placés sur la cage)
  // Compte à rebours
  $('#shot-timer-fill').style.transform = `scaleX(${Math.max(0, 1 - G.aiming.t / G.aiming.max)})`;
  // U13 : la crosse est-elle orientée vers le but ?
  const tip = $('#shot-stick');
  tip.hidden = !G.level.stickAngle;
  if (G.level.stickAngle) {
    const off = G.sim.stickOffset(angleTo(from, NET));
    tip.textContent = off > 0.5 ? '⚠️ Ton regard est sur le but, mais pas ta crosse : tir imprécis' : '✅ Crosse orientée vers le but';
    tip.dataset.ok = off > 0.5 ? '0' : '1';
  }
  for (const z of zones) {
    const b = panel.querySelector(`[data-zone="${z.id}"]`);
    b.style.left = `${X(z.x)}px`;
    b.style.top = `${Y(z.y)}px`;
    b.classList.toggle('open', z.open);
  }
}

for (const b of document.querySelectorAll('.zone-btn')) {
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!shotPanelVisible()) return;
    if (G.radar == null) G.radar = allSeen();
    const power = G.aiming.power;
    stopAiming();
    const info = G.sim.release(0, Math.max(0.5, power), { zone: b.dataset.zone });
    if (!info) return;
    swingFor(info);
    sfx.puck();
    setBanner(`🎯 Tir ${info.zoneLabel} !`, 'info');
  });
}

// Clavier (pratique pour tester sur ordinateur) : flèches, B pour freiner, espace pour tirer tout droit.
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
    } else if (ev.type === 'mateReceive' && st.scn.giveGo && st.lastPassFromMe === ev.num && !st.returned) {
      sfx.puck();
      setBanner('🔁 Démarque-toi : il peut te la rendre !', 'scan');
    } else if (ev.type === 'pass' && ev.giveGo) {
      sfx.puck();
      setBanner('🔁 Une-deux !', 'decide');
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
      if (o.scorer && o.scorer.isMe && st.returned) return ['🚨 BUT sur une une-deux ! Bien démarqué.', ''];
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
    : '👀 Repère tous les attaquants dès le début : tourne-toi pour les voir.';
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

  let [outcome, tip] = outcomeText(st);
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
  if (rel && rel.isShot && rel.zone) {
    const g = rel.goalieButterfly ? 'Le gardien était en papillon (au sol)' : 'Le gardien était debout';
    if (rel.offAxisBad) tip = `Tu regardais le but, mais ta crosse et ton corps n'étaient pas tournés vers lui : le tir part de la palette, dans l'axe de la crosse. Oriente-toi vers la cible avant de tirer.`;
    else if (!rel.zoneOpen) tip = `${g} et couvrait la zone « ${rel.zoneLabel} » : vise une cible verte.`;
    else if (st.over.type === 'goal') tip = `${g} : la zone « ${rel.zoneLabel} » était libre. Bien visé !`;
    else if (st.over.type === 'save') tip = `La zone « ${rel.zoneLabel} » était libre, mais le gardien a eu le temps de se déplacer : tire plus vite, dès que la cible est verte.`;
    else if (st.over.type === 'wide') tip = `La zone « ${rel.zoneLabel} » était libre, mais le tir est parti à côté : tire un peu moins fort pour être plus précis.`;
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
    : '👀 Avant de jouer le palet, tourne-toi pour repérer tous tes coéquipiers.';
  $('#res-radar').className = radar ? 'ok' : 'warn';
  $('#res-lesson').textContent = st.scn.lesson;
  $('#btn-next').textContent = G.index + 1 < G.queue.length ? 'Suivant ▶' : 'Résultats ▶';
  showScreen('#result');
  drawReplay($('#res-diagram'), st, rel);
  speak(`${titles[stars]} ${outcome}`);
}

function next() {
  if (G.session && G.session.live) {
    const L = G.session.live;
    if (performance.now() >= L.endAt) {
      G.session.stats.live = { situations: G.results.length, stars: G.results.reduce((a, b) => a + (b || 0), 0) };
      nextSegment();
      return;
    }
    G.index += 1;
    if (G.index >= G.queue.length) G.queue.push(...liveQueue(L.mode, 6));
    showIntro();
    return;
  }
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
  // Pendant le tutoriel, l'encadré du tuto donne les consignes : on ne garde que les petits messages.
  if (G.tuto && !G.tuto.done && kind !== 'info') return;
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
    // Gardien en papillon : plus bas et plus large.
    if (a.goalie) G.meshes[i].mesh.scale.set(a.butterfly ? 1.6 : 1.25, a.butterfly ? 0.62 : 1.05, 1.25);
  });
  const p = st.puck;
  const mine = p.owner === st.me;
  world.setHolding(mine);
  if (!mine) world.puck.position.set(p.x, p.y, p.z);
  if (G.view3) {
    // 3e personne : ton joueur est visible, le palet est dessiné sur sa palette.
    world.showMe(true);
    world.setHolding(false);
    world.puck.position.set(p.x, p.y, p.z);
    world.setChase(st.me.x, st.me.z, st.me.yaw, st.me.yaw + st.me.head);
    return;
  }
  world.showMe(false);
  world.setBody(st.me.x, st.me.z, st.me.yaw);
  world.setView(st.me.x, st.me.z, st.me.yaw + st.me.head);
}

// ---------- palet hors de l'écran ----------
// Quand le palet n'est pas dans le champ de vision, une icône palet avec une flèche apparaît sur le
// bord de l'écran, du côté où il se trouve (en bas, « derrière toi », s'il est dans le dos).
function updatePuckIndicator() {
  const el = $('#puck-ind');
  const st = G.sim && G.phase === 'play' ? G.sim.state : null;
  const tutoEarly = G.tuto && !G.tuto.done && G.tuto.step < 5; // pas de palet dans les premières étapes
  if (!st || st.over || st.puck.owner === st.me || tutoEarly) {
    el.hidden = true;
    return;
  }
  const p = st.puck;
  const view = st.me.yaw + st.me.head;
  const rel = wrap(angleTo(st.me, p) - view); // + = à gauche
  const half = world.getHfov() / 2;
  if (Math.abs(rel) < half * 0.92) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const d = Math.hypot(p.x - st.me.x, p.z - st.me.z);
  const behind = Math.abs(rel) > (150 * Math.PI) / 180;
  el.dataset.side = behind ? 'back' : rel > 0 ? 'left' : 'right';
  $('#puck-ind-arrow').textContent = behind ? '⬇' : rel > 0 ? '⬅' : '➡';
  $('#puck-ind-text').textContent = behind ? `derrière toi · ${Math.round(d)} m` : `${Math.round(d)} m`;
  // Plus le palet est loin derrière sur le côté, plus l'icône descend sur le bord.
  const k = Math.min(1, (Math.abs(rel) - half) / (Math.PI - half));
  el.style.setProperty('--k', k.toFixed(2));
}

// ---------- boucle ----------
function update(dt) {
  if (G.phase === 'drill' && G.drill) {
    if (G.drill.update(dt)) finishDrill();
    return;
  }
  if (G.session && G.session.live && G.phase === 'play') {
    const left = Math.max(0, (G.session.live.endAt - performance.now()) / 1000);
    $('#hud-step').textContent = `⏱️ ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  }
  if (G.phase === 'menu' || G.phase === 'hand' || G.phase === 'program' || !G.sim) {
    G.menuYaw += dt * 0.12;
    world.setView(0, -12, G.menuYaw, 3.5);
    return;
  }
  if (G.phase === 'play') {
    updateInput();
    if (G.aiming) {
      G.aiming.t += dt;
      if (!shotPanelVisible()) stopAiming();
      else if (G.aiming.t >= G.aiming.max) aimTimeout();
    }
    G.sim.step(G.aiming ? dt * AIM_SLOWMO : dt, input);
    if (G.radar == null) trackSeen();
    handleEvents();
    const st = G.sim.state;
    $('#timer-fill').style.transform = `scaleX(${clamp(1 - st.t / G.level.time, 0, 1)})`;
    drawShotPanel();
    updatePuckIndicator();
    if (G.tuto) updateTuto(dt);
    else if (st.over && st.overT >= END_DELAY && !G.shown) showResult();
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

// ---------- programme : 3 séances de 15 min par semaine ----------
const PROG_KEY = 'tetehaute.program';
const loadProgram = () => load(PROG_KEY, { cat: 'U9', done: {}, history: [] });

function currentWeek() {
  return Math.min(PROGRAM_WEEKS, Math.max(1, weekOf(new Date())));
}

/** Semaine d'entraînement utilisée pour le contenu (pendant les vacances : le bloc précédent). */
function contentWeek(week) {
  let w = week;
  while (w > 1 && !blockOf(w)) w -= 1;
  return w;
}

function fmtDate(d) {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function renderProgram() {
  const prog = loadProgram();
  const week = currentWeek();
  const cw = contentWeek(week);
  const block = blockOf(cw);
  const before = weekOf(new Date()) === 0;
  $('#prog-week').textContent = isHoliday(week)
    ? `Semaine ${week} / ${PROGRAM_WEEKS} · 🎄 Vacances : séances libres`
    : `Semaine ${week} / ${PROGRAM_WEEKS}${before ? ' · le programme démarre le lundi 9 novembre' : ''}`;
  $('#prog-block').textContent = `Bloc ${block.id} · ${block.name}`;
  $('#prog-focus').textContent = `🎯 ${block.focus}`;
  const done = prog.done[week] || [];
  const box = $('#prog-sessions');
  box.innerHTML = '';
  for (const l of ['A', 'B', 'C']) {
    const plan = sessionPlan(cw, l);
    const b = document.createElement('button');
    b.className = `session${done.includes(l) ? ' done' : ''}`;
    b.innerHTML = `<span class="s-l">${done.includes(l) ? '✅' : l}</span><span class="s-t">${plan.title.split('· ')[1]}</span><span class="s-d">15 min</span>`;
    b.addEventListener('click', () => startSession(l));
    box.appendChild(b);
  }
  const cats = $('#prog-cats');
  cats.innerHTML = '';
  for (const lv of LEVELS) {
    const b = document.createElement('button');
    b.textContent = `${lv.name} (${lv.ages})`;
    b.className = prog.cat === lv.id ? 'on' : '';
    b.addEventListener('click', () => {
      const p = loadProgram();
      p.cat = lv.id;
      save(PROG_KEY, p);
      renderProgram();
    });
    cats.appendChild(b);
  }
  const ol = $('#prog-calendar');
  ol.innerHTML = '';
  for (const w of calendar()) {
    const li = document.createElement('li');
    const n = (prog.done[w.week] || []).length;
    li.textContent = w.holiday
      ? `Sem. ${w.week} (${fmtDate(w.start)}) : vacances`
      : `Sem. ${w.week} (${fmtDate(w.start)}) : ${w.block.name} ${'●'.repeat(n)}${'○'.repeat(3 - n)}`;
    if (w.holiday) li.className = 'holiday';
    if (w.week === week) li.className = 'now';
    ol.appendChild(li);
  }
}

function showProgram() {
  stopDrill();
  G.session = null;
  G.phase = 'program';
  G.sim = null;
  world.clearActors();
  world.setStickVisible(false);
  renderProgram();
  showScreen('#program');
}

/** File de situations (variantes) pour la partie « jeu » d'une séance. */
function liveQueue(mode, n) {
  const cat = loadProgram().cat;
  const att = SCENARIOS.filter((x) => x.level === cat);
  const def = DEFENSE_SCENARIOS.filter((x) => x.level === cat);
  const out = [];
  for (let i = 0; i < n; i++) {
    const m = mode === 'mixed' ? (i % 2 ? 'defense' : 'attack') : mode;
    const pool = m === 'defense' ? def : att;
    out.push(makeVariant(pool[Math.floor(Math.random() * pool.length)]));
  }
  return out;
}

function startSession(letter) {
  unlockAudio();
  const week = currentWeek();
  const plan = sessionPlan(contentWeek(week), letter);
  // ?rapide dans l'adresse : séance accélérée (démonstration aux entraîneurs, tests).
  if (new URLSearchParams(location.search).has('rapide')) {
    plan.segments = plan.segments.map((x) => ({ ...x, seconds: Math.max(8, Math.round(x.seconds / 20)) }));
  }
  const cat = loadProgram().cat;
  G.session = { week, letter, plan, seg: -1, stats: {}, base: LEVELS.find((l) => l.id === cat), live: null };
  nextSegment();
}

function nextSegment() {
  const S = G.session;
  stopDrill();
  S.live = null;
  S.seg += 1;
  const seg = S.plan.segments[S.seg];
  if (!seg) return;
  const label = `${S.seg + 1}/4 · ${seg.label}`;
  if (seg.drill === 'live') {
    G.level = scaledLevel(S.base, S.plan.block.diff);
    G.queue = liveQueue(seg.mode, 6);
    G.index = 0;
    G.results = [];
    S.live = { mode: seg.mode, endAt: performance.now() + seg.seconds * 1000 };
    setBanner(label, 'info');
    showIntro();
    return;
  }
  if (seg.drill === 'bilan') {
    showSessionEnd();
    return;
  }
  // Exercice court
  showScreen(null);
  $('#hud').hidden = true;
  G.phase = 'drill';
  G.sim = null;
  resetInput();
  const pool = SCENARIOS.filter((x) => x.level === S.base.id);
  world.showMe(false);
  world.setThirdPerson(false);
  G.drill = createDrill(seg.drill, { world, canvas, seg, rand: Math.random, sfx, speak, pool, hand: G.hand });
  G.drill.kind = seg.drill;
  $('#drill-seg').textContent = label;
  sfx.whistle();
}

function stopDrill() {
  world.setThirdPerson(!!G.view3);
  if (G.drill) {
    G.drill.destroy();
    G.drill = null;
  }
  closeDrillUI();
}

function finishDrill() {
  G.session.stats[G.drill.kind] = G.drill.stats;
  nextSegment();
}

function pct(a, b) {
  return b ? Math.round((100 * a) / b) : 0;
}

function showSessionEnd() {
  const S = G.session;
  G.phase = 'session-end';
  const st = S.stats;
  const lines = [];
  const tips = [];
  if (st.coupdoeil) {
    const c = st.coupdoeil;
    const avg = c.times.length ? c.times.reduce((a, b) => a + b, 0) / c.times.length : 0;
    lines.push(`👀 Coup d’œil : ${c.hits} / ${c.reps} trouvés${avg ? `, en ${avg.toFixed(1).replace('.', ',')} s en moyenne` : ''}`);
    if (pct(c.hits, c.reps) < 70) tips.push('Tourne la tête plus tôt et plus souvent : regarde derrière toi avant même que le palet arrive.');
  }
  if (st.live) {
    const max = st.live.situations * 3;
    lines.push(`🏒 Situations de jeu : ${st.live.situations} jouées, ⭐ ${st.live.stars} / ${max}`);
    if (pct(st.live.stars, max) < 50) tips.push('En situation, prends l’information AVANT d’avoir le palet : tu décideras plus vite.');
  }
  if (st.arret) {
    const a = st.arret;
    lines.push(`⏸️ Arrêt sur image : ${a.hits} / ${a.reps} bonnes décisions`);
    if (a.stopReps) lines.push(`🛑 Savoir garder le palet : ${a.stopHits} / ${a.stopReps}`);
    if (a.stopReps && pct(a.stopHits, a.stopReps) < 60) tips.push('Avant de passer, vérifie la ligne de passe une dernière fois : si un adversaire la coupe, garde le palet.');
  }
  if (st.memoire) {
    const m = st.memoire;
    lines.push(`🧠 Mémoire de glace : ${m.hits} / ${m.reps}`);
    if (pct(m.hits, m.reps) < 60) tips.push('Pour mémoriser, repère d’abord tes coéquipiers, puis les adversaires les plus proches.');
  }
  // Sauvegarde de la séance
  const prog = loadProgram();
  const done = new Set(prog.done[S.week] || []);
  done.add(S.letter);
  prog.done[S.week] = [...done];
  prog.history.push({ date: new Date().toISOString(), week: S.week, letter: S.letter, stats: st });
  prog.history = prog.history.slice(-200);
  save(PROG_KEY, prog);

  $('#se-step').textContent = `Semaine ${S.week} · ${S.plan.title}`;
  $('#se-title').textContent = done.size >= 3 ? 'Semaine complète ! 🏆' : 'Séance terminée ! 💪';
  $('#se-list').innerHTML = lines.map((l) => `<li>${l}</li>`).join('');
  $('#se-tip').textContent = `🎓 ${tips[0] || S.plan.focus}`;
  G.sim = null;
  world.clearActors();
  showScreen('#session-end');
  sfx.good();
  speak($('#se-title').textContent);
}

// ---------- tutoriel ----------
// Parcours guidé : chaque étape est validée automatiquement quand le geste est réussi.
const TUTO_KEY = 'tetehaute.tuto';
const TUTO_STEPS = [
  { id: 'move', icon: '🕹️', text: 'Pose ton pouce dans la zone de déplacement et pousse-le vers le haut pour avancer.', zones: true },
  { id: 'turn', icon: '↪️', text: 'Garde ton pouce posé et déplace-le sur le côté pour tourner. Plus tu vas loin, plus tu tournes vite.' },
  { id: 'back', icon: '⬇️', text: 'Tire ton pouce vers le bas pour patiner à reculons.' },
  { id: 'brake', icon: '🛑', text: 'Avance, lâche l’écran (tu glisses), puis tape deux fois pour freiner.' },
  { id: 'look', icon: '👀', text: 'Glisse ton doigt dans l’autre zone pour regarder autour de toi sans changer de direction.', zones: true },
  { id: 'pass', icon: '🏒', text: 'Tu as le palet ! Swipe vers le haut en direction du n°9 pour lui faire une passe.' },
  { id: 'shoot', icon: '🥅', text: 'Swipe vers le but : le jeu ralentit, touche une cible VERTE pour tirer.' },
];
const TUTO_SCN = {
  id: 'tuto',
  title: 'Tutoriel',
  me: { x: 0, z: 0 },
  passer: { num: 4, x: -9, z: -12 },
  teammates: [{ num: 9, x: 6, z: 7 }],
  opponents: [{ goalie: true, x: 0, z: 25.2 }],
  lesson: '',
};

function startTuto() {
  unlockAudio();
  G.mode = 'attack';
  G.session = null;
  G.level = { ...LEVELS[0], time: 1e9, passDelay: 1e9, shotTime: 4 };
  G.queue = [TUTO_SCN];
  G.index = 0;
  G.results = [];
  loadScenario(TUTO_SCN);
  G.tuto = { step: -1, t: 0 };
  G.phase = 'play';
  resetInput();
  showScreen(null);
  $('#hud-level').textContent = '🎓 Tuto';
  $('#hud-step').hidden = true;
  $('#timer').hidden = true;
  $('#ctl-hint').hidden = true;
  $('#tuto').hidden = false;
  nextTutoStep();
}

function nextTutoStep() {
  const T = G.tuto;
  T.step += 1;
  T.t = 0;
  const st = G.sim.state;
  T.start = { x: st.me.x, z: st.me.z, yaw: st.me.yaw };
  T.turned = 0;
  T.lastYaw = st.me.yaw;
  T.braked = false;
  T.fast = false;
  if (T.step >= TUTO_STEPS.length) {
    $('#tuto-icon').textContent = '🎉';
    $('#tuto-text').textContent = 'Bravo, tu es prêt à jouer ! Choisis ta catégorie dans le menu.';
    $('#tuto-dots').textContent = '●'.repeat(TUTO_STEPS.length);
    $('#tuto-skip').textContent = 'Menu ▶';
    save(TUTO_KEY, true);
    sfx.good();
    speak('Bravo, tu es prêt à jouer !');
    T.done = true;
    return;
  }
  const S = TUTO_STEPS[T.step];
  $('#tuto-icon').textContent = S.icon;
  $('#tuto-text').textContent = S.text;
  $('#tuto-dots').textContent = '●'.repeat(T.step) + '◉' + '○'.repeat(TUTO_STEPS.length - T.step - 1);
  $('#tuto-skip').textContent = 'Passer ▶';
  showZones(!!S.zones);
  if (S.id === 'pass') G.sim.resetMe(0, 0, Math.atan2(6, 7) - 0.15); // face au n°9
  if (S.id === 'shoot') G.sim.resetMe(0, 12, 0);
  if (T.step > 0) sfx.good();
  speak(S.text);
}

function updateTuto(dt) {
  const T = G.tuto;
  if (T.done) return;
  T.t += dt;
  const st = G.sim.state;
  const me = st.me;
  const id = TUTO_STEPS[T.step].id;
  T.turned += Math.abs(wrap(me.yaw - T.lastYaw));
  T.lastYaw = me.yaw;
  if (me.speed > 2) T.fast = true;
  let ok = false;
  if (id === 'move') ok = Math.hypot(me.x - T.start.x, me.z - T.start.z) > 4;
  else if (id === 'turn') ok = T.turned > 1.5;
  else if (id === 'back') ok = me.speed < -1.2;
  else if (id === 'brake') ok = T.fast && T.braked;
  else if (id === 'look') ok = Math.abs(me.head) > 0.5;
  else if (id === 'pass') {
    const mate = st.actors.find((a) => a.num === 9);
    ok = st.puck.owner === mate;
    // Passe ratée : on redonne le palet après 3 s
    if (!ok && st.releases.length && !st.puck.owner && Math.hypot(st.puck.vx, st.puck.vz) < 1) {
      T.retry = (T.retry || 0) + dt;
      if (T.retry > 1.5) {
        T.retry = 0;
        G.sim.resetMe(0, 0, Math.atan2(6, 7) - 0.15);
        setBanner('On recommence : vise le n°9 !', 'info');
      }
    }
  } else if (id === 'shoot') {
    if (st.over) {
      if (!T.shotT) {
        T.shotT = T.t;
        if (st.over.type === 'goal') {
          flash('BUT ! 🚨');
          sfx.horn();
        } else setBanner(st.over.type === 'save' ? '🧤 Arrêt ! Le tir compte quand même 👍' : '↗️ À côté ! Le tir compte quand même 👍', 'info');
      }
      ok = T.t - T.shotT > 1.5;
    }
  }
  if (ok && T.t > 0.6) nextTutoStep();
}

// ---------- boutons ----------
$('#btn-tuto').addEventListener('click', startTuto);
function setView3(on) {
  G.view3 = !!on;
  save(VIEW_KEY, G.view3 ? '3' : '1');
  world.setThirdPerson(G.view3);
}
for (const b of document.querySelectorAll('.view-btn')) {
  b.addEventListener('click', () => {
    setView3(b.dataset.view === '3');
    renderMenu();
  });
}
setView3(load(VIEW_KEY, '1') === '3');
$('#tuto-skip').addEventListener('click', () => {
  if (!G.tuto || G.tuto.done) goMenu();
  else nextTutoStep();
});
$('#btn-program').addEventListener('click', showProgram);
$('#prog-back').addEventListener('click', goMenu);
$('#se-done').addEventListener('click', showProgram);
$('#drill-quit').addEventListener('click', showProgram);
for (const b of document.querySelectorAll('.hand-btn')) b.addEventListener('click', () => setHand(b.dataset.hand));
$('#btn-hand').addEventListener('click', () => showScreen('#hand'));

$('#btn-go').addEventListener('click', beginPlay);
$('#btn-next').addEventListener('click', next);
$('#btn-retry').addEventListener('click', showIntro);
$('#btn-again').addEventListener('click', () => startLevel(G.level.id, G.mode));
$('#btn-menu').addEventListener('click', goMenu);
$('#btn-quit').addEventListener('click', () => (G.session ? showProgram() : goMenu()));
$('#intro-back').addEventListener('click', () => (G.session ? showProgram() : goMenu()));
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
window.__game = { G, input, world, startLevel, beginPlay, setHand, startSession, showProgram, nextSegment };

G.hand = load(HAND_KEY, null);
if (G.hand) world.setHand(G.hand);
goMenu();
requestAnimationFrame(frame);
