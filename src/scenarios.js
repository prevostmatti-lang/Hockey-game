// Situations de jeu, décrites comme des données.
//
// Repère de la patinoire (en mètres) :
//   x : largeur, de -13 à +13
//   z : longueur, de -30 à +30. On attaque vers le but adverse situé en z = +26.
//
// Chaque joueur a une position de départ (x, z) et, en option, une position
// d'arrivée `to` : il s'y déplace pendant que l'enfant regarde autour de lui.
// Toutes les situations commencent par une passe du `passer` vers le joueur.
// `expect` est la meilleure option une fois les joueurs arrivés à leur place.
//
// `expect` indique la meilleure option attendue : les tests vérifient que le
// moteur d'évaluation est bien d'accord (voir tests/evaluate.test.mjs).

// Réglages par catégorie :
//   time      durée maximale de la situation (s)
//   presser   vitesse du défenseur qui vient au contact (m/s ; le joueur patine à 6,5 m/s)
//   goalie    vitesse latérale du gardien (m/s) ; goalieReaction : son temps de réaction après un tir (s)
//   assist    aide à la visée (radians) : la passe « s'aimante » vers un coéquipier proche de la direction choisie
//   passDelay délai avant que le passeur envoie le palet (s)
//   steal     temps au contact avant que le défenseur prenne le palet (s)
//   pressDelay temps laissé au joueur après la réception avant que le défenseur vienne au contact (s)
export const LEVELS = [
  { id: 'U9', name: 'U9', ages: '6-8 ans', color: '#2fbf71', time: 30, presser: 2.4, goalie: 2.2, goalieReaction: 0.3, assist: 0.24, passDelay: 2.5, steal: 0.9, pressDelay: 1.5 },
  { id: 'U11', name: 'U11', ages: '9-10 ans', color: '#f5a524', time: 22, presser: 3.4, goalie: 3.0, goalieReaction: 0.22, assist: 0.13, passDelay: 2.0, steal: 0.5, pressDelay: 0.7 },
  { id: 'U13', name: 'U13', ages: '11-12 ans', color: '#e5484d', time: 18, presser: 4.4, goalie: 3.8, goalieReaction: 0.14, assist: 0.06, passDelay: 1.6, steal: 0.35, pressDelay: 0.2 },
];

// Rôles des adversaires : `presser` (vient au contact du porteur), `cover: n°` (marque un coéquipier),
// sinon défense de zone (garde sa place en suivant un peu le palet). Le gardien suit le palet.
const GOALIE = { goalie: true, x: 0, z: 25.2 };

