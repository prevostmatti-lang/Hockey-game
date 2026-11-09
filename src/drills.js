// Exercices cognitifs courts du programme (voir docs/PROGRAMME.md) :
//   - Lis le jeu       : l'action se fige, on décide selon son rôle (soutien, duel, marquage) — « HEADspeed »
//   - Arrêt sur image  : l'action se fige, il faut décider vite ; parfois un adversaire coupe la ligne au
//                        dernier moment et il faut GARDER le palet (inhibition : retenir la passe prévue)
//   - Mémoire de glace : regarder la scène 1 à 3 s, puis répondre de mémoire (mémoire de travail)
//
// Chaque exercice dure un temps fixe et renvoie ses statistiques à la fin.
import { evaluate, explain, describeOption, finalPos, NET } from './evaluate.js';
import { makeVariant } from './generator.js';
import { angleTo, wrap } from './sim.js';

const $ = (s) => document.querySelector(s);
const EYE = 1.38;

/** Interface commune : bandeau, chrono, consigne, retour, boutons. */
function ui(name) {
  $('#drill').hidden = false;
  $('#drill-name').textContent = name;
  $('#drill-buttons').innerHTML = '';
  $('#drill-feedback').textContent = '';
  $('#drill-cover').hidden = true;
  return {
    prompt: (t) => ($('#drill-prompt').textContent = t),
    score: (t) => ($('#drill-score').textContent = t),
    timer: (k) => ($('#drill-timer-fill').style.transform = `scaleX(${Math.max(0, Math.min(1, k))})`),
    rep: (k) => ($('#drill-rep-fill').style.transform = `scaleX(${Math.max(0, Math.min(1, k))})`),
    feedback(t, ok) {
      const f = $('#drill-feedback');
      f.textContent = t;
      f.dataset.ok = ok ? '1' : '0';
    },
    buttons(list) {
      const box = $('#drill-buttons');
      box.innerHTML = '';
      for (const b of list) {
        const el = document.createElement('button');
        el.className = 'btn drill-btn';
        el.textContent = b.label;
        el.addEventListener('click', b.onClick);
        box.appendChild(el);
      }
    },
    cover: (on, text = '') => {
      $('#drill-cover').hidden = !on;
      $('#drill-cover').textContent = text;
    },
  };
}

/** Glisser pour tourner la tête (360°) et toucher pour choisir. */
function lookAndTap(canvas, world, state, onTap) {
  let p = null;
  const down = (e) => {
    p = { x: e.clientX, y: e.clientY, t: performance.now(), look: state.look, moved: 0 };
  };
  const move = (e) => {
    if (!p) return;
    const dx = e.clientX - p.x;
    p.moved = Math.max(p.moved, Math.abs(dx), Math.abs(e.clientY - p.y));
    if (state.canLook) state.look = p.look + (dx / canvas.clientWidth) * world.getHfov() * 1.3;
  };
  const up = (e) => {
    if (!p) return;
    const tap = p.moved < 14 && performance.now() - p.t < 450;
    p = null;
    if (tap) {
      const r = canvas.getBoundingClientRect();
      onTap(world.pick(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1));
    }
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
  };
}

