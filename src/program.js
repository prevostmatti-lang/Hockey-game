// Programme d'entraînement cognitif : 3 séances de 15 minutes par semaine,
// du lundi 9 novembre 2026 à la fin de la saison (25 avril 2027).
//
// Chaque semaine : séance A (attaque), séance B (défense), séance C (mixte : on change de rôle,
// ce qui travaille la flexibilité cognitive). Chaque séance suit le même déroulé de 15 minutes :
//   1. Coup d'œil (2 min)      : regarder derrière soi et repérer vite (prise d'information, « scanning »)
//   2. Situations de jeu (9 min) : jouer et décider en temps réel, dans des situations toujours renouvelées
//   3. Lecture (3 min)          : « arrêt sur image » (décider vite, savoir NE PAS faire la passe = inhibition)
//                                 ou « mémoire de glace » (mémoire de travail)
//   4. Bilan (1 min)            : étoiles et conseil du jour
//
// La difficulté augmente par blocs de 4 semaines (temps de décision plus court, défenseurs plus
// rapides, moins d'aide à la visée). Voir docs/PROGRAMME.md pour les sources.

export const PROGRAM_START = new Date(2026, 10, 9); // lundi 9 novembre 2026
export const PROGRAM_WEEKS = 24; // jusqu'au dimanche 25 avril 2027
export const SESSIONS_PER_WEEK = 3;
export const HOLIDAY_WEEKS = [7, 8]; // 21 décembre 2026 → 3 janvier 2027

export const BLOCKS = [
  { id: 1, name: 'Tête haute', from: 1, to: 4, diff: 0, focus: 'Regarder autour de soi AVANT de recevoir le palet.' },
  { id: 2, name: 'Lire le jeu', from: 5, to: 6, diff: 1, focus: 'Repérer le coéquipier libre et le joueur à marquer.' },
  { id: 3, name: 'Le surnombre', from: 9, to: 12, diff: 1, focus: '2 contre 1, 3 contre 2 : attaquer et défendre le surnombre.' },
  { id: 4, name: 'Décider vite', from: 13, to: 16, diff: 2, focus: 'Moins de temps : décider plus vite, et savoir garder le palet.' },
  { id: 5, name: 'Jouer juste', from: 17, to: 20, diff: 2, focus: 'Passer de l’attaque à la défense sans se tromper de mission.' },
  { id: 6, name: 'Défis', from: 21, to: 24, diff: 3, focus: 'Tout réunir, plus vite, contre une défense plus forte.' },
];

const DAY = 24 * 3600 * 1000;

export function weekStart(week) {
  return new Date(PROGRAM_START.getTime() + (week - 1) * 7 * DAY);
}

/** Semaine du programme (1 à 24) pour une date ; 0 avant le début, PROGRAM_WEEKS + 1 après la fin. */
export function weekOf(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const w = Math.floor((d.getTime() - PROGRAM_START.getTime()) / (7 * DAY)) + 1;
  return Math.max(0, Math.min(PROGRAM_WEEKS + 1, w));
}

export function blockOf(week) {
  return BLOCKS.find((b) => week >= b.from && week <= b.to) || null;
}

export const isHoliday = (week) => HOLIDAY_WEEKS.includes(week);

/** Réglages de difficulté d'une catégorie (LEVELS) ajustés au niveau du bloc. */
export function scaledLevel(base, diff) {
  const k = (f) => Math.max(0.35, 1 - f * diff);
  return {
    ...base,
    time: Math.round(base.time * k(0.08)),
    presser: base.presser * (1 + 0.08 * diff),
    attack: base.attack * (1 + 0.06 * diff),
    goalie: base.goalie * (1 + 0.06 * diff),
    goalieReaction: base.goalieReaction * k(0.1),
    assist: base.assist * k(0.2),
    passReact: base.passReact * k(0.12),
    pressDelay: base.pressDelay * k(0.25),
    steal: base.steal * k(0.1),
  };
}

const SESSION_INFO = {
  A: { title: 'Séance A · Attaque', mode: 'attack' },
  B: { title: 'Séance B · Défense', mode: 'defense' },
  C: { title: 'Séance C · Attaque et défense', mode: 'mixed' },
};

/**
 * Plan d'une séance : la liste des exercices et leur durée (en secondes), avec leurs réglages.
 * @param week   semaine du programme (1 à 24)
 * @param letter 'A', 'B' ou 'C'
 */
export function sessionPlan(week, letter) {
  const block = blockOf(week) || BLOCKS[BLOCKS.length - 1];
  const d = block.diff;
  const info = SESSION_INFO[letter];
  // Lecture : arrêt sur image en A ; en B et C, mémoire de glace à partir du bloc 3.
  const reading = letter === 'A' || block.id < 3 ? 'arret' : letter === 'B' ? 'memoire' : week % 2 ? 'arret' : 'memoire';
  return {
    week,
    letter,
    block,
    title: info.title,
    focus: block.focus,
    segments: [
      {
        drill: 'coupdoeil',
        label: 'Coup d’œil',
        seconds: 120,
        // nombre de coéquipiers à repérer derrière soi, temps pour les trouver
        targets: Math.min(4, 2 + Math.floor(d / 1.5)),
        timeLimit: Math.max(2.5, 5 - d * 0.8),
      },
      { drill: 'live', label: 'Situations de jeu', seconds: 540, mode: info.mode },
      {
        drill: reading,
        label: reading === 'arret' ? 'Arrêt sur image' : 'Mémoire de glace',
        seconds: 180,
        decisionTime: Math.max(2.5, 6 - d * 1.1), // secondes pour décider
        stopRatio: [0.15, 0.15, 0.2, 0.3, 0.3, 0.35][block.id - 1], // essais où il faut GARDER le palet
        showTime: Math.max(1.2, 3 - d * 0.5), // mémoire : temps pour regarder la scène
      },
      { drill: 'bilan', label: 'Bilan', seconds: 60 },
    ],
  };
}

/** Résumé de toutes les semaines (pour l'écran du programme et la documentation). */
export function calendar() {
  const weeks = [];
  for (let w = 1; w <= PROGRAM_WEEKS; w++) {
    weeks.push({ week: w, start: weekStart(w), holiday: isHoliday(w), block: blockOf(w) });
  }
  return weeks;
}