export const SCENARIOS = [
  // ---------- U9 ----------
  {
    id: 'u9-1',
    level: 'U9',
    title: 'Le copain tout seul',
    me: { x: -4, z: 2 },
    passer: { num: 4, x: -3, z: -8 },
    teammates: [{ num: 9, x: 6, z: 12 }],
    opponents: [{ x: -4, z: 9 }, { x: -8, z: 6, to: { x: -5, z: 4 }, presser: true }, GOALIE],
    expect: 'pass:9',
    lesson: 'Avant de recevoir le palet, tourne la tête pour savoir où sont tes coéquipiers libres.',
  },
  {
    id: 'u9-2',
    level: 'U9',
    title: 'La glace est libre',
    me: { x: 2, z: 4 },
    passer: { num: 6, x: -2, z: -6 },
    teammates: [{ num: 12, x: -8, z: 6 }],
    opponents: [
      { x: -7.5, z: 7.2, cover: 12 },
      { x: 9, z: 14, to: { x: 8, z: 15 } },
      { x: -3, z: -2, to: { x: 0, z: 2 }, presser: true },
      GOALIE,
    ],
    expect: 'skate',
    lesson: 'Quand il y a de la place devant toi, fonce avec le palet !',
  },
  {
    id: 'u9-3',
    level: 'U9',
    title: 'Devant le but',
    me: { x: -2, z: 17 },
    passer: { num: 10, x: 7, z: 22 },
    teammates: [{ num: 7, x: -8, z: 21 }],
    opponents: [{ x: -7, z: 21.8, cover: 7 }, { x: 7, z: 15, to: { x: 3, z: 16 }, presser: true }, GOALIE],
    expect: 'shoot',
    lesson: 'Près du but, face au gardien et sans adversaire devant toi : tire !',
  },

  // ---------- U11 ----------
  {
    id: 'u11-1',
    level: 'U11',
    title: '2 contre 1 : le défenseur vient sur toi',
    me: { x: -3, z: 10 },
    passer: { num: 5, x: -6, z: 0 },
    teammates: [{ num: 19, x: 4, z: 16, to: { x: 3, z: 19 } }],
    opponents: [{ x: -1, z: 14, to: { x: -4.5, z: 11.5 }, presser: true }, GOALIE],
    expect: 'pass:19',
    lesson: 'En 2 contre 1, si le défenseur vient sur toi, ton coéquipier est libre : passe-lui le palet.',
  },
  {
    id: 'u11-2',
    level: 'U11',
    title: '2 contre 1 : le défenseur coupe la passe',
    me: { x: -3, z: 10 },
    passer: { num: 5, x: -6, z: 0 },
    teammates: [{ num: 19, x: 4, z: 16, to: { x: 4, z: 19 } }],
    opponents: [{ x: 1, z: 16, to: { x: 1.5, z: 14 } }, GOALIE],
    expect: 'shoot',
    lesson: 'Si le défenseur se place sur la ligne de passe, garde le palet et tire au but.',
  },
  {
    id: 'u11-3',
    level: 'U11',
    title: 'Le soutien derrière toi',
    me: { x: 5, z: 6 },
    passer: { num: 3, x: -5, z: -2 },
    teammates: [{ num: 11, x: -7, z: 14 }, { num: 4, x: -2, z: 2 }],
    opponents: [
      { x: 5, z: 11, to: { x: 5, z: 8.5 }, presser: true },
      { x: -1, z: 9, to: { x: -1, z: 9.5 } },
      GOALIE,
    ],
    expect: 'pass:4',
    lesson: "Bloqué devant ? La meilleure passe est parfois celle vers le coéquipier qui te soutient, derrière toi.",
  },

  // ---------- U13 ----------
  {
    id: 'u13-1',
    level: 'U13',
    title: "Le joueur dans l'enclave",
    me: { x: 9, z: 20 },
    passer: { num: 2, x: 8, z: 8 },
    teammates: [{ num: 91, x: 0, z: 19 }, { num: 22, x: -8, z: 22 }],
    opponents: [
      { x: 9, z: 14, to: { x: 9, z: 17.5 }, presser: true },
      { x: -7, z: 22.8, cover: 22 },
      { x: 4, z: 23 },
      GOALIE,
    ],
    expect: 'pass:91',
    lesson: "Le long de la bande, l'angle de tir est fermé : cherche le coéquipier libre au centre.",
  },
  {
    id: 'u13-2',
    level: 'U13',
    title: 'Contre-attaque à 3 contre 2',
    me: { x: 0, z: 4 },
    passer: { num: 6, x: 2, z: -8 },
    teammates: [
      { num: 10, x: -8, z: 10, to: { x: -8, z: 14 } },
      { num: 27, x: 8, z: 9, to: { x: 8, z: 13 } },
    ],
    opponents: [
      { x: -4, z: 14, to: { x: -6, z: 13 }, cover: 10 },
      { x: 4, z: 15, to: { x: 2, z: 12 }, presser: true },
      GOALIE,
    ],
    expect: 'pass:27',
    lesson: 'Regarde quel défenseur monte sur toi : le coéquipier de son côté devient libre.',
  },
  {
    id: 'u13-3',
    level: 'U13',
    title: 'La remise à la pointe',
    me: { x: -6, z: 18 },
    passer: { num: 17, x: -4, z: 28 },
    teammates: [{ num: 44, x: 3, z: 9 }, { num: 8, x: 5, z: 21 }],
    opponents: [
      { x: -9, z: 14, to: { x: -7, z: 16.5 }, presser: true },
      { x: 4.5, z: 22, cover: 8 },
      { x: -2, z: 22 },
      GOALIE,
    ],
    expect: 'pass:44',
    lesson: 'Quand tout est fermé devant le but, le défenseur à la ligne bleue est souvent libre.',
  },
];
