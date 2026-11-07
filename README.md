# Tête haute ! 🏒

Jeu de hockey sur glace **en vue première personne** pour les enfants de 6 à 12 ans d'un club.
Objectif : apprendre à **lever la tête**, à **lire le jeu** et à **prendre la bonne décision**
(passer, tirer ou patiner) au bon moment.

Le brief complet est dans [`docs/BRIEF.md`](docs/BRIEF.md).

## Comment on joue

Au premier lancement, l'enfant choisit **droitier** (palette à droite) ou **gaucher** (palette à gauche).
Ce choix détermine de quel côté il porte le palet, et quelles passes sont en **coup droit** ou en **revers**.
Le revers est moins fort et moins précis.

| Geste | Action |
|---|---|
| ☝️ Doigt appuyé sur l'écran | patiner vers l'avant |
| ↔️ Glisser le doigt à gauche ou à droite, sans le lever | tourner |
| ⬆️ Swipe vers le haut (même en patinant) | passe ou tir dans la direction du swipe ; plus le swipe est rapide, plus c'est fort |
| 👀 Boutons en bas à gauche et à droite | regarder par-dessus l'épaule |

Une situation se joue ainsi :
1. Un coéquipier envoie le palet. Avant qu'il arrive, l'enfant regarde autour de lui pour repérer ses coéquipiers.
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

## Lancer le jeu

Aucune installation nécessaire, il suffit d'un petit serveur web local :

```bash
npm start          # ou : python3 -m http.server 8080
```

Puis ouvrir http://localhost:8080. Sur ordinateur : ↑ pour patiner, ← → pour tourner, Q/E pour regarder par-dessus l'épaule, espace pour tirer tout droit. On peut aussi swiper à la souris.

Pour tester sur téléphone ou tablette, le plus simple est d'activer **GitHub Pages** sur ce dépôt
(Settings → Pages → branche, dossier racine). Le jeu peut ensuite être « ajouté à l'écran d'accueil »
et fonctionne **hors ligne**, ce qui est pratique à la patinoire.

## Tests

```bash
npm test
```

Les tests vérifient deux choses :
- le moteur d'évaluation trouve bien la meilleure option prévue pour chaque situation ;
- la simulation se comporte correctement : passe reçue, but en 2 contre 1, tir dans un coin, arrêt du gardien, palet volé, revers plus faible, patinage.

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
src/scenarios.js      les situations de jeu
src/diagram.js        ralenti vu du dessus
src/audio.js          sons synthétisés et voix off française
sw.js                 fonctionnement hors ligne
vendor/               three.js r160 (licence MIT)
```
