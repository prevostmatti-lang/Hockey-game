# Tête haute ! 🏒

Jeu de hockey sur glace **en vue première personne** pour les enfants de 6 à 12 ans d'un club.
Objectif : apprendre à **lever la tête**, à **lire le jeu** et à **prendre la bonne décision**
(passer, tirer ou patiner) au bon moment.

Le brief complet est dans [`docs/BRIEF.md`](docs/BRIEF.md).

**📅 Programme d'entraînement** : 3 séances de 15 min par semaine, du 9 novembre 2026 à fin avril 2027, fondé sur les recommandations des fédérations et la recherche. Voir [`docs/PROGRAMME.md`](docs/PROGRAMME.md).

## Comment on joue

Au premier lancement, l'enfant choisit **droitier** (palette à droite) ou **gaucher** (palette à gauche).
Ce choix détermine de quel côté il porte le palet, et quelles passes sont en **coup droit** ou en **revers**.
Le revers est moins fort et moins précis.

Le pouce fonctionne comme un **joystick** autour de l'endroit où il s'est posé (un repère s'affiche dessous) :

L'écran est coupé en deux zones (elles sont montrées au début de la première situation) :

| | Paysage | Portrait |
|---|---|---|
| 🕹️ **Se déplacer** | moitié gauche | moitié basse |
| 👀 **Regarder autour** | moitié droite | moitié haute |

| Geste | Action |
|---|---|
| 🕹️ Pousser le pouce (zone de déplacement) | patiner ; plus loin = plus vite ; sur le côté = tourner (rotation exponentielle) ; vers le bas = reculer |
| 👀 Glisser (zone de vision) | tourner la tête sans changer de direction ; le regard revient devant quand on lève le doigt |
| ⬆️ Swipe rapide vers le haut (n'importe où) | passe ou tir dans la direction du swipe ; plus le swipe est rapide, plus c'est fort |
| ⬆️ Swipe **long** vers le haut | **passe levée** : le palet passe au-dessus des crosses adverses |
| 🎯 Toucher une cible sur la cage (près du but) | tir dans cette zone : haut gauche, haut droite, bas gauche, bas droite ou entre les jambières |
| Lâcher l'écran | on glisse en ralentissant |
| Double tap | freiner |

### Tir et cage
- **Assistance au tir** : un swipe à peu près vers le but est guidé vers la cible libre la plus proche (aide forte en U9, faible en U13).
- **Cage fixe à l'écran** : à moins de 16 m du but avec le palet, la cage vue de face apparaît avec le gardien et 5 cibles. Une cible est **verte** si le tir peut y passer, **rouge** si le gardien la couvre ou si un défenseur bloque un tir bas. Le jeu tient compte de la position du gardien, du temps qu'il a pour glisser vers le tir, et de sa posture : **debout** (coins et entre les jambières ouverts) ou **en papillon** près du but (tout le bas fermé, coins hauts ouverts).
- **Le palet vole** : les tirs hauts et les passes levées montent puis retombent (gravité). Un tir très fort est un peu moins précis.

Une situation se joue ainsi :
1. Un coéquipier envoie le palet. Avant qu'il arrive, l'enfant se tourne pour repérer ses coéquipiers.
2. Il patine, passe ou tire. Les adversaires défendent : un défenseur vient au contact, d'autres marquent ou coupent les lignes de passe, et le gardien suit le palet.
3. L'action s'arrête sur un but, un arrêt, une interception, une perte de palet ou la fin du temps.
4. Un ralenti vu du dessus montre son trajet, celui du palet, et la meilleure option au moment où il a joué.

Chaque situation rapporte jusqu'à 3 étoiles :
- **👀 Radar** : il avait repéré tous ses coéquipiers avant de jouer le palet.
- **🧠 Décision** : sa passe ou son tir était la meilleure option à ce moment-là.
- **🥅 But** : son équipe a marqué.

| Catégorie | Âge | Défenseur | Aide à la visée | Durée |
|---|---|---|---|---|
| U9 | 6-8 ans | lent, laisse 1,5 s après la réception | forte | 30 s |
| U11 | 9-10 ans | moyen | moyenne | 22 s |
| U13 | 11-12 ans | rapide, presse tout de suite | faible | 18 s |

## Mode Défense

Il y a 9 situations défensives (3 par catégorie). C'est l'adversaire qui a le palet et qui attaque **ton** but.
Chaque situation donne une **mission** :

| Mission | Ce qu'il faut faire | Exemples |
|---|---|---|
| Rester entre le porteur et le but | Se placer devant l'attaquant, reculer avec lui, puis piquer le palet avec la crosse | 1 contre 1, repli |
| Couper la passe | Se placer sur la ligne de passe, ou contre le receveur, et laisser le gardien prendre le tir | 2 contre 1, 3 contre 2 |
| Marquer un joueur | Rester près de l'attaquant sans palet, entre lui et le but | l'enclave, le joueur oublié |

Règles qui portent la leçon :
- **Pas de palet par derrière** : impossible de le piquer dans le dos, il faut d'abord se replacer devant l'attaquant.
- **Foncer sur le porteur se paie** : l'attaquant passe à son coéquipier laissé seul, qui marque.

Les 3 étoiles en défense :
- **👀 Radar** : tous les attaquants repérés avant leur première passe ou leur premier tir.
- **📍 Placement** : la mission est tenue au moins 55 % du temps, ou le palet est récupéré par le joueur lui-même.
- **💪 Récupéré** : l'équipe a récupéré le palet, ou a tenu jusqu'au bout sans encaisser de but. Un arrêt du gardien ne compte pas.

Sur le ralenti, un **rond vert** montre où le joueur aurait dû être au moment clé.

## Lancer le jeu

Aucune installation nécessaire, il suffit d'un petit serveur web local :

```bash
npm start          # ou : python3 -m http.server 8080
```

Puis ouvrir http://localhost:8080. Sur ordinateur : ↑ pour patiner, ↓ pour reculer, ← → pour tourner, B pour freiner, espace pour tirer tout droit. On peut aussi swiper à la souris.

Pour tester sur téléphone ou tablette, le plus simple est d'activer **GitHub Pages** sur ce dépôt
(Settings → Pages → branche, dossier racine). Le jeu peut ensuite être « ajouté à l'écran d'accueil »
et fonctionne **hors ligne**, ce qui est pratique à la patinoire.

## Tests

```bash
npm test
```

Les tests vérifient deux choses :
- le moteur d'évaluation trouve bien la meilleure option prévue pour chaque situation ;
- la simulation se comporte correctement en attaque : passe reçue, but en 2 contre 1, tir dans un coin, arrêt du gardien, palet volé, revers plus faible, patinage ;
- la défense récompense le bon comportement : bien marquer évite le but, foncer sur le porteur laisse l'attaquant seul marquer, rester immobile ne récupère rien, on ne pique pas le palet par derrière.

## Ajouter une situation

Les situations sont de simples données dans [`src/scenarios.js`](src/scenarios.js) : positions du joueur, du passeur,
des coéquipiers et des adversaires, avec un déplacement optionnel (`to`). On indique la meilleure option attendue
dans `expect`, puis `npm test` confirme que le moteur est d'accord.

## Organisation

```
index.html            page unique
css/style.css         interface (menus, HUD, résultats)
src/main.js           déroulement du jeu, contrôles tactiles (patiner, tourner, swipe)
src/sim.js            simulation : patinage, palet, gardien, coéquipiers et adversaires
src/world.js          rendu 3D (three.js) : patinoire, joueurs, caméra
src/evaluate.js       note les options : lignes de passe, marquage, angle de tir, espace
src/scenarios.js      les situations d'attaque et de défense
src/generator.js      variantes de situations (miroir, décalages, numéros), vérifiées
src/program.js        calendrier et contenu des séances du programme
src/drills.js         exercices courts : Coup d'œil, Arrêt sur image, Mémoire de glace
src/diagram.js        ralenti vu du dessus
src/audio.js          sons synthétisés et voix off française
sw.js                 fonctionnement hors ligne
vendor/               three.js r160 (licence MIT)
```
