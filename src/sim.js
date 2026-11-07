// Simulation en temps réel d'une situation de jeu : patinage, palet, gardien, coéquipiers et adversaires.
// Aucun rendu ici : le module est testable avec Node (voir tests/sim.test.mjs).
//
// Repère : x = largeur (-13..13), z = longueur (-30..30), le but adverse est en z = +26.
// Orientation (yaw) : la direction avant est (sin yaw, cos yaw) ; augmenter yaw tourne vers la gauche.

import { evaluate, gradeDecision, NET } from './evaluate.js';

const GOAL_Z = 26;
const POST = 0.915;
const GOALIE_Z = 25.2;
const GOALIE_HALF = 0.45;
const LIMIT_X = 12.4;
const LIMIT_Z = 29.4;
const PUCK_FRICTION = 1.0;
const ME_MAX = 6.5;
const ME_MAX_PUCK = 5.6;
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
  const me = {
    id: 'me',
    isMe: true,
    team: true,
    x: scn.me.x,
    z: scn.me.z,
    yaw: angleTo(scn.me, NET),
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
      ...extra,
    };
    a.face = angleTo(a, me);
    actors.push(a);
    return a;
  };
  const passer = mk(scn.passer, { team: true, role: 'passer' });
  for (const t of scn.teammates) mk(t, { team: true, role: 'support' });
  for (const o of scn.opponents) {
    const role = o.goalie ? 'goalie' : o.presser ? 'presser' : o.cover != null ? 'cover' : 'zone';
    const a = mk(o, { team: false, goalie: !!o.goalie, role, cover: o.cover });
    if (a.goalie) a.face = Math.PI;
  }
  const goalie = actors.find((a) => a.goalie);

  const s = {
    t: 0,
    scn,
    level,
    hand,
    me,
    actors,
    passer,
    goalie,
    puck: { x: 0, z: 0, y: 0.02, vx: 0, vz: 0, owner: passer, releasedBy: null, releaseT: -9, shot: false, team: true },
    over: null,
    overT: 0,
    passDone: false,
    received: false,
    releases: [],
    stealT: 0,
    tooHard: false,
    lastPassFromMe: null,
    trailMe: [],
    trailPuck: [],
    trailT: 0,
    events: [],
  };

  // ---------- positions de la palette ----------
  function blade(p) {
    const yaw = p.isMe ? p.yaw : p.face;
    const f = fwd(yaw);
    const side = p.isMe ? (hand === 'R' ? 1 : -1) : 1;
    const r = rightOf(yaw);
    return { x: p.x + f.x * 0.85 + r.x * 0.32 * side, z: p.z + f.z * 0.85 + r.z * 0.32 * side };
  }

  function emit(type, data = {}) {
    s.events.push({ type, t: s.t, ...data });
  }

  function end(type, extra = {}) {
    if (s.over) return;
    s.over = { type, t: s.t, x: s.puck.x, z: s.puck.z, ...extra };
    emit('over', { over: s.over });
  }

  function launch(from, aim, speed, by, shot) {
    const p = s.puck;
    const b = blade(from);
    const f = fwd(aim);
    p.owner = null;
    p.x = b.x;
    p.z = b.z;
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

  function laneClear(from, to, width) {
    return !actors.some((o) => {
      if (o.team || o.goalie) return false;
      const { d, t } = segDist(o, from, to);
      return t > 0.08 && t < 0.92 && d < width;
    });
  }

  // ---------- déplacements ----------
  function moveTo(a, target, speed, dt) {
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

  function confine(a) {
    a.x = clamp(a.x, -LIMIT_X, LIMIT_X);
    a.z = clamp(a.z, -LIMIT_Z, LIMIT_Z);
    // On ne traverse pas la cage
    if (a.z > 25.6 && a.z < 27.3 && Math.abs(a.x) < 1.3) a.x = a.x < 0 ? -1.3 : 1.3;
  }

  function stepMe(dt, input) {
    const holding = s.puck.owner === me;
    const max = holding ? ME_MAX_PUCK : ME_MAX;
    if (input.skate) me.speed = Math.min(max, me.speed + 7 * dt);
    else me.speed = Math.max(0, me.speed - 2.4 * dt);
    if (input.skate || me.speed > 0.4) me.yaw = wrap(me.yaw - clamp(input.turn || 0, -1, 1) * 2.4 * dt);
    const headTarget = clamp(input.head || 0, -1, 1) * 2.3;
    me.head += (headTarget - me.head) * Math.min(1, dt * 10);
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
      const shootAim = () => {
        const gx = goalie ? goalie.x : 0;
        const tx = gx > 0 ? -0.7 : 0.7;
        return angleTo(blade(a), { x: tx, z: GOAL_Z });
      };
      if (a.hasT > 0.3 && toNet < 12 && laneClear(a, NET, 1.1)) {
        launch(a, shootAim(), 21, a, true);
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
          launch(a, shootAim(), 19, a, true);
          emit('mateShot', { num: a.num });
          return;
        }
      }
      moveTo(a, { x: a.x * 0.6, z: Math.min(22, a.z + 3) }, 3.6, dt);
      a.face = angleTo(a, NET);
      return;
    }
    if (!p.owner && Math.hypot(p.vx, p.vz) < 1.5 && dist(a, p) < dist(me, p) && dist(a, p) < 8) moveTo(a, p, MATE_SPEED, dt);
    else moveTo(a, a.role === 'passer' ? a.start : a.to, MATE_SPEED, dt);
    a.face = angleTo(a, p);
  }

  function oppAI(a, dt) {
    const p = s.puck;
    if (a.goalie) {
      let tx;
      // Le gardien a un petit temps de réaction après un tir.
      const reacting = p.shot && s.t - p.releaseT < (level.goalieReaction ?? 0.2);
      if (reacting) tx = a.x;
      else if (!p.owner && p.vz > 2 && p.z < GOALIE_Z) {
        const tt = (GOALIE_Z - p.z) / p.vz;
        tx = p.x + p.vx * tt;
      } else {
        const d = Math.hypot(p.x, GOAL_Z - p.z) || 1;
        tx = (p.x / d) * 0.8;
      }
      tx = clamp(tx, -0.8, 0.8);
      const step = clamp(tx - a.x, -level.goalie * dt, level.goalie * dt);
      a.x += step;
      a.vx = step / dt;
      a.face = angleTo(a, p);
      return;
    }
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
    p.y = p.shot && sp > 8 ? 0.25 : 0.02;

    if (!s.over) {
      // Le gardien : on regarde où le palet traverse sa ligne.
      if (goalie && pz < GOALIE_Z && p.z >= GOALIE_Z) {
        const k = (GOALIE_Z - pz) / (p.z - pz);
        const x = px + (p.x - px) * k;
        if (Math.abs(x - goalie.x) < GOALIE_HALF) {
          p.x = x;
          p.z = GOALIE_Z - 0.3;
          gain(goalie);
          end('save');
          return;
        }
      }
      if (pz < GOAL_Z && p.z >= GOAL_Z) {
        const k = (GOAL_Z - pz) / (p.z - pz);
        const x = px + (p.x - px) * k;
        if (Math.abs(x) < POST) {
          p.x = x;
          p.z = GOAL_Z + 0.5;
          p.vx = 0;
          p.vz = 0;
          end('goal', { scorer: p.releasedBy });
          return;
        }
        if (p.shot) end('wide');
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
    if (s.over) return;

    // Qui récupère le palet ?
    const since = s.t - p.releaseT;
    const sp2 = Math.hypot(p.vx, p.vz);
    if (!(p.releasedBy === me && since < 0.35) && dist(blade(me), p) < 1.1 && sp2 < 27) {
      gain(me);
      return;
    }
    for (const a of actors) {
      if (a.goalie || (a === p.releasedBy && since < 0.35)) continue;
      // La première passe (du passeur vers le joueur) est pour lui seul.
      if (p.releasedBy && p.releasedBy.role === 'passer' && !s.received) continue;
      const b = blade(a);
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
    stepPuck(dt);
    stepSteal(dt);
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
  function release(aim, power) {
    if (s.over || s.puck.owner !== me) return null;
    const from = blade(me);
    const assist = level.assist;
    let isShot = false;
    let target = null;

    // Vers le but ? On garde la visée de l'enfant, en la ramenant entre les poteaux si elle est proche.
    const f = fwd(aim);
    if (f.z > 0.05 && from.z < GOAL_Z) {
      const xCross = from.x + (f.x / f.z) * (GOAL_Z - from.z);
      const tol = POST + Math.tan(assist) * (GOAL_Z - from.z);
      if (Math.abs(xCross) < tol) {
        isShot = true;
        aim = angleTo(from, { x: clamp(xCross, -0.75, 0.75), z: GOAL_Z });
      }
    }
    // Sinon, vers le coéquipier le plus proche de la direction choisie.
    if (!isShot) {
      let best = null;
      for (const a of actors) {
        if (!a.team) continue;
        const diff = Math.abs(wrap(angleTo(from, a) - aim));
        if (diff < 0.4 && (!best || diff < best.diff)) best = { a, diff };
      }
      if (best) {
        target = best.a;
        const speedGuess = 8 + clamp(power, 0, 1) * 22;
        if (best.diff < assist + 0.03) aim = angleTo(from, lead(from, best.a, speedGuess));
      }
    }

    // Coup droit ou revers ?
    const rel = wrap(aim - me.yaw);
    const backhand = hand === 'R' ? rel > 0.35 : rel < -0.35;
    let speed = 8 + clamp(power, 0, 1) * 22;
    if (backhand) {
      speed *= 0.7;
      aim += (rand() - 0.5) * 0.14;
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
    };
    s.releases.push(info);
    if (!isShot && target) s.lastPassFromMe = target.num;
    launch(me, aim, speed, me, isShot);
    emit(isShot ? 'shot' : 'pass', { backhand });
    return info;
  }

  return { state: s, step, release, blade };
}
