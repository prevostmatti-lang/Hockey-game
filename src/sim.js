// Simulation en temps réel d'une situation de jeu : patinage, palet, gardien, coéquipiers et adversaires.
// Aucun rendu ici : le module est testable avec Node (voir tests/sim.test.mjs).
//
// Repère : x = largeur (-13..13), z = longueur (-30..30), le but adverse est en z = +26.
// Orientation (yaw) : la direction avant est (sin yaw, cos yaw) ; augmenter yaw tourne vers la gauche.
//
// Deux modes :
//   - attaque (par défaut) : le joueur reçoit le palet et attaque le but en z = +26 ;
//   - défense (scn.mode === 'defense') : un adversaire a le palet et attaque notre but en z = -26.
//     Le joueur doit tenir sa mission (scn.duty) et récupérer le palet sans encaisser de but.

import { evaluate, gradeDecision, NET } from './evaluate.js';

const GOAL_Z = 26;
const OWN_NET = { x: 0, z: -26 };
const NET_H = 1.22; // hauteur de la cage (m)
const CORNER_R = 8.5; // rayon des coins arrondis de la patinoire (m)

/** Ramène un point à l'intérieur de la patinoire aux coins arrondis (marge en m). Renvoie la normale si on a touché. */
function inRink(o, margin) {
  const hx = 13 - margin;
  const hz = 30 - margin;
  const r = CORNER_R - margin;
  const cx = hx - r;
  const cz = hz - r;
  if (Math.abs(o.x) > cx && Math.abs(o.z) > cz) {
    const dx = Math.abs(o.x) - cx;
    const dz = Math.abs(o.z) - cz;
    const d = Math.hypot(dx, dz);
    if (d > r) {
      const nx = (dx / d) * Math.sign(o.x);
      const nz = (dz / d) * Math.sign(o.z);
      o.x = Math.sign(o.x) * (cx + (dx / d) * r);
      o.z = Math.sign(o.z) * (cz + (dz / d) * r);
      return { nx, nz };
    }
  }
  return null;
}
const GRAVITY = 9.8;

/**
 * Cibles de tir dans la cage, vues par le tireur qui attaque le but en z = +26
 * (sa gauche à l'écran = x positif). La cible « entre les jambières » suit le gardien.
 */
export const SHOT_ZONES = [
  { id: 'HG', label: 'haut gauche', x: 0.66, y: 1.02 },
  { id: 'HD', label: 'haut droite', x: -0.66, y: 1.02 },
  { id: 'BG', label: 'bas gauche', x: 0.66, y: 0.14 },
  { id: 'BD', label: 'bas droite', x: -0.66, y: 0.14 },
  { id: 'J', label: 'entre les jambières', x: 0, y: 0.1, five: true },
];

/**
 * Style du gardien, tiré au hasard à chaque nouvelle possession (il se replace) : les espaces
 * ouverts changent d'une action à l'autre, on ne peut pas les apprendre par cœur.
 *   glove   : côté de la mitaine dans la cage (x du tireur ; -1 = gardien « normal » qui attrape
 *             de la main gauche, vu de face c'est à droite du tireur)
 *   gloveHigh / blockerHigh : bras hauts (coin haut fermé) ou à mi-hauteur (coin haut ouvert)
 *   five    : jambières écartées (entre les jambières ouvert)
 *   stick   : crosse bien au sol, côté bouclier (coin bas côté bouclier fermé)
 *   padWide : jambière côté mitaine très ouverte (coin bas côté mitaine fermé)
 *   cheat   : collé au poteau proche (> 0 : le côté éloigné s'ouvre) ou trop au centre (< 0)
 */
export function rollGoalieStyle(rand = Math.random) {
  const st = {
    glove: rand() < 0.8 ? -1 : 1,
    gloveHigh: rand() < 0.5,
    blockerHigh: rand() < 0.4,
    five: rand() < 0.5,
    stick: rand() < 0.4,
    padWide: rand() < 0.3,
    cheat: -0.05 + rand() * 0.4,
  };
  // Debout, face au but : au moins un coin reste ouvert (le gardien n'est pas un mur).
  const corners = [
    [0.6, 0.92],
    [-0.6, 0.92],
    [0.6, 0.13],
    [-0.6, 0.13],
  ];
  if (corners.every(([x, y]) => goalieCovers({ x: 0, style: st }, x, y))) {
    const k = Math.floor(rand() * 4);
    if (k === 0 || k === 1) (corners[k][0] * st.glove > 0 ? (st.gloveHigh = false) : (st.blockerHigh = false));
    else corners[k][0] * st.glove > 0 ? (st.padWide = false) : (st.stick = false);
  }
  return st;
}

/**
 * Silhouette du gardien vue de face : rectangles [x0, x1, y0, y1], x relatif au gardien
 * (dans le repère du tireur : x positif = à gauche à l'écran). Sert au calcul ET au dessin.
 * Debout : corps et jambières au milieu, bras selon le style. Papillon (palet tout près) :
 * tout le bas fermé. Palet sur le côté, tout près : il colle le poteau proche (tout ce côté fermé,
 * le haut du côté éloigné ouvert).
 */
export function goalieShape(keeper) {
  const st = keeper.style || { glove: -1, gloveHigh: false, blockerHigh: false, five: true, stick: false, padWide: false };
  const g = st.glove;
  const side = (a, b, sgn) => (sgn > 0 ? [a, b] : [-b, -a]);
  const R = [];
  if (keeper.post) {
    const n = keeper.post; // côté du poteau proche
    R.push([...side(-0.15, 1.0, n), 0, 1.2]); // collé au poteau : tout le côté proche
    R.push([...side(0, 1.6, -n), 0, 0.3]); // jambière au sol jusqu'au poteau éloigné
    R.push([...side(0, 0.38, -n), 0, 0.9]); // corps
    R.push([...side(0.38, 0.6, -n), 0.4, 0.8]); // bras côté éloigné
    return R;
  }
  if (keeper.butterfly) {
    R.push([-0.86, 0.86, 0, 0.36]); // jambières au sol
    R.push([-0.36, 0.36, 0, 0.86]); // corps
    // Bras : l'un des deux peut fermer son coin haut, jamais les deux (en papillon, on tire haut).
    const gHigh = st.gloveHigh;
    const bHigh = st.blockerHigh && !st.gloveHigh;
    R.push([...side(0.36, gHigh ? 0.72 : 0.56, g), gHigh ? 0.5 : 0.4, gHigh ? 1.05 : 0.8]); // mitaine
    R.push([...side(0.36, bHigh ? 0.7 : 0.56, -g), bHigh ? 0.5 : 0.4, bHigh ? 1.02 : 0.8]); // bouclier
    return R;
  }
  const gap = st.five || keeper.moving ? 0.08 : 0; // en déplacement latéral, les jambières s'écartent
  R.push([-0.42, -gap, 0, 0.24], [gap, 0.42, 0, 0.24]); // jambières
  R.push([-0.42, 0.42, 0.22, 1.05]); // corps
  R.push([...side(0.42, 0.74, g), st.gloveHigh ? 0.6 : 0.4, st.gloveHigh ? 1.12 : 0.84]); // mitaine
  R.push([...side(0.42, 0.64, -g), st.blockerHigh ? 0.55 : 0.32, st.blockerHigh ? 1.0 : 0.76]); // bouclier
  if (st.stick) R.push([...side(0.4, 0.8, -g), 0, 0.2]); // crosse au sol
  if (st.padWide) R.push([...side(0.4, 0.78, g), 0, 0.24]); // jambière tendue
  return R;
}

