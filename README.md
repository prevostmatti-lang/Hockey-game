# Tête haute ! 🏒

Jeu de hockey sur glace **en vue première personne** pour les enfants de 6 à 12 ans d'un club.
Objectif : apprendre à **lever la tête**, à **lire le jeu** et à **prendre la bonne décision**
(passer, tirer ou patiner) au bon moment.

Le brief complet est dans [`docs/BRIEF.md`](docs/BRIEF.md).

## Comment on joue

1. **👀 Regarde partout** : un coéquipier va te passer le palet. Avant qu'il arrive, glisse ton doigt pour tourner la tête et repérer tes coéquipiers et les adversaires.
2. **🏒 Le palet arrive** : la vue se tourne vers le but adverse.
3. **👉 Décide vite** : touche un coéquipier pour lui passer le palet, touche le but pour tirer, ou appuie sur **Patiner**.
4. **💡 Comprends** : un schéma vu du dessus montre la meilleure option et explique pourquoi.

Chaque situation rapporte jusqu'à 3 étoiles : 2 pour la décision, 1 si tu avais repéré la bonne option **avant** de recevoir le palet.

| Catégorie | Âge | Temps pour regarder | Temps pour décider |
|---|---|---|---|
| U9 | 6-8 ans | 5 s | 7 s |
| U11 | 9-10 ans | 4 s | 5 s |
| U13 | 11-12 ans | 3 s | 3,5 s |

## Lancer le jeu

Aucune installation nécessaire, il suffit d'un petit serveur web local :

```bash
npm start          # ou : python3 -m http.server 8080
```

Puis ouvrir http://localhost:8080. Sur ordinateur, les flèches ← → tournent la tête et la barre d'espace fait patiner.

Pour tester sur téléphone ou tablette, le plus simple est d'activer **GitHub Pages** sur ce dépôt
(Settings → Pages → branche, dossier racine). Le jeu peut ensuite être « ajouté à l'écran d'accueil »
et fonctionne **hors ligne**, ce qui est pratique à la patinoire.

## Tests

```bash
npm test
```

Les tests vérifient que, pour chaque situation, le moteur d'évaluation trouve bien la meilleure option prévue, avec un écart net par rapport aux autres options.

## Ajouter une situation

Les situations sont de simples données dans [`src/scenarios.js`](src/scenarios.js) : positions du joueur, du passeur,
des coéquipiers et des adversaires, avec un déplacement optionnel (`to`). On indique la meilleure option attendue
dans `expect`, puis `npm test` confirme que le moteur est d'accord.

## Organisation

```
index.html            page unique
css/style.css         interface (menus, HUD, résultats)
src/main.js           déroulement du jeu et contrôles tactiles
src/world.js          rendu 3D (three.js) : patinoire, joueurs, caméra
src/evaluate.js       note les options : lignes de passe, marquage, angle de tir, espace
src/scenarios.js      les situations de jeu
src/diagram.js        schéma explicatif vu du dessus
src/audio.js          sons synthétisés et voix off française
sw.js                 fonctionnement hors ligne
vendor/               three.js r160 (licence MIT)
```
