// Variantes de situations : à partir d'une situation de base, on crée une situation « cousine »
// (miroir gauche/droite, positions légèrement décalées, autres numéros de maillot).
// Les enfants ne peuvent donc pas apprendre les réponses par cœur : ils doivent lire le jeu.
// En attaque, chaque variante est vérifiée avec le moteur d'évaluation : la meilleure option
// doit rester la même et se détacher nettement des autres.
import { evaluate } from './evaluate.js';

/** Petit générateur pseudo-aléatoire reproductible (pour les tests). */
export function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NUM_POOL = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 17, 18, 19, 21, 22, 23, 24, 27, 28, 31, 44, 55, 71, 77, 88, 91, 93];

function remapRef(ref, map) {
  if (!ref) return ref;
  const [kind, num] = String(ref).split(':');
  return num != null && map.has(Number(num)) ? `${kind}:${map.get(Number(num))}` : ref;
}

function transform(scn, { mirror, dx, dz, jitter, numbers }, rand) {
  const sx = mirror ? -1 : 1;
  const j = () => (rand() - 0.5) * 2 * jitter;
  const pos = (p, isGoalie) => {
    if (isGoalie) return { x: 0, z: p.z };
    return { x: clamp(sx * p.x + dx + j(), -11.5, 11.5), z: clamp(p.z + dz + j(), -24, 23.5) };
  };
  const moved = (p, extra = {}) => {
    const out = { ...p, ...pos(p, p.goalie), ...extra };
    if (p.to) out.to = { x: clamp(sx * p.to.x + dx, -11.5, 11.5), z: clamp(p.to.z + dz, -24, 23.5) };
    if (p.num != null && numbers.has(p.num)) out.num = numbers.get(p.num);
    if (p.cover != null && numbers.has(p.cover)) out.cover = numbers.get(p.cover);
    if (p.mark != null && numbers.has(p.mark)) out.mark = numbers.get(p.mark);
    return out;
  };
  const out = {
    ...scn,
    id: `${scn.id}~v`,
    me: pos(scn.me, false),
    teammates: scn.teammates.map((t) => moved(t)),
    opponents: scn.opponents.map((o) => moved(o)),
  };
  if (scn.passer) out.passer = moved(scn.passer);
  // Pas de hors-jeu : si le porteur est avant la ligne bleue, ses coéquipiers l'attendent à la ligne.
  const B = 7.5;
  const clampZ = (p, lim, side) => {
    const f = (o) => (o ? { ...o, z: side > 0 ? Math.min(o.z, lim) : Math.max(o.z, lim) } : o);
    return { ...f(p), to: p.to ? f(p.to) : undefined };
  };
  // (En défense, c'est la simulation qui fait attendre les attaquants à la ligne : leur course continue ensuite.)
  if ((!scn.mode || scn.mode === 'attack') && out.me.z < B) {
    out.teammates = out.teammates.map((t) => (t.goalie ? t : clampZ(t, B - 0.3, 1)));
  }
  if (scn.expect) out.expect = remapRef(scn.expect, numbers);
  if (scn.duty) out.duty = remapRef(scn.duty, numbers);
  if (scn.mission) out.mission = scn.mission.replace(/n°(\d+)/g, (m, n) => (numbers.has(Number(n)) ? `n°${numbers.get(Number(n))}` : m));
  return out;
}

function randomNumbers(scn, rand) {
  const used = [scn.passer, ...scn.teammates, ...scn.opponents].filter((p) => p && p.num != null).map((p) => p.num);
  const pool = NUM_POOL.slice();
  const map = new Map();
  for (const n of used) {
    const i = Math.floor(rand() * pool.length);
    map.set(n, pool.splice(i, 1)[0]);
  }
  return map;
}

function attackOk(v) {
  const { best, options } = evaluate(v);
  if (best.key !== v.expect) return false;
  const second = options.filter((o) => o !== best).reduce((a, b) => Math.max(a, b.score), 0);
  return best.score - second >= 10;
}

/**
 * Crée une variante d'une situation. En attaque, on réessaie jusqu'à obtenir une variante
 * dont la meilleure option est inchangée ; sinon on renvoie le simple miroir (toujours valide).
 */
export function makeVariant(scn, rand = Math.random) {
  const defense = scn.mode === 'defense';
  for (let tries = 0; tries < 25; tries++) {
    const v = transform(
      scn,
      {
        mirror: rand() < 0.5,
        dx: defense ? (rand() - 0.5) * 1 : (rand() - 0.5) * 3,
        dz: defense ? (rand() - 0.5) * 1 : (rand() - 0.5) * 3,
        jitter: defense ? 0.3 : 0.6,
        numbers: randomNumbers(scn, rand),
      },
      rand,
    );
    if (defense || attackOk(v)) return v;
  }
  return transform(scn, { mirror: true, dx: 0, dz: 0, jitter: 0, numbers: new Map() }, rand);
}
