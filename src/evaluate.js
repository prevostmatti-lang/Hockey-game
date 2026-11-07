// Moteur d'évaluation des décisions : sans dépendance, testable avec Node.
//
// Pour une situation donnée, on note chaque option possible (passe à chaque
// coéquipier, tir, patiner avec le palet) sur 100, avec une raison simple
// qu'on peut expliquer à un enfant.

export const NET = { x: 0, z: 26 };

const LANE_WIDTH = 1.3; // un adversaire à moins de 1,3 m de la ligne de passe la coupe
const SHOT_LANE_WIDTH = 1.2;
const COVER_DIST = 2.5; // un coéquipier avec un adversaire à moins de 2,5 m est marqué
const SKATE_AHEAD = 5; // on regarde l'espace 5 m devant soi, en direction du but

export const finalPos = (p) => (p.to ? { x: p.to.x, z: p.to.z } : { x: p.x, z: p.z });
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Distance d'un point p au segment [a, b], et position t (0..1) le long du segment. */
export function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz || 1e-9;
  const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2;
  const c = Math.max(0, Math.min(1, t));
  return { dist: Math.hypot(p.x - (a.x + c * dx), p.z - (a.z + c * dz)), t };
}

function laneBlocker(from, to, opponents, width, tMin, tMax) {
  let best = null;
  for (const o of opponents) {
    const { dist: d, t } = distToSegment(o, from, to);
    if (t > tMin && t < tMax && d < width && (!best || t < best.t)) best = { ...o, t };
  }
  return best;
}

export function skateTarget(me) {
  const d = dist(me, NET) || 1;
  return { x: me.x + ((NET.x - me.x) / d) * SKATE_AHEAD, z: me.z + ((NET.z - me.z) / d) * SKATE_AHEAD };
}

export function evaluate(scn) {
  const me = scn.me;
  const all = scn.opponents.map((o) => ({ ...finalPos(o), goalie: !!o.goalie }));
  const skaters = all.filter((o) => !o.goalie);
  const options = [];

  for (const tm of scn.teammates) {
    const target = finalPos(tm);
    const blocker = laneBlocker(me, target, skaters, LANE_WIDTH, 0.08, 0.88);
    const covered = skaters.some((o) => dist(o, target) < COVER_DIST);
    let score;
    let reason;
    if (blocker) [score, reason] = [0, 'blocked'];
    else if (covered) [score, reason] = [25, 'covered'];
    else [score, reason] = [80 + Math.max(0, Math.min(10, (target.z - me.z) / 2)), 'open'];
    options.push({ key: `pass:${tm.num}`, type: 'pass', num: tm.num, target, score, reason, blocker });
  }

  {
    const d = dist(me, NET);
    const angle = (Math.atan2(Math.abs(NET.x - me.x), Math.max(0.1, NET.z - me.z)) * 180) / Math.PI;
    const blocker = laneBlocker(me, NET, skaters, SHOT_LANE_WIDTH, 0.08, 0.92);
    let score;
    let reason;
    if (blocker) [score, reason] = [5, 'blocked'];
    else if (d > 17) [score, reason] = [15, 'far'];
    else if (angle > 50) [score, reason] = [d <= 10 ? 50 : 25, 'angle'];
    else [score, reason] = [d <= 10 ? 85 : 60, 'good'];
    options.push({ key: 'shoot', type: 'shoot', target: { ...NET }, score, reason, blocker });
  }

  {
    const target = skateTarget(me);
    const space = Math.min(...all.map((o) => dist(o, target)));
    let score;
    let reason;
    if (space >= 5) [score, reason] = [70, 'open'];
    else if (space >= 3) [score, reason] = [35, 'tight'];
    else [score, reason] = [10, 'blocked'];
    options.push({ key: 'skate', type: 'skate', target, score, reason });
  }

  const best = options.reduce((a, b) => (b.score > a.score ? b : a));
  return { options, best };
}

/** Étoiles pour la décision : 2 = la meilleure, 1 = une option correcte, 0 = mauvaise. */
export function gradeDecision(option, best) {
  if (!option || option.type === 'timeout') return 0;
  if (option.score >= best.score - 5) return 2;
  if (option.score >= 50) return 1;
  return 0;
}

export function describeOption(o) {
  if (o.type === 'pass') return `passer au n°${o.num}`;
  if (o.type === 'shoot') return 'tirer au but';
  if (o.type === 'skate') return 'patiner avec le palet';
  return 'ne rien faire';
}

export function explain(o) {
  if (o.type === 'timeout') return "Trop tard ! L'adversaire t'a pris le palet. Il faut décider plus vite.";
  if (o.type === 'pass') {
    if (o.reason === 'open') return `Le n°${o.num} était démarqué et la ligne de passe était libre.`;
    if (o.reason === 'covered') return `Le n°${o.num} était marqué par un adversaire.`;
    return `Un adversaire coupait la ligne de passe vers le n°${o.num}.`;
  }
  if (o.type === 'shoot') {
    if (o.reason === 'good') return 'Tu étais bien placé pour tirer, sans personne entre toi et le but.';
    if (o.reason === 'far') return 'Tu étais trop loin du but : facile pour le gardien.';
    if (o.reason === 'angle') return "L'angle était trop fermé : tu étais trop sur le côté.";
    return 'Un adversaire était entre toi et le but : tir bloqué.';
  }
  if (o.reason === 'open') return 'Il y avait de la place devant toi pour avancer avec le palet.';
  return 'Un adversaire te barrait la route.';
}