/** Le gardien couvre-t-il le point (x, y) de sa cage ? */
export function goalieCovers(keeper, x, y, scale = 1) {
  const rx = (x - keeper.x) / scale;
  return goalieShape(keeper).some(([x0, x1, y0, y1]) => rx >= x0 && rx <= x1 && y >= y0 && y <= y1);
}

/**
 * État des cibles de tir face à un gardien : position dans la cage et ouverture.
 * Le gardien se tient devant sa ligne : on regarde où la trajectoire du tireur (`from`)
 * croise la position du gardien, pas seulement la ligne de but.
 */
export function zoneStatus(keeper, from = null, reach = 0, skaters = [], size = 1) {
  const netZ = keeper.z > 0 ? GOAL_Z : -GOAL_Z;
  return SHOT_ZONES.map((z) => {
    const x = z.five ? keeper.x : z.x;
    let xAt = x;
    let yAt = z.y;
    // Collé au poteau, le gardien est sur sa ligne de but : pas de projection.
    if (from && !keeper.post && Math.abs(netZ - from.z) > 0.5) {
      const k = (keeper.z - from.z) / (netZ - from.z);
      xAt = from.x + (x - from.x) * k;
      yAt = 0.03 + (z.y - 0.03) * k; // le palet monte : il est un peu plus bas en passant devant le gardien
    }
    // Le gardien a le temps de glisser de `reach` mètres vers le tir avant que le palet arrive.
    const k2 = z.five ? keeper : { ...keeper, x: Math.max(-0.8, Math.min(0.8, keeper.x + Math.max(-reach, Math.min(reach, xAt - keeper.x)))) };
    // Un défenseur sur la trajectoire bloque les tirs bas (un tir haut passe au-dessus de sa crosse).
    let blocked = false;
    if (from) {
      for (const sk of skaters) {
        const r = segDist(sk, from, { x, z: netZ });
        const yy = 0.03 + (z.y - 0.03) * r.t;
        if (r.t > 0.05 && r.t < 0.95 && r.d < 0.7 && yy < 0.4) blocked = true;
      }
    }
    // La cible « entre les jambières » se vise sur le gardien lui-même.
    return { ...z, x, blocked, open: !blocked && !goalieCovers(k2, z.five ? keeper.x : xAt, yAt, size) };
  });
}

// Les cibles montrent ce qui est ouvert MAINTENANT (ce que l'enfant voit). Si le gardien a le
// temps de glisser (tir de loin, tir lent), c'est la simulation qui le montre : arrêt.

/** Vitesse verticale pour que le palet arrive à la hauteur h après une distance d. */
function liftFor(d, speed, h, y0 = 0.03) {
  const t = d / Math.max(4, speed);
  return (h - y0 + 0.5 * GRAVITY * t * t) / t;
}
const POST = 0.915;
const GOALIE_Z = 25.2;
const GOALIE_HALF = 0.45;
const LIMIT_X = 12.4;
const LIMIT_Z = 29.4;
const PUCK_FRICTION = 1.0;
const ME_MAX = 4.8; // vitesse de patinage max (m/s)
const ME_MAX_PUCK = 4.2; // un peu moins vite avec le palet
const ME_BACK = 3.2; // patinage à reculons
const ME_ACCEL = 5; // accélération (m/s²)
const ME_REVERSE = 16; // changement de sens avant ↔ arrière (m/s²) : quasi immédiat
// Rythme général des autres patineurs : ralenti dans la même proportion que le joueur (4,8 / 6,5)
// pour garder l'équilibre des situations.
const PACE = 0.75;
const GLIDE = 2.6; // ralentissement quand on glisse sans pousser (m/s²) : ~2 s pour s'arrêter
const TURN_MAX = 2.2; // vitesse de rotation au maximum (rad/s, ≈125°/s) : demi-tour en 1,5 s environ
const TURN_CURVE = 3; // courbure exponentielle de la réponse au pouce

/** Réponse exponentielle : petit écart du pouce = rotation douce ; pouce à 90° = rotation très rapide. */
export function turnRate(k) {
  const a = Math.min(1, Math.abs(k));
  return Math.sign(k) * TURN_MAX * (Math.exp(TURN_CURVE * a) - 1) / (Math.exp(TURN_CURVE) - 1);
}
const BRAKE = 10; // arrêt « chasse-neige » après un double tap (m/s²)
const MATE_SPEED = 4.2;

export const fwd = (yaw) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
/** Vecteur « à droite » du joueur (la droite de l'écran). */
export const rightOf = (yaw) => ({ x: -Math.cos(yaw), z: Math.sin(yaw) });
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const angleTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function segDist(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1e-9;
  const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2;
  const c = clamp(t, 0, 1);
  return { d: Math.hypot(p.x - (a.x + c * dx), p.z - (a.z + c * dz)), t };
}

/**
 * @param scn   situation (voir scenarios.js)
 * @param level réglages de la catégorie (voir LEVELS)
 * @param hand  'R' (palette à droite) ou 'L' (palette à gauche)
 */
