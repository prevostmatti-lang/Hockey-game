// Exercices cognitifs courts du programme (voir docs/PROGRAMME.md) :
//   - Coup d'œil       : regarder autour de soi et repérer vite un coéquipier (prise d'information, « scanning »)
//   - Arrêt sur image  : l'action se fige, il faut décider vite ; parfois un adversaire coupe la ligne au
//                        dernier moment et il faut GARDER le palet (inhibition : retenir la passe prévue)
//   - Mémoire de glace : regarder la scène 1 à 3 s, puis répondre de mémoire (mémoire de travail)
//
// Chaque exercice dure un temps fixe et renvoie ses statistiques à la fin.
import { evaluate, explain, describeOption, finalPos, NET } from './evaluate.js';
import { makeVariant } from './generator.js';
import { angleTo, wrap } from './sim.js';

const $ = (s) => document.querySelector(s);
const EYE = 1.45;

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
// Coup d'œil : repérer le plus vite possible un coéquipier, souvent placé derrière soi.
// =====================================================================
function coupDoeil(ctx) {
  const { world, canvas, seg, rand, sfx, speak } = ctx;
  const U = ui('👀 Coup d’œil');
  const st = { look: 0, canLook: true };
  const stats = { reps: 0, hits: 0, times: [] };
  let t = 0;
  let rep = null;
  let pause = 0;
  const repLimit = seg.timeLimit * 1.6;

  function newRep() {
    world.clearActors();
    st.look = 0;
    const nums = shuffle([4, 7, 9, 11, 14, 17, 19, 22, 27, 88], rand).slice(0, seg.targets);
    // Positions autour du joueur : au moins une derrière (plus de 110° de l'axe du regard).
    const angles = [];
    while (angles.length < seg.targets + 2) {
      const a = (rand() * 2 - 1) * Math.PI;
      if (angles.every((b) => Math.abs(wrap(a - b)) > 0.55)) angles.push(a);
    }
    if (!angles.slice(0, seg.targets).some((a) => Math.abs(a) > 1.9)) angles[0] = (rand() < 0.5 ? 1 : -1) * (2.2 + rand() * 0.8);
    const mates = nums.map((num, i) => {
      const a = angles[i];
      const d = 5 + rand() * 4;
      const actor = world.addActor({ team: true, num, pickable: true, hand: i % 2 ? 'L' : 'R' });
      actor.setPos(Math.sin(a) * d, Math.cos(a) * d);
      actor.face(0, 0);
      return { num, a };
    });
    for (let k = 0; k < 2; k++) {
      const a = angles[seg.targets + k];
      const o = world.addActor({ team: false, hand: k ? 'L' : 'R' });
      o.setPos(Math.sin(a) * 6, Math.cos(a) * 6);
      o.face(0, 0);
    }
    // La cible est de préférence derrière : on apprend à se retourner.
    const behind = mates.filter((m) => Math.abs(m.a) > 1.9);
    const target = pick(behind.length ? behind : mates, rand);
    rep = { target: target.num, t: 0, done: false };
    U.prompt(`Trouve le n°${target.num} et touche-le !`);
    U.feedback('', true);
  }

  function finishRep(ok, text) {
    rep.done = true;
    stats.reps += 1;
    if (ok) {
      stats.hits += 1;
      stats.times.push(rep.t);
      sfx.good();
    } else sfx.bad();
    U.feedback(text, ok);
    U.score(`✅ ${stats.hits} / ${stats.reps}`);
    pause = 0.9;
  }

  const detach = lookAndTap(canvas, world, st, (hit) => {
    if (!rep || rep.done || !hit || hit.type !== 'pass') return;
    if (hit.num === rep.target) finishRep(true, `✅ Trouvé en ${rep.t.toFixed(1).replace('.', ',')} s`);
    else finishRep(false, `❌ C’était le n°${hit.num}. Cherche le n°${rep.target} !`);
  });

  speak('Coup d’œil ! Glisse ton doigt pour regarder partout, et touche le bon coéquipier.');
  world.setStickVisible(false);
  world.setHolding(false);
  world.puck.position.set(0, -5, 0);
  U.score('✅ 0 / 0');
  newRep();

  return {
    stats,
    update(dt) {
      t += dt;
      U.timer(1 - t / seg.seconds);
      if (pause > 0) {
        pause -= dt;
        if (pause <= 0 && t < seg.seconds) newRep();
      } else if (rep && !rep.done) {
        rep.t += dt;
        U.rep(1 - rep.t / repLimit);
        if (rep.t >= repLimit) finishRep(false, `⏱️ Trop tard ! Le n°${rep.target} était derrière toi.`);
      }
      world.setView(0, 0, st.look, EYE);
      return t >= seg.seconds && pause <= 0;
    },
    destroy: detach,
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
      if (trial) world.setView(trial.me.x, trial.me.z, trial.yaw + st.look, EYE);
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
    const kind = pick(['where', 'where', 'free', 'count'], rand);
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

export function createDrill(kind, ctx) {
  if (kind === 'coupdoeil') return coupDoeil(ctx);
  if (kind === 'arret') return arretSurImage(ctx);
  return memoire(ctx);
}

export function closeDrillUI() {
  $('#drill').hidden = true;
}