const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// =====================================================================
// Lis le jeu (« HEADspeed », Fédération suisse) : l'action se joue 1,5 s puis se fige.
// On lit le jeu selon son rôle et on décide :
//   - SOUTIEN  : un coéquipier a le palet → où te proposer ? (A, B ou C sur la glace)
//   - DUEL     : ton adversaire direct a le palet → où te placer ?
//   - MARQUAGE : l'adversaire a le palet → quel joueur dois-tu surveiller ?
// Chaque réponse est expliquée (ligne de passe, espace libre, côté du but, joueur oublié).
// =====================================================================
const OWN_NET = { x: 0, z: -26 };
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function segD(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

function buildSoutien(rand, pool) {
  // Le coéquipier qui a le palet est à la place du joueur de la situation ; on cherche 3 places :
  // une bonne (ligne de passe libre, espace, vers le but), une avec la ligne coupée, une collée à un adversaire.
  for (let tries = 0; tries < 40; tries++) {
    const scn = makeVariant(pick(pool, rand), rand);
    const carrier = scn.me;
    const opps = scn.opponents.filter((o) => !o.goalie).map(finalPos);
    const cands = [];
    for (let k = 0; k < 160; k++) {
      const a = (rand() - 0.5) * Math.PI * 1.4;
      const r = 5 + rand() * 8;
      const p = { x: carrier.x + Math.sin(a) * r, z: carrier.z + Math.cos(a) * r };
      if (Math.abs(p.x) > 11 || p.z > 23 || p.z < -20) continue;
      const lane = Math.min(...opps.map((o) => segD(o, carrier, p)));
      const space = Math.min(...opps.map((o) => d2(o, p)));
      cands.push({ ...p, lane, space });
    }
    const good = cands.filter((c) => c.lane > 2 && c.space > 3.5).sort((a, b) => b.z - a.z)[0];
    const cut = cands.filter((c) => c.lane < 0.9 && c.space > 1.8).sort((a, b) => b.z - a.z)[0];
    const covered = cands.filter((c) => c.space < 1.6 && c.lane > 1.2)[0];
    if (!good || !cut || !covered) continue;
    if (d2(good, cut) < 3 || d2(good, covered) < 3 || d2(cut, covered) < 3) continue;
    return {
      scn,
      role: 'soutien',
      prompt: 'Ton coéquipier a le palet : où te proposes-tu ?',
      options: shuffle(
        [
          { ...good, ok: true, why: 'ligne de passe libre et de l’espace autour de toi.' },
          { ...cut, ok: false, why: 'un adversaire coupe la ligne de passe.' },
          { ...covered, ok: false, why: 'un adversaire est collé à toi.' },
        ],
        rand,
      ),
      carrier,
      cam: { at: carrier, toward: { x: carrier.x, z: carrier.z + 10 } },
    };
  }
  return null;
}

function buildDuel(rand) {
  // 1 contre 1 : l'attaquant arrive avec le palet. Bonne place = entre lui et le but.
  const cx = (rand() - 0.5) * 12;
  const cz = -4 - rand() * 8;
  const c = { x: cx, z: cz };
  const d = d2(c, OWN_NET) || 1;
  const ux = (OWN_NET.x - c.x) / d;
  const uz = (OWN_NET.z - c.z) / d;
  const side = rand() < 0.5 ? -1 : 1;
  const scn = {
    mode: 'defense',
    me: { x: c.x + ux * 7, z: c.z + uz * 7 },
    teammates: [{ goalie: true, x: 0, z: -25.2 }],
    opponents: [{ num: pick([9, 17, 22, 88], rand), x: c.x - ux * 2, z: c.z - uz * 2, to: c }],
  };
  return {
    scn,
    role: 'duel',
    prompt: 'Le n°' + scn.opponents[0].num + ' arrive avec le palet : où te places-tu ?',
    options: shuffle(
      [
        { x: c.x + ux * 3, z: c.z + uz * 3, ok: true, why: 'entre l’attaquant et ton but : il doit te passer pour tirer.' },
        { x: c.x - uz * 3.2 * side, z: c.z + ux * 3.2 * side, ok: false, why: 'sur le côté : tu lui ouvres la route du but.' },
        { x: c.x - ux * 2.5 + side * 1.5, z: c.z - uz * 2.5, ok: false, why: 'derrière lui : impossible de reprendre le palet.' },
      ],
      rand,
    ),
    cam: { at: { x: c.x + ux * 9, z: c.z + uz * 9 }, toward: c },
  };
}

function buildMarquage(rand, pool) {
  const scn = makeVariant(pick(pool, rand), rand);
  const target = Number(String(scn.duty).split(':')[1]);
  const opps = scn.opponents.filter((o) => !o.goalie && o.num != null);
  return {
    scn,
    role: 'marquage',
    prompt: 'L’adversaire a le palet : quel joueur dois-tu surveiller ? Touche-le.',
    answerNum: target,
    opps,
    cam: { at: { x: scn.me.x * 0.6, z: Math.max(-24, scn.me.z - 7) }, toward: { x: 0, z: scn.me.z + 6 } },
  };
}

function lisLeJeu(ctx) {
  const { world, canvas, seg, rand, sfx, pool, defPool } = ctx;
  const U = ui('🧠 Lis le jeu');
  const st = { look: 0, canLook: false };
  const stats = { reps: 0, hits: 0, times: [], roles: {} };
  const roles = seg.roles || ['soutien', 'duel', 'marquage'];
  const markPool = defPool.filter((x) => String(x.duty).startsWith('mark'));
  let t = 0;
  let trial = null;
  let pause = 0;
  let roleIdx = Math.floor(rand() * roles.length);
  const ANIM = 1.5;

  function newTrial() {
    let tr = null;
    for (let k = 0; k < roles.length && !tr; k++) {
      const role = roles[roleIdx++ % roles.length];
      if (role === 'soutien') tr = buildSoutien(rand, pool);
      else if (role === 'duel') tr = buildDuel(rand);
      else if (markPool.length) tr = buildMarquage(rand, markPool);
    }
    world.clearActors();
    const actors = [];
    const add = (p, team) => {
      const a = world.addActor({ team, num: p.num, goalie: p.goalie, pickable: tr.role === 'marquage' && !team && !p.goalie, hand: p.num % 2 ? 'L' : 'R' });
      const to = finalPos(p);
      a.setPos(p.x, p.z);
      if (p.goalie) a.face(0, team ? 0 : 0);
      actors.push({ a, from: { x: p.x, z: p.z }, to, goalie: p.goalie });
      if (!team && (p.carrier || tr.role === 'duel') && !p.goalie) puckActor = a;
    };
    let puckActor = null;
    for (const m of tr.scn.teammates) add(m, true);
    for (const o of tr.scn.opponents) add(o, false);
    if (tr.role === 'soutien') {
      // le porteur (coéquipier) et toi (en jaune, là où tu es)
      const c = world.addActor({ team: true, num: 10, hand: 'R' });
      c.setPos(tr.carrier.x, tr.carrier.z);
      c.face(0, 26);
      puckActor = c;
    }
    trial = { ...tr, actors, puckActor, t: 0, frozen: false, done: false, decideT: 0 };
    // Cadrage : centré sur l'action (joueurs qui comptent + cibles), vu de derrière, assez haut.
    const pts = [];
    for (const x of actors) if (!x.goalie) pts.push(x.to);
    if (tr.carrier) pts.push(tr.carrier);
    if (tr.options) pts.push(...tr.options);
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const cz = pts.reduce((a, p) => a + p.z, 0) / pts.length;
    const ext = Math.min(9, Math.max(4, ...pts.map((p) => Math.hypot(p.x - cx, p.z - cz))));
    const dir = tr.role === 'soutien' ? 1 : -1; // attaque : on regarde vers +z ; défense : vers notre but (-z)
    trial.frame = { cx, cz, ext, dir };
    world.puck.visible = true;
    U.prompt('👀 Lis le jeu…');
    U.feedback('', true);
    U.buttons([]);
  }

  function finish(ok, text) {
    trial.done = true;
    stats.reps += 1;
    stats.times.push(trial.decideT);
    const r = (stats.roles[trial.role] = stats.roles[trial.role] || { reps: 0, hits: 0 });
    r.reps += 1;
    if (ok) {
      stats.hits += 1;
      r.hits += 1;
      sfx.good();
    } else sfx.bad();
    U.feedback(text, ok);
    U.score(`✅ ${stats.hits} / ${stats.reps}`);
    pause = 2.2;
  }

  const detach = lookAndTap(canvas, world, st, (hit) => {
    if (!trial || !trial.frozen || trial.done || !hit) return;
    if (trial.role === 'marquage' && hit.type === 'pass') {
      const ok = hit.num === trial.answerNum;
      finish(ok, ok ? `✅ Oui : le n°${trial.answerNum} n’était surveillé par personne.` : `❌ Le n°${hit.num} était déjà marqué. Le joueur oublié : le n°${trial.answerNum}.`);
    } else if (hit.type === 'spot') {
      const o = trial.options.find((x) => x.label === hit.id);
      if (!o) return;
      const good = trial.options.find((x) => x.ok);
      finish(o.ok, o.ok ? `✅ ${o.label} : ${o.why}` : `❌ ${o.label} : ${o.why} Mieux : ${good.label}, ${good.why}`);
    }
  });

  U.score('✅ 0 / 0');
  world.setStickVisible(false);
  world.setHolding(false);
  newTrial();

  return {
    stats,
    update(dt) {
      t += dt;
      U.timer(1 - t / seg.seconds);
      if (pause > 0) {
        pause -= dt;
        if (pause <= 0 && t < seg.seconds) newTrial();
      } else if (trial && !trial.frozen) {
        trial.t += dt;
        const k = Math.min(1, trial.t / ANIM);
        const e = k * k * (3 - 2 * k);
        for (const x of trial.actors) {
          if (x.goalie) continue;
          x.a.setPos(x.from.x + (x.to.x - x.from.x) * e, x.from.z + (x.to.z - x.from.z) * e);
          if (Math.hypot(x.to.x - x.from.x, x.to.z - x.from.z) > 0.3) x.a.face(x.to.x + (x.to.x - x.from.x), x.to.z + (x.to.z - x.from.z));
        }
        if (k >= 1) {
          trial.frozen = true;
          U.prompt(`⏸️ ${trial.prompt}`);
          if (trial.options) trial.options.forEach((o, i) => {
            o.label = 'ABC'[i];
            world.addMarker(o.x, o.z, o.label, '#ffd23f', trial.frame.dir > 0 ? Math.PI : 0);
          });
        }
      } else if (trial && !trial.done) {
        trial.decideT += dt;
        U.rep(1 - trial.decideT / seg.decisionTime);
        if (trial.decideT >= seg.decisionTime) finish(false, '⏱️ Trop tard : lis le jeu pendant que l’action avance, pour décider vite.');
      }
      // Palet chez le porteur
      if (trial) {
        if (trial.puckActor) {
          const m = trial.puckActor.mesh;
          world.puck.position.set(m.position.x + Math.sin(m.rotation.y) * 0.9, 0.02, m.position.z + Math.cos(m.rotation.y) * 0.9);
        }
        const c = world.camera;
        const f = trial.frame;
        const back = 3 + f.ext * 0.8;
        const h = 4 + f.ext * 0.95;
        c.up.set(0, 1, 0);
        c.position.set(f.cx, h, f.cz - f.dir * back);
        c.lookAt(f.cx, 0, f.cz + f.dir * 1.5);
      }
      return t >= seg.seconds && pause <= 0;
    },
    destroy() {
      detach();
      U.buttons([]);
    },
  };
}

// =====================================================================
// Arrêt sur image : l'action avance puis se fige ; décider vite.
// Essais « stop » : un adversaire coupe la ligne au dernier moment → il faut garder le palet.
// =====================================================================
function arretSurImage(ctx) {
  const { world, canvas, seg, rand, sfx, pool } = ctx;
  const U = ui('⏸️ Arrêt sur image');
  const st = { look: 0, canLook: false };
  const stats = { reps: 0, hits: 0, stopReps: 0, stopHits: 0, times: [] };
  let t = 0;
  let trial = null;
  let pause = 0;
  const ANIM = 1.4;

  function newTrial() {
    const scn = makeVariant(pick(pool, rand), rand);
    world.clearActors();
    const me = scn.me;
    const yaw = angleTo(me, NET);
    st.look = 0;
    const actors = [];
    const add = (p, team) => {
      const a = world.addActor({ team, num: p.num, goalie: p.goalie, pickable: team && !p.goalie, hand: p.num % 2 ? 'L' : 'R' });
      const from = { x: p.x, z: p.z };
      const to = finalPos(p);
      a.setPos(from.x, from.z);
      if (p.goalie) a.face(0, 0);
      actors.push({ a, from, to, goalie: p.goalie });
      return a;
    };
    for (const m of scn.teammates) add(m, true);
    for (const o of scn.opponents) add(o, false);
    const ev = evaluate(scn);
    const stop = rand() < seg.stopRatio;
    let cutter = null;
    if (stop) {
      // Un adversaire surgit sur la trajectoire de la meilleure option.
      const target = ev.best.type === 'pass' ? ev.best.target : ev.best.type === 'shoot' ? NET : ev.best.target;
      const mid = { x: me.x + (target.x - me.x) * 0.4, z: me.z + (target.z - me.z) * 0.4 };
      const side = rand() < 0.5 ? -1 : 1;
      const a = world.addActor({ team: false, hand: 'R' });
      cutter = { a, from: { x: mid.x + side * 4, z: mid.z + 1 }, to: mid };
      a.setPos(cutter.from.x, cutter.from.z);
    }
    trial = { scn, ev, stop, cutter, actors, me, yaw, t: 0, frozen: false, done: false, decideT: 0 };
    world.setStickVisible(true);
    world.setHolding(true);
    U.prompt('Regarde bien…');
    U.feedback('', true);
    U.buttons([]);
  }

  function answer(choice) {
    if (!trial || !trial.frozen || trial.done) return;
    trial.done = true;
    stats.reps += 1;
    stats.times.push(trial.decideT);
    let ok;
    let text;
    if (trial.stop) {
      stats.stopReps += 1;
      ok = choice === 'keep';
      if (ok) stats.stopHits += 1;
      text = ok
        ? '✅ Bien vu ! Un adversaire a coupé la ligne : tu as gardé le palet.'
        : '❌ Attention : un adversaire venait de couper la ligne. Il fallait garder le palet !';
    } else {
      const key = choice;
      const opt = trial.ev.options.find((o) => o.key === key);
      ok = !!opt && opt.score >= trial.ev.best.score - 5;
      if (choice === 'keep') text = `❌ Il y avait une bonne option : ${describeOption(trial.ev.best)}.`;
      else if (ok) text = `✅ ${explain(trial.ev.best)}`;
      else text = `❌ ${opt ? explain(opt) : ''} Mieux : ${describeOption(trial.ev.best)}.`;
    }
    if (ok) {
      stats.hits += 1;
      sfx.good();
    } else sfx.bad();
    U.feedback(text, ok);
    U.score(`✅ ${stats.hits} / ${stats.reps}`);
    U.buttons([]);
    pause = 1.8;
  }

  const detach = lookAndTap(canvas, world, st, (hit) => {
    if (!hit) return;
    answer(hit.type === 'shoot' ? 'shoot' : `pass:${hit.num}`);
  });

  U.score('✅ 0 / 0');
  newTrial();

  return {
    stats,
    update(dt) {
      t += dt;
      U.timer(1 - t / seg.seconds);
      if (pause > 0) {
        pause -= dt;
        if (pause <= 0 && t < seg.seconds) newTrial();
      } else if (trial && !trial.frozen) {
        trial.t += dt;
        const k = Math.min(1, trial.t / ANIM);
        const e = k * k * (3 - 2 * k);
        for (const x of trial.actors) {
          if (x.goalie) continue;
          x.a.setPos(x.from.x + (x.to.x - x.from.x) * e, x.from.z + (x.to.z - x.from.z) * e);
          x.a.face(trial.me.x, trial.me.z);
        }
        if (trial.cutter) {
          const kc = Math.max(0, (trial.t - ANIM * 0.6) / (ANIM * 0.4));
          const c = trial.cutter;
          c.a.setPos(c.from.x + (c.to.x - c.from.x) * Math.min(1, kc), c.from.z + (c.to.z - c.from.z) * Math.min(1, kc));
          c.a.face(trial.me.x, trial.me.z);
        }
        if (k >= 1) {
          trial.frozen = true;
          st.canLook = true;
          U.prompt('⏸️ Décide ! Touche un coéquipier, le but, ou garde le palet.');
          U.buttons([
            { label: '🛡️ Garder le palet', onClick: () => answer('keep') },
            { label: '⛸️ Patiner', onClick: () => answer('skate') },
          ]);
        }
      } else if (trial && !trial.done) {
        trial.decideT += dt;
        U.rep(1 - trial.decideT / seg.decisionTime);
        if (trial.decideT >= seg.decisionTime) {
          trial.done = true;
          stats.reps += 1;
          if (trial.stop) stats.stopReps += 1;
          sfx.bad();
          U.feedback('⏱️ Trop tard ! Il faut décider plus vite.', false);
          U.score(`✅ ${stats.hits} / ${stats.reps}`);
          U.buttons([]);
          pause = 1.4;
        }
      }
      if (trial) {
        world.setBody(trial.me.x, trial.me.z, trial.yaw);
        world.setView(trial.me.x, trial.me.z, trial.yaw + st.look, EYE);
      }
      return t >= seg.seconds && pause <= 0;
    },
    destroy() {
      detach();
      U.buttons([]);
    },
  };
}

// =====================================================================
// Mémoire de glace : regarder la scène, puis répondre de mémoire.
// =====================================================================
function memoire(ctx) {
  const { world, seg, rand, sfx, pool } = ctx;
  const U = ui('🧠 Mémoire de glace');
  const stats = { reps: 0, hits: 0 };
  let t = 0;
  let q = null;
  let pause = 0;

  function where(me, yaw, p) {
    const rel = wrap(angleTo(me, p) - yaw);
    const a = Math.abs(rel);
    if (a < Math.PI / 4) return 'devant toi';
    if (a > (3 * Math.PI) / 4) return 'derrière toi';
    return rel > 0 ? 'à ta gauche' : 'à ta droite';
  }

  function newQuestion() {
    const scn = makeVariant(pick(pool, rand), rand);
    world.clearActors();
    const me = scn.me;
    const yaw = angleTo(me, NET);
    const mates = scn.teammates.map((m) => ({ ...m, ...finalPos(m) }));
    const opps = scn.opponents.filter((o) => !o.goalie);
    const passer = scn.passer ? { ...scn.passer } : null;
    const all = passer ? [...mates, passer] : mates;
    for (const m of all) {
      const a = world.addActor({ team: true, num: m.num, hand: m.num % 2 ? 'L' : 'R' });
      a.setPos(m.x, m.z);
      a.face(me.x, me.z);
    }
    for (const o of scn.opponents) {
      const p = finalPos(o);
      const a = world.addActor({ team: false, goalie: o.goalie, hand: 'R' });
      a.setPos(p.x, p.z);
      if (o.goalie) a.face(0, 0);
      else a.face(me.x, me.z);
    }
    const me3 = world.addActor({ team: true, num: 'TOI', hand: 'R' });
    me3.setPos(me.x, me.z);
    me3.face(NET.x, NET.z);

    // Trois types de questions, en alternance.
    const kind = pick(['where', 'free', 'free'], rand);
    let question;
    let answers;
    let correct;
    const ev = evaluate(scn);
    if (kind === 'free' && ev.best.type === 'pass') {
      question = 'Quel coéquipier était le plus libre pour une passe ?';
      correct = `n°${ev.best.num}`;
      answers = shuffle(all.map((m) => `n°${m.num}`), rand);
    } else if (kind === 'count') {
      question = 'Combien d’adversaires y avait-il (sans compter le gardien) ?';
      correct = String(opps.length);
      answers = ['1', '2', '3', '4'];
    } else {
      const m = pick(all, rand);
      question = `Où était le n°${m.num} ?`;
      correct = where(me, yaw, m);
      answers = ['à ta gauche', 'devant toi', 'à ta droite', 'derrière toi'];
    }
    q = { me, yaw, question, answers, correct, t: 0, phase: 'look', done: false };
    U.cover(false);
    U.prompt('👀 Mémorise la scène !');
    U.feedback('', true);
    U.buttons([]);
  }

  function answer(a) {
    if (!q || q.done) return;
    q.done = true;
    stats.reps += 1;
    const ok = a === q.correct;
    if (ok) {
      stats.hits += 1;
      sfx.good();
    } else sfx.bad();
    U.feedback(ok ? '✅ Bonne mémoire !' : `❌ La bonne réponse : ${q.correct}.`, ok);
    U.score(`✅ ${stats.hits} / ${stats.reps}`);
    U.buttons([]);
    U.cover(false);
    pause = 1.6;
  }

  world.setStickVisible(false);
  world.setHolding(false);
  world.puck.position.set(0, -5, 0);
  U.score('✅ 0 / 0');
  newQuestion();

  return {
    stats,
    update(dt) {
      t += dt;
      U.timer(1 - t / seg.seconds);
      if (pause > 0) {
        pause -= dt;
        if (pause <= 0 && t < seg.seconds) newQuestion();
      } else if (q && q.phase === 'look') {
        q.t += dt;
        U.rep(1 - q.t / seg.showTime);
        if (q.t >= seg.showTime) {
          q.phase = 'ask';
          U.cover(true, '❓');
          U.prompt(q.question);
          U.buttons(q.answers.map((a) => ({ label: a, onClick: () => answer(a) })));
        }
      }
      if (q) {
        // Vue un peu en hauteur, derrière le joueur, pour voir toute la scène.
        const c = world.camera;
        c.position.set(q.me.x - Math.sin(q.yaw) * 4, 4.5, q.me.z - Math.cos(q.yaw) * 4);
        c.up.set(0, 1, 0);
        c.lookAt(q.me.x + Math.sin(q.yaw) * 7, 0, q.me.z + Math.cos(q.yaw) * 7);
      }
      return t >= seg.seconds && pause <= 0;
    },
    destroy() {
      U.buttons([]);
      U.cover(false);
    },
  };
}

export { buildSoutien, buildDuel, buildMarquage };

export function createDrill(kind, ctx) {
  if (kind === 'lecture' || kind === 'coupdoeil') return lisLeJeu(ctx);
  if (kind === 'arret') return arretSurImage(ctx);
  return memoire(ctx);
}

export function closeDrillUI() {
  $('#drill').hidden = true;
}