export function createSim(scn, level, hand = 'R', rand = Math.random) {
  const defense = scn.mode === 'defense';
  const carrierData = defense ? scn.opponents.find((o) => o.carrier) : null;
  const me = {
    id: 'me',
    isMe: true,
    team: true,
    x: scn.me.x,
    z: scn.me.z,
    yaw: angleTo(scn.me, defense ? carrierData : NET),
    head: 0,
    speed: 0,
    vx: 0,
    vz: 0,
  };
  me.face = me.yaw;

  const actors = [];
  const mk = (data, extra) => {
    const a = {
      id: actors.length,
      num: data.num,
      x: data.x,
      z: data.z,
      vx: 0,
      vz: 0,
      start: { x: data.x, z: data.z },
      to: data.to ? { ...data.to } : { x: data.x, z: data.z },
      face: 0,
      hasT: 0,
      hand: data.hand || null, // complété plus bas pour équilibrer droitiers et gauchers
      ...extra,
    };
    a.face = angleTo(a, me);
    actors.push(a);
    return a;
  };
  const passer = defense ? null : mk(scn.passer, { team: true, role: 'passer' });
  for (const t of scn.teammates) {
    const role = t.goalie ? 'goalie' : t.mark != null ? 'mark' : 'support';
    const a = mk(t, { team: true, goalie: !!t.goalie, role, mark: t.mark });
    if (a.goalie) a.face = 0;
  }
  let carrier = null;
  for (const o of scn.opponents) {
    let role = o.goalie ? 'goalie' : o.presser ? 'presser' : o.cover != null ? 'cover' : 'zone';
    if (defense && !o.goalie) role = 'attacker';
    const a = mk(o, { team: false, goalie: !!o.goalie, role, cover: o.cover });
    if (a.goalie) a.face = Math.PI;
    if (o.carrier) carrier = a;
  }
  // Autant de droitiers que de gauchers dans chaque équipe (à un joueur près si le nombre est impair).
  // On alterne ; les adversaires commencent par un gaucher pour équilibrer aussi l'ensemble de la glace.
  // Une main donnée dans la situation (champ `hand`) est respectée.
  for (const team of [true, false]) {
    const skaters = actors.filter((a) => a.team === team && !a.goalie);
    let right = skaters.filter((a) => a.hand === 'R').length;
    let left = skaters.filter((a) => a.hand === 'L').length;
    const preferLeftFirst = !team;
    for (const a of skaters) {
      if (a.hand) continue;
      if (right < left || (right === left && !preferLeftFirst)) {
        a.hand = 'R';
        right++;
      } else {
        a.hand = 'L';
        left++;
      }
    }
    for (const a of actors) if (a.goalie && !a.hand) a.hand = 'R';
  }
  const goalie = actors.find((a) => a.goalie && !a.team);
  const ourGoalie = actors.find((a) => a.goalie && a.team);

  const s = {
    t: 0,
    scn,
    level,
    hand,
    me,
    actors,
    passer,
    goalie,
    ourGoalie,
    defense,
    puck: { x: 0, z: 0, y: 0.02, vx: 0, vz: 0, owner: defense ? carrier : passer, releasedBy: null, releaseT: -9, shot: false, team: !defense },
    pokeT: 0,
    dutyT: 0,
    dutyOkT: 0,
    dutyNow: null,
    keyMoment: null,
    over: null,
    overT: 0,
    passDone: false,
    received: false,
    releases: [],
    stealT: 0,
    tooHard: false,
    lastPassFromMe: null,
    returned: false, // une-deux : le coéquipier a rendu le palet
    trailMe: [],
    trailPuck: [],
    trailT: 0,
    events: [],
  };

  // ---------- positions de la palette ----------
  function blade(p) {
    const yaw = p.isMe ? p.yaw : p.face;
    const f = fwd(yaw);
    const side = p.isMe ? (hand === 'R' ? 1 : -1) : p.hand === 'L' ? -1 : 1;
    const r = rightOf(yaw);
    // Même position que le palet porté sur la crosse dessinée (world.js : STICK_PUCK).
    return { x: p.x + f.x * 0.94 + r.x * 0.33 * side, z: p.z + f.z * 0.94 + r.z * 0.33 * side };
  }

  function emit(type, data = {}) {
    s.events.push({ type, t: s.t, ...data });
  }

  function end(type, extra = {}) {
    if (s.over) return;
    if (defense && !s.keyMoment) s.keyMoment = { t: s.t, me: { x: me.x, z: me.z }, ideal: s.dutyNow ? s.dutyNow.ideal : null };
    s.over = { type, t: s.t, x: s.puck.x, z: s.puck.z, ...extra };
    emit('over', { over: s.over });
  }

  function launch(from, aim, speed, by, shot, vy = 0) {
    const p = s.puck;
    const b = blade(from);
    const f = fwd(aim);
    p.owner = null;
    p.x = b.x;
    p.z = b.z;
    p.y = 0.03;
    p.vy = vy;
    p.vx = f.x * speed;
    p.vz = f.z * speed;
    p.releasedBy = by;
    p.releaseT = s.t;
    p.shot = shot;
    p.team = by.team;
    p.speed0 = speed;
  }

  function gain(a) {
    const p = s.puck;
    p.owner = a;
    p.vx = 0;
    p.vz = 0;
    p.shot = false;
    a.hasT = 0;
    if (a.isMe) {
      if (!s.received) s.receiveT = s.t;
      s.received = true;
      emit('receive');
    } else if (a.team) emit('mateReceive', { num: a.num });
  }

  /** Point visé pour une passe vers `target`, en anticipant son déplacement. */
  function lead(from, target, speed) {
    const t = dist(from, target) / speed;
    return { x: target.x + (target.vx || 0) * t, z: target.z + (target.vz || 0) * t };
  }

  /** Aucun joueur de l'équipe adverse (`team` = équipe qui joue le palet) sur la trajectoire ? */
  function laneClear(from, to, width, team = true) {
    const skaters = team ? actors : [me, ...actors];
    return !skaters.some((o) => {
      if (o.team === team || o.goalie) return false;
      const { d, t } = segDist(o, from, to);
      return t > 0.08 && t < 0.92 && d < width;
    });
  }

  // ---------- déplacements ----------
  function moveTo(a, target, speed, dt) {
    speed *= PACE;
    target = onside(a, target);
    const dx = target.x - a.x;
    const dz = target.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) {
      a.vx = 0;
      a.vz = 0;
      return;
    }
    const step = Math.min(d, speed * dt);
    a.vx = (dx / d) * (step / dt);
    a.vz = (dz / d) * (step / dt);
    a.x += (dx / d) * step;
    a.z += (dz / d) * step;
  }

  // ---------- hors-jeu ----------
  // Ligne bleue offensive : z = +7,5 pour notre équipe (qui attaque vers +z), z = -7,5 pour l'adversaire.
  // Un joueur sans palet ne doit pas entrer dans la zone offensive avant le palet : il attend à la ligne.
  const BLUE = 7.5;
  function puckZ() {
    const p = s.puck;
    return p.owner ? p.owner.z : p.z;
  }
  function onside(a, target) {
    if (a.goalie || a.isMe || s.puck.owner === a) return target;
    const pz = puckZ();
    if (a.team && pz < BLUE && target.z > BLUE - 0.3) return { x: target.x, z: BLUE - 0.3 };
    if (!a.team && pz > -BLUE && target.z < -BLUE + 0.3) return { x: target.x, z: -BLUE + 0.3 };
    return target;
  }
  /** Le palet vient d'entrer dans une zone offensive : un attaquant sans palet y était-il déjà ? */
  function checkOffside(prevZ) {
    const z = puckZ();
    const owner = s.puck.owner;
    const players = [me, ...actors.filter((a) => !a.goalie)];
    if (prevZ < BLUE && z >= BLUE) {
      const off = players.find((a) => a.team && a !== owner && a.z > BLUE + 0.4);
      if (off) end('offside', { team: true, num: off.isMe ? null : off.num, isMe: !!off.isMe });
    } else if (prevZ > -BLUE && z <= -BLUE) {
      const off = players.find((a) => !a.team && a !== owner && a.z < -BLUE - 0.4);
      if (off) end('offside', { team: false, num: off.num });
    }
  }

  function confine(a) {
    a.x = clamp(a.x, -LIMIT_X, LIMIT_X);
    a.z = clamp(a.z, -LIMIT_Z, LIMIT_Z);
    inRink(a, 0.6);
    // On ne traverse pas la cage
    if (a.z > 25.6 && a.z < 27.3 && Math.abs(a.x) < 1.3) a.x = a.x < 0 ? -1.3 : 1.3;
  }

  function stepMe(dt, input) {
    const holding = s.puck.owner === me;
    const max = holding ? ME_MAX_PUCK : ME_MAX;
    if (input.brake) me.braking = true;
    if (input.skate || input.back) me.braking = false;
    if (input.back) {
      // Reculer : vitesse selon la distance du pouce, comme en avant.
      // Si on allait encore en avant, on freine fort pour changer de sens tout de suite.
      const target = -ME_BACK * clamp(input.throttle ?? 1, 0.4, 1);
      const acc = me.speed > 0 ? ME_REVERSE : ME_ACCEL;
      if (me.speed > target) me.speed = Math.max(target, me.speed - acc * dt);
      else me.speed = Math.min(target, me.speed + GLIDE * dt);
    }
    else if (input.skate) {
      // Vitesse visée selon la distance du pouce ; au-dessus, on ralentit en glissant.
      const target = max * clamp(input.throttle ?? 1, 0.3, 1);
      // Si on reculait encore, on freine fort pour repartir en avant tout de suite.
      const acc = me.speed < 0 ? ME_REVERSE : ME_ACCEL;
      if (me.speed < target) me.speed = Math.min(target, me.speed + acc * dt);
      else me.speed = Math.max(target, me.speed - GLIDE * dt);
    }
    else {
      // Sans pousser, on glisse en ralentissant peu à peu ; après un double tap, on freine fort.
      const decel = me.braking ? BRAKE : GLIDE;
      me.speed -= Math.sign(me.speed) * Math.min(Math.abs(me.speed), decel * dt);
      if (me.speed === 0) me.braking = false;
    }
    // On peut tourner même à l'arrêt (pivot sur les patins), pour faire demi-tour facilement.
    me.yaw = wrap(me.yaw - turnRate(clamp(input.turn || 0, -1, 1)) * (input.turnBoost || 1) * dt);
    // La tête suit le corps (plus de regard séparé) ; on garde la possibilité pour plus tard.
    const headTarget = input.headAngle != null ? clamp(input.headAngle, -2.9, 2.9) : clamp(input.head || 0, -1, 1) * 2.3;
    me.head += (headTarget - me.head) * Math.min(1, dt * 6);
    const f = fwd(me.yaw);
    me.vx = f.x * me.speed;
    me.vz = f.z * me.speed;
    me.x += me.vx * dt;
    me.z += me.vz * dt;
    // On ne passe pas à travers les autres joueurs
    for (const a of actors) {
      const d = dist(me, a);
      if (d < 0.8 && d > 1e-6) {
        me.x = a.x + ((me.x - a.x) / d) * 0.8;
        me.z = a.z + ((me.z - a.z) / d) * 0.8;
      }
    }
    confine(me);
    me.face = me.yaw;
  }

  function mateAI(a, dt) {
    const p = s.puck;
    if (a.goalie) return goalieAI(a, dt);
    if (a.role === 'mark') {
      // Défenseur partenaire : reste entre « son » attaquant et notre but.
      const target = actors.find((o) => !o.team && o.num === a.mark);
      if (target) {
        const d = dist(target, OWN_NET) || 1;
        moveTo(a, { x: target.x + ((OWN_NET.x - target.x) / d) * 2.2, z: target.z + ((OWN_NET.z - target.z) / d) * 2.2 }, 4.2, dt);
      }
      a.face = angleTo(a, p);
      return;
    }
    if (p.owner === a) {
      a.hasT += dt;
      if (a.role === 'passer') {
        // Le passeur envoie le palet au joueur après le délai prévu.
        if (s.t >= level.passDelay && !s.passDone) {
          s.passDone = true;
          const speed = 12;
          const target = lead(blade(a), { ...blade(me), vx: me.vx, vz: me.vz }, speed);
          launch(a, angleTo(blade(a), target), speed, a, false);
          emit('pass', { from: a.num });
        }
        a.face = angleTo(a, me);
        return;
      }
      const toNet = dist(a, NET);
      const shoot = (speed) => {
        const zs = goalie ? zoneStatus(goalie, a, 0, actors.filter((o) => !o.team && !o.goalie), level.goalieSize ?? 1).filter((z) => z.open) : [];
        const z = zs.length ? zs[Math.floor(rand() * zs.length)] : { x: goalie && goalie.x > 0 ? -0.7 : 0.7, y: 0.15 };
        const b = blade(a);
        const err = 0.03 * dist(b, NET);
        const tx = z.x + (rand() - 0.5) * 2 * err;
        const ty = clamp(z.y + (rand() - 0.5) * 2 * err * 0.6, 0.05, 1.4);
        launch(a, angleTo(b, { x: tx, z: GOAL_Z }), speed, a, true, liftFor(dist(b, { x: tx, z: GOAL_Z }), speed, ty));
      };
      // Une-deux (dans certains exercices) : si le joueur s'est bien démarqué — personne à moins de
      // 3 m, ligne de passe libre, et mieux placé que le porteur pour aller au but — le coéquipier
      // lui rend le palet. Sinon il garde le palet un moment pour lui laisser le temps de se démarquer.
      if (scn.giveGo && s.lastPassFromMe === a.num && !s.returned) {
        const meOpen = !actors.some((o) => !o.team && !o.goalie && dist(o, me) < 3);
        const better = dist(me, NET) < toNet + 2;
        if (a.hasT > 0.45 && meOpen && better && laneClear(blade(a), me, 1.3)) {
          const target = lead(blade(a), { ...blade(me), vx: me.vx, vz: me.vz }, 13);
          launch(a, angleTo(blade(a), target), 13, a, false);
          s.returned = true;
          emit('pass', { from: a.num, giveGo: true });
          return;
        }
        if (a.hasT < 2.5) {
          moveTo(a, { x: a.x * 0.8, z: Math.min(22, a.z + 1.5) }, 2.4, dt);
          a.face = angleTo(a, me);
          return;
        }
      }
      if (a.hasT > 0.3 && toNet < 12 && laneClear(a, NET, 1.1)) {
        shoot(21);
        emit('mateShot', { num: a.num });
        return;
      }
      if (a.hasT > 1.1) {
        const meOpen = !actors.some((o) => !o.team && !o.goalie && dist(o, me) < 2.2);
        if (meOpen && laneClear(blade(a), me, 1.2)) {
          const target = lead(blade(a), { ...blade(me), vx: me.vx, vz: me.vz }, 13);
          launch(a, angleTo(blade(a), target), 13, a, false);
          emit('pass', { from: a.num });
          return;
        }
        if (a.hasT > 2.2) {
          shoot(19);
          emit('mateShot', { num: a.num });
          return;
        }
      }
      moveTo(a, { x: a.x * 0.6, z: Math.min(22, a.z + 3) }, 3.6, dt);
      a.face = angleTo(a, NET);
      return;
    }
    if (!p.owner && Math.hypot(p.vx, p.vz) < 1.5 && dist(a, p) < dist(me, p) && dist(a, p) < 8) moveTo(a, p, MATE_SPEED, dt);
    else {
      let target = a.role === 'passer' ? a.start : a.to;
      // Une fois le palet entré dans la zone, l'ailier qui attendait à la ligne bleue rentre à son tour.
      if (a.role === 'support' && puckZ() >= BLUE && target.z > 5 && target.z < BLUE) target = { x: target.x, z: target.z + 6 };
      moveTo(a, target, MATE_SPEED, dt);
    }
    a.face = angleTo(a, p);
  }

  /** Gardien : se place sur la bissectrice, puis plonge vers la trajectoire d'un tir (après un temps de réaction). */
  function goalieAI(a, dt) {
    const p = s.puck;
    const netZ = a.team ? -GOAL_Z : GOAL_Z;
    const sign = Math.sign(netZ);
    const planeZ = netZ - sign * (GOAL_Z - GOALIE_Z);
    a.z = planeZ;
    let tx;
    // Notre gardien est un peu moins vif que le leur : en défense, c'est d'abord au joueur de travailler.
    const reaction = (level.goalieReaction ?? 0.2) + (a.team ? 0.12 : 0);
    const speed = level.goalie * (a.team ? 0.6 : 1);
    const reacting = p.shot && s.t - p.releaseT < reaction;
    if (reacting) tx = a.x;
    else if (!p.owner && p.vz * sign > 2 && (planeZ - p.z) * sign > 0) {
      const tt = (planeZ - p.z) / p.vz;
      tx = p.x + p.vx * tt;
    } else {
      const d = Math.hypot(p.x, netZ - p.z) || 1;
      tx = (p.x / d) * 0.8;
      // Selon son style, il colle plus ou moins le poteau proche (le côté éloigné s'ouvre).
      if (a.style && Math.abs(p.x) > 1) tx += Math.sign(p.x) * a.style.cheat * Math.min(1, Math.abs(p.x) / 5);
    }
    if (a.post && !reacting) tx = a.post * 0.75; // collé au poteau proche
    tx = clamp(tx, -0.8, 0.8);
    const step = clamp(tx - a.x, -speed * dt, speed * dt);
    a.x += step;
    a.vx = step / dt;
    a.face = angleTo(a, p);
    // Le palet est tout près : le gardien se met en papillon (tout le bas fermé, les coins hauts ouverts).
    // Posture : en papillon quand le palet est tout près ; elle ne change pas pendant un tir.
    // Nouvelle possession : le gardien se replace, avec un style tiré au hasard.
    if (p.owner && p.owner !== a.lastOwner) {
      a.lastOwner = p.owner;
      a.style = rollGoalieStyle(rand);
    }
    if (!(p.shot && !p.owner)) {
      const close = Math.hypot(p.x, netZ - p.z);
      a.butterfly = close < 8.5;
      // Palet sur le côté, tout près (angle fermé) : il colle le poteau proche.
      a.post = close < 6 && Math.abs(p.x) > 3 ? Math.sign(p.x) : 0;
      a.moving = Math.abs(a.vx) > 0.6;
    }
  }

  function oppAI(a, dt) {
    const p = s.puck;
    if (a.goalie) return goalieAI(a, dt);
    if (a.role === 'attacker') return attackerAI(a, dt);
    if (p.owner === a) return;
    // Le passeur de départ n'est pas attaqué : la situation commence quand le joueur reçoit le palet.
    // Il laisse un petit temps au joueur après la réception (plus long chez les petits).
    const settled = s.received && s.t - s.receiveT >= (level.pressDelay ?? 0);
    const carrier = settled && p.owner && p.owner.team && p.owner.role !== 'passer' ? p.owner : null;
    const loose = !p.owner && Math.hypot(p.vx, p.vz) < 3;
    let target;
    let speed = 3.4;
    if (a.role === 'presser') {
      speed = level.presser;
      if (carrier && dist(a, carrier) < 16) target = carrier;
      else if (loose && dist(a, p) < 12) target = p;
      else target = a.to;
      // Il se place juste devant le porteur plutôt que de le traverser.
      if (target === carrier) {
        const d = dist(a, carrier) || 1;
        target = { x: carrier.x + ((a.x - carrier.x) / d) * 0.7, z: carrier.z + ((a.z - carrier.z) / d) * 0.7 };
      }
    } else if (a.role === 'cover') {
      const tm = actors.find((m) => m.team && m.num === a.cover);
      if (tm) {
        const d = dist(tm, NET) || 1;
        target = { x: tm.x + ((NET.x - tm.x) / d) * 1.3, z: tm.z + ((NET.z - tm.z) / d) * 1.3 };
      } else target = a.to;
    } else {
      // Défense de zone : garde sa place, glisse un peu vers le palet et va chercher un palet libre proche.
      if (loose && dist(a, p) < 4) target = p;
      else target = { x: a.to.x + (p.x - a.to.x) * 0.25, z: a.to.z };
      speed = 3;
    }
    moveTo(a, target, speed, dt);
    a.face = angleTo(a, p);
  }


  // ---------- attaquants adverses (mode défense) ----------
  const defenders = () => [me, ...actors.filter((t) => t.team && !t.goalie)];

  function keyMoment() {
    if (s.keyMoment) return;
    s.keyMoment = { t: s.t, me: { x: me.x, z: me.z }, ideal: s.dutyNow ? s.dutyNow.ideal : null };
  }

  function attackerAI(a, dt) {
    const p = s.puck;
    if (p.owner === a) {
      a.hasT += dt;
      const toNet = dist(a, OWN_NET);
      const shoot = (speed, forced = false) => {
        const zs = ourGoalie ? zoneStatus(ourGoalie, a, 0, [me, ...actors.filter((o) => o.team && !o.goalie)]).filter((z) => z.open) : [];
        const z = zs.length && rand() < 0.5 ? zs[Math.floor(rand() * zs.length)] : { x: (rand() - 0.5) * 1.6, y: 0.1 + rand() * 0.9 };
        const b = blade(a);
        // Plus le tir est lointain, moins il est précis.
        // Tir forcé (aucune solution de passe) : beaucoup moins précis.
        // Sous la pression d'un défenseur (à moins de 2,5 m), le tir est aussi moins précis.
        const pressed = defenders().some((d) => dist(d, a) < 2.5);
        const err = 0.05 * dist(b, OWN_NET) * (forced ? 2.5 : 1) * (pressed ? 1.8 : 1);
        const tx = z.x + (rand() - 0.5) * 2 * err;
        const ty = clamp(z.y + (rand() - 0.5) * 2 * err * 0.6, 0.05, 1.4);
        launch(a, angleTo(b, { x: tx, z: -GOAL_Z }), speed, a, true, liftFor(dist(b, { x: tx, z: -GOAL_Z }), speed, ty));
      };
      if (a.hasT > 0.35 && toNet < 11 && laneClear(blade(a), OWN_NET, 1.1, false)) {
        keyMoment();
        shoot(19);
        emit('oppShot', { num: a.num });
        return;
      }
      // Pressé par le joueur (à moins de 3,5 m) ou collé par un coéquipier.
      const pressured = dist(me, a) < 3.5 || defenders().some((d) => dist(d, a) < 1.5);
      // Pressé, près du but, ou après ~2 s de possession : il cherche un coéquipier libre.
      if (a.hasT > level.passReact && (pressured || toNet < 9 || a.hasT > 2 + level.passReact)) {
        let best = null;
        for (const m of actors) {
          if (m.team || m === a || m.goalie) continue;
          const open = !defenders().some((d) => dist(d, m) < 2);
          if (open && laneClear(blade(a), m, 1.3, false)) {
            const sc = -dist(m, OWN_NET);
            if (!best || sc > best.sc) best = { m, sc };
          }
        }
        if (best) {
          keyMoment();
          const target = lead(blade(a), best.m, 15);
          launch(a, angleTo(blade(a), target), 15, a, false);
          emit('oppPass', { from: a.num, to: best.m.num });
          return;
        }
      }
      if (a.hasT > 7) {
        keyMoment();
        shoot(17, true);
        emit('oppShot', { num: a.num });
        return;
      }
      // Fonce vers l'enclave en contournant le défenseur qui se trouve devant.
      const target = { x: clamp(a.x * 0.6, -4, 4), z: -19 };
      const blocker = defenders().find((d) => dist(d, a) < 3.5 && dist(d, OWN_NET) < dist(a, OWN_NET));
      if (blocker) target.x = clamp(a.x + (a.x >= blocker.x ? 3 : -3), -11, 11);
      moveTo(a, target, level.attack, dt);
      a.face = angleTo(a, OWN_NET);
      return;
    }
    if (!p.owner && Math.hypot(p.vx, p.vz) < 3 && dist(a, p) < 5) moveTo(a, p, 3.6, dt);
    else moveTo(a, a.to, level.attack * 0.9, dt);
    a.face = angleTo(a, p);
  }

  /** Mission du joueur en défense : est-il bien placé, et où aurait-il dû être ? */
  function dutyState() {
    const p = s.puck;
    const c = p.owner && !p.owner.team && !p.owner.goalie ? p.owner : null;
    if (!c) return null;
    const [kind, numStr] = String(scn.duty).split(':');
    const num = Number(numStr);
    if (kind === 'goalside') {
      const d = dist(c, OWN_NET) || 1;
      const ideal = { x: c.x + ((OWN_NET.x - c.x) / d) * 2, z: c.z + ((OWN_NET.z - c.z) / d) * 2 };
      const ok = dist(me, OWN_NET) < dist(c, OWN_NET) - 0.3 && segDist(me, c, OWN_NET).d < 1.8;
      return { ok, ideal };
    }
    const target = actors.find((o) => !o.team && o.num === num);
    if (!target) return null;
    if (kind === 'lane') {
      if (target === c) return null;
      const from = blade(c);
      const ideal = { x: from.x + (target.x - from.x) * 0.55, z: from.z + (target.z - from.z) * 0.55 };
      const r = segDist(me, from, target);
      // Sur la ligne de passe, ou collé au receveur du côté du but : dans les deux cas la passe est coupée.
      const onLane = r.d < 2 && r.t > 0.08 && r.t < 0.92;
      const onReceiver = dist(me, target) < 2.5 && dist(me, OWN_NET) < dist(target, OWN_NET);
      return { ok: onLane || onReceiver, ideal };
    }
    // mark
    const d = dist(target, OWN_NET) || 1;
    const ideal = { x: target.x + ((OWN_NET.x - target.x) / d) * 1.2, z: target.z + ((OWN_NET.z - target.z) / d) * 1.2 };
    return { ok: dist(me, target) < 2.5 && dist(me, OWN_NET) < dist(target, OWN_NET), ideal };
  }

  // ---------- palet ----------
  function stepPuck(dt) {
    const p = s.puck;
    if (p.owner) {
      const b = blade(p.owner);
      p.x = b.x;
      p.z = b.z;
      p.y = 0.02;
      return;
    }
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 0) {
      const ns = Math.max(0, sp - PUCK_FRICTION * dt);
      p.vx *= ns / sp;
      p.vz *= ns / sp;
    }
    const px = p.x;
    const pz = p.z;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    // Palet levé : il monte puis retombe (gravité).
    if (p.vy || p.y > 0.03) {
      p.vy -= GRAVITY * dt;
      p.y += p.vy * dt;
      if (p.y <= 0.02) {
        p.y = 0.02;
        p.vy = 0;
      }
    }

    if (!s.over) {
      for (const net of [
        { z: GOAL_Z, sign: 1, keeper: goalie, save: 'save', goal: 'goal', wide: 'wide' },
        { z: -GOAL_Z, sign: -1, keeper: ourGoalie, save: 'saveUs', goal: 'goalAgainst', wide: 'wideAgainst' },
      ]) {
        const plane = net.z - net.sign * (GOAL_Z - GOALIE_Z);
        const crossed = (z0, z1, zz) => (z0 - zz) * net.sign < 0 && (z1 - zz) * net.sign >= 0;
        if (net.keeper && crossed(pz, p.z, plane)) {
          const k = (plane - pz) / (p.z - pz);
          const x = px + (p.x - px) * k;
          if (goalieCovers(net.keeper, x, p.y, net.keeper.team ? 1 : (level.goalieSize ?? 1))) {
            p.x = x;
            p.z = plane - net.sign * 0.3;
            gain(net.keeper);
            end(net.save);
            return;
          }
        }
        if (crossed(pz, p.z, net.z)) {
          const k = (net.z - pz) / (p.z - pz);
          const x = px + (p.x - px) * k;
          if (Math.abs(x) < POST && p.y < NET_H) {
            p.x = x;
            p.z = net.z + net.sign * 0.5;
            p.vx = 0;
            p.vz = 0;
            end(net.goal, { scorer: p.releasedBy });
            return;
          }
          if (p.shot) end(net.wide);
        }
      }
    }
    // Bandes
    if (Math.abs(p.x) > 12.9) {
      p.x = Math.sign(p.x) * 12.9;
      p.vx *= -0.6;
    }
    if (Math.abs(p.z) > 29.9) {
      p.z = Math.sign(p.z) * 29.9;
      p.vz *= -0.6;
    }
    // Coins arrondis : le palet rebondit le long de la bande
    const hit = inRink(p, 0.1);
    if (hit) {
      const vn = p.vx * hit.nx + p.vz * hit.nz;
      if (vn > 0) {
        p.vx -= 1.6 * vn * hit.nx;
        p.vz -= 1.6 * vn * hit.nz;
      }
    }
    if (s.over) return;

    // Qui récupère le palet ?
    const since = s.t - p.releaseT;
    const sp2 = Math.hypot(p.vx, p.vz);
    const lifted = p.y > 0.3; // palet levé : il passe au-dessus des crosses
    const meReach = lifted ? 0 : defense && !p.team ? (since < 0.15 ? 0 : sp2 > 12 ? 0.75 : 1.1) : 1.1;
    if (!(p.releasedBy === me && since < 0.35) && dist(blade(me), p) < meReach && sp2 < 27) {
      const how = !p.team && p.shot ? 'block' : !p.team && sp2 > 0.5 ? 'intercept' : 'loose';
      gain(me);
      if (defense) end('recovered', { how });
      return;
    }
    for (const a of actors) {
      if (a.goalie || (a === p.releasedBy && since < 0.35)) continue;
      // La première passe (du passeur vers le joueur) est pour lui seul.
      if (p.releasedBy && p.releasedBy.role === 'passer' && !s.received) continue;
      const b = blade(a);
      if (lifted && !(a.team && p.y < 0.7)) continue;
      if (defense) {
        if (dist(b, p) < 0.95 || dist(a, p) < 0.95) {
          if (a.team) {
            if (sp2 < 4) {
              gain(a);
              end('recovered', { how: 'mate', num: a.num });
              return;
            }
            continue;
          }
          if (since > 0.12 && sp2 < 24) {
            gain(a);
            return;
          }
        }
        continue;
      }
      if (a.team) {
        if (dist(b, p) < 1.3 || dist(a, p) < 1.0) {
          if (sp2 > 24) {
            s.tooHard = true;
            continue;
          }
          gain(a);
          return;
        }
      } else {
        // Juste après la passe, le palet est encore sur la palette : pas d'interception immédiate.
        if (since < 0.12) continue;
        const r = sp2 > 20 ? 0.6 : 0.95;
        if (dist(b, p) < r || dist(a, p) < r) {
          const type = !p.team ? 'lost' : p.shot ? 'blocked' : sp2 > 0.5 ? 'intercept' : 'lost';
          gain(a);
          end(type);
          return;
        }
      }
    }
  }

  function stepSteal(dt) {
    const p = s.puck;
    if (defense) {
      // Mise en échec avec la crosse : palette sur le palet (ou contact) pendant un court instant.
      const c = p.owner;
      if (c && !c.team && !c.goalie && (dist(blade(me), p) < 0.85 || dist(me, c) < 0.9)) {
        s.pokeT += dt;
        // Par derrière, impossible : il faut d'abord se replacer entre l'attaquant et le but.
        const behind = dist(me, OWN_NET) > dist(c, OWN_NET) + 0.5;
        if (!behind && s.pokeT >= level.poke) {
          gain(me);
          end('recovered', { how: 'poke' });
        }
      } else s.pokeT = Math.max(0, s.pokeT - dt);
      return;
    }
    if (!p.owner || !p.owner.team || p.owner.role === 'passer') {
      s.stealT = 0;
      return;
    }
    const c = p.owner;
    const thief = actors.find((o) => !o.team && !o.goalie && dist(o, c) < 1.0);
    if (thief) {
      s.stealT += dt;
      if (s.stealT >= level.steal) {
        gain(thief);
        end(c.isMe ? 'stolen' : 'mateStolen', { num: c.num });
      }
    } else s.stealT = Math.max(0, s.stealT - dt);
  }

  // ---------- API ----------
  function step(dt, input = {}) {
    if (s.over) {
      s.overT += dt;
      stepPuck(dt);
      return;
    }
    s.t += dt;
    stepMe(dt, input);
    for (const a of actors) (a.team ? mateAI : oppAI)(a, dt);
    // Les joueurs patinent dans le sens de leur déplacement (et non de côté en regardant le palet) :
    // en avant, ou à reculons si leur cible est derrière eux (défenseur qui recule face au jeu).
    for (const a of actors) {
      if (a.goalie || s.puck.owner === a) continue;
      const sp = Math.hypot(a.vx, a.vz);
      if (sp < 0.8) continue;
      const va = Math.atan2(a.vx, a.vz);
      const want = Math.abs(wrap(va - a.face)) < 2.1 ? va : wrap(va + Math.PI);
      a.face = want;
    }
    const prevPuckZ = puckZ();
    stepPuck(dt);
    if (!s.over) checkOffside(prevPuckZ);
    stepSteal(dt);
    if (defense && !s.over) {
      const st = dutyState();
      if (st) {
        s.dutyNow = st;
        if (s.t > 1.2) {
          s.dutyT += dt;
          if (st.ok) s.dutyOkT += dt;
        }
      }
    }
    if (!s.over && s.t >= level.time) end('time');
    s.trailT += dt;
    if (s.trailT >= 0.1) {
      s.trailT = 0;
      s.trailMe.push({ x: me.x, z: me.z });
      s.trailPuck.push({ x: s.puck.x, z: s.puck.z });
    }
  }

  /**
   * Le joueur lâche le palet (passe ou tir) dans la direction `aim`, avec une force de 0 à 1.
   * Renvoie l'analyse de la décision, ou null si le joueur n'a pas le palet.
   */
  /**
   * @param opts.zone   identifiant d'une cible de tir (HG, HD, BG, BD, J) : tir dans cette zone
   * @param opts.lifted passe levée (au-dessus des crosses)
   */
  /** Le swipe dans cette direction est-il un tir (vers le but) ? */
  function wouldShoot(aim) {
    if (s.over || s.puck.owner !== me || !goalie) return false;
    const from = blade(me);
    if (from.z >= GOAL_Z) return false;
    // Écart d'angle entre le swipe et le but : la largeur du but vue d'ici + une petite marge.
    const d = dist(from, NET);
    const diffNet = Math.abs(wrap(angleTo(from, NET) - aim));
    if (diffNet > Math.atan2(POST, d) + 0.1 + level.assist * 0.4) return false;
    // Un coéquipier plus proche de la direction du swipe que le but : c'est une passe.
    return !actors.some((a) => a.team && !a.goalie && Math.abs(wrap(angleTo(from, a) - aim)) < diffNet);
  }

  /** Écart (rad) entre la direction du tir et l'axe de la crosse / du corps. */
  function stickOffset(aim) {
    return Math.abs(wrap(aim - me.yaw));
  }

  function release(aim, power, opts = {}) {
    if (s.over || s.puck.owner !== me) return null;
    const from = blade(me);
    const assist = level.assist;
    let isShot = false;
    let target = null;
    let zone = null;
    let shotPoint = null;

    if (opts.zone && goalie) {
      zone = zoneStatus(goalie, from, 0, actors.filter((a) => !a.team && !a.goalie), level.goalieSize ?? 1).find((z) => z.id === opts.zone);
    } else {
      // Vers le but ? Petite assistance : on ramène le tir vers la cible ouverte la plus proche.
      const f = fwd(aim);
      if (f.z > 0.05 && from.z < GOAL_Z) {
        const xCross = from.x + (f.x / f.z) * (GOAL_Z - from.z);
        const tol = POST + Math.tan(assist) * (GOAL_Z - from.z);
        const diffNet = Math.abs(wrap(angleTo(from, NET) - aim));
        const mateCloser = actors.some((a) => a.team && !a.goalie && Math.abs(wrap(angleTo(from, a) - aim)) < diffNet);
        if (Math.abs(xCross) < tol && !mateCloser) {
          isShot = true;
          const snap = 0.35 + assist * 2; // rayon de l'aide : grand en U9, petit en U13
          const open = goalie ? zoneStatus(goalie, from, 0, actors.filter((a) => !a.team && !a.goalie), level.goalieSize ?? 1).filter((z) => z.open) : [];
          const near = open.sort((a, b) => Math.abs(a.x - xCross) - Math.abs(b.x - xCross))[0];
          if (near && Math.abs(near.x - xCross) < snap) zone = near;
          else shotPoint = { x: clamp(xCross, -0.75, 0.75), y: 0.15 };
        }
      }
    }
    let offAxis = 0;
    if (zone) {
      isShot = true;
      // Petite imprécision, plus grande quand on tire très fort.
      let err = 0.05 + 0.07 * clamp(power, 0, 1);
      // U13 : le tir part de la palette, dans l'axe de la crosse. Si le corps n'est pas tourné
      // vers la cible (on la regarde seulement), le tir est beaucoup moins précis.
      if (level.stickAngle) {
        offAxis = stickOffset(angleTo(from, { x: zone.x, z: GOAL_Z }));
        if (offAxis > 0.5) err += 0.5 * (offAxis - 0.5);
      }
      shotPoint = { x: zone.x + (rand() - 0.5) * 2 * err, y: clamp(zone.y + (rand() - 0.5) * 2 * err, 0.05, 1.15) };
    }
    if (shotPoint) aim = angleTo(from, { x: shotPoint.x, z: GOAL_Z });
    // Sinon, vers le coéquipier le plus proche de la direction choisie.
    if (!isShot) {
      let best = null;
      for (const a of actors) {
        if (!a.team) continue;
        const diff = Math.abs(wrap(angleTo(from, a) - aim));
        if (diff < 0.6 && (!best || diff < best.diff)) best = { a, diff };
      }
      if (best) {
        target = best.a;
        const speedGuess = 8 + clamp(power, 0, 1) * 22;
        // Aide à la passe : on corrige la visée vers le coéquipier (en anticipant sa course)
        // si le swipe est assez proche de lui : ≈ 34° en U9, 22° en U11, 14° en U13.
        if (best.diff < assist * 2 + 0.12) aim = angleTo(from, lead(from, best.a, speedGuess));
      }
    }

    // Coup droit ou revers ?
    const rel = wrap(aim - me.yaw);
    // Droitier : palette à droite, coup droit tourné vers la gauche. Une passe vers la DROITE
    // (rel < 0, car rel > 0 = vers la gauche) se fait en revers. Gaucher : l'inverse.
    const backhand = hand === 'R' ? rel < -0.35 : rel > 0.35;
    let speed = 8 + clamp(power, 0, 1) * 22;
    // Aide à la passe : pas trop fort pour que le coéquipier puisse contrôler (selon la distance).
    if (!isShot && target) speed = Math.min(speed, 9 + 0.7 * dist(from, target));
    if (backhand) {
      speed *= 0.7;
      aim += (rand() - 0.5) * 0.14;
    }
    let vy = 0;
    const lifted = !isShot && !!opts.lifted;
    if (isShot && shotPoint) vy = liftFor(dist(from, { x: shotPoint.x, z: GOAL_Z }), speed, shotPoint.y);
    else if (lifted) {
      speed *= 0.85;
      vy = 3; // passe levée : le palet monte d'environ 45 cm puis retombe
    }

    // Analyse de la décision au moment où elle est prise.
    const snapshot = {
      me: { x: me.x, z: me.z },
      teammates: actors.filter((a) => a.team).map((a) => ({ num: a.num, x: a.x, z: a.z })),
      opponents: actors.filter((a) => !a.team).map((a) => ({ x: a.x, z: a.z, goalie: a.goalie })),
    };
    const ev = evaluate(snapshot);
    let chosen;
    if (isShot) chosen = ev.options.find((o) => o.type === 'shoot');
    else if (target) chosen = ev.options.find((o) => o.key === `pass:${target.num}`);
    else chosen = { type: 'nowhere', key: 'nowhere', score: 0, reason: 'nowhere' };
    const info = {
      t: s.t,
      from,
      aim,
      speed,
      power,
      backhand,
      isShot,
      targetNum: target ? target.num : null,
      ev,
      chosen,
      grade: gradeDecision(chosen, ev.best),
      snapshot,
      zone: zone ? zone.id : null,
      zoneLabel: zone ? zone.label : null,
      zoneOpen: zone ? zone.open : null,
      offAxis,
      offAxisBad: !!level.stickAngle && offAxis > 0.5,
      goalieButterfly: goalie ? !!goalie.butterfly : false,
      goaliePost: goalie ? !!goalie.post : false,
      lifted,
    };
    s.releases.push(info);
    if (!isShot && target) s.lastPassFromMe = target.num;
    launch(me, aim, speed, me, isShot, vy);
    emit(isShot ? 'shot' : 'pass', { backhand, lifted });
    return info;
  }

  /** Tutoriel : place le joueur et lui donne le palet. */
  function resetMe(x, z, yaw) {
    me.x = x;
    me.z = z;
    me.yaw = yaw;
    me.speed = 0;
    me.head = 0;
    s.over = null;
    s.overT = 0;
    gain(me);
  }

  return { state: s, step, release, blade, wouldShoot, stickOffset, resetMe, zones: () => (goalie ? zoneStatus(goalie, blade(me), 0, actors.filter((a) => !a.team && !a.goalie), level.goalieSize ?? 1) : []) };
}
