# Face-Off — Hockey Arcade

Hockey arcade en pixel art, jouable en mode paysage. Pour l'instant : **humain
contre CPU**. L'architecture est pensée dès maintenant pour ajouter, plus
tard, le **joueur contre joueur en ligne** sans réécrire le moteur de jeu.

Ce dépôt reprend le POC monofichier (`hockey-arcade.html`) et le restructure
en projet maintenable, à parité visuelle avec l'original, plus quatre
améliorations : voir [Nouveautés par rapport au POC](#nouveautés-par-rapport-au-poc).

## Stack

| Domaine | Choix | Pourquoi |
|---|---|---|
| Langage | **TypeScript** | Le moteur de jeu (physique, IA, règles) est le genre de code où une faute de frappe silencieuse coûte cher ; utile aussi pour partager les types avec un futur serveur. |
| Build / dev server | **Vite** | Zéro config pour un jeu canvas, rechargement instantané, produit un site statique déployable partout. |
| Rendu | **Canvas 2D natif**, aucune librairie de rendu | Le style du jeu (buffer basse résolution agrandi sans lissage) est justement la technique du POC — un moteur comme Pixi/Phaser n'apporterait rien ici et alourdirait le bundle. |
| PWA | **vite-plugin-pwa** (Workbox) | Manifeste `display: fullscreen` + orientation `landscape` : une fois l'app ajoutée à l'écran d'accueil, elle s'ouvre sans barre de navigateur, y compris sur iOS où l'API Fullscreen web est indisponible pour un `<canvas>`. |
| Tests | **Vitest** | Rapide, zéro config avec Vite ; sert surtout à verrouiller les règles de gameplay pures (ex. la probabilité de but, voir plus bas). |
| Lint / format | **ESLint (flat config) + Prettier** | Standard, peu de friction. |
| CI | **GitHub Actions** | typecheck → lint → test → build à chaque push. |
| Assets joueurs | **PNG pixel art pré-rendus** par un script Node (`@napi-rs/canvas`) | Voir [Sprites](#sprites-pixel-art). |

Pas de dépendance runtime : le jeu compilé est du HTML/CSS/JS statique,
déployable sur GitHub Pages, Netlify, Vercel, Cloudflare Pages...

## Démarrer

```bash
npm install
npm run sprites   # génère public/sprites/*.png et public/icons/*.png
npm run dev       # http://localhost:5173
```

Autres commandes utiles :

```bash
npm run typecheck
npm run lint
npm test
npm run build      # build de prod dans dist/
npm run preview    # sert le build de prod localement
```

`npm run sprites` doit être relancé après toute modification de
`scripts/generate-sprites.mjs`. Les PNG générés sont committés dans
`public/sprites/` (voir [Sprites](#sprites-pixel-art) pour les remplacer par
de vrais fichiers dessinés à la main).

## Architecture

```
src/
  core/     — simulation pure, sans DOM ni canvas (voir plus bas)
  audio/    — synthèse Web Audio, pilotée par les évènements de game-core
  input/    — clavier + tactile → InputIntent
  render/   — tout le dessin canvas (police pixel, patinoire, sprites, HUD, menus)
  app/      — assemble le tout : boucle de jeu, préférences, PWA/plein écran
scripts/
  generate-sprites.mjs — génère les PNG des joueurs/gardiens et les icônes PWA
tests/      — tests Vitest de game-core
```

### `game-core` : la simulation isolée du rendu

Tout le gameplay (physique du palet, patinage, IA, règles, score, prolongation...)
vit dans `src/core/`, qui ne touche **jamais** au DOM, à `canvas`, ni à `window`.
C'est une fonction pure de `(état, entrée) → nouvel état + évènements` :

```ts
pas(rink, state, dt, () => entreeJoueurCourant); // avance la simulation d'un pas fixe
```

Deux conséquences directes, pensées pour le multijoueur en ligne à venir :

1. **`InputIntent`** (`core/types.ts`) est la forme exacte qu'un client enverrait
   à un serveur à chaque tick (déplacement, tir, passe, élan...). Le code qui
   traduit un geste tactile ou une touche clavier en `InputIntent`
   (`src/input/`) est totalement séparé du code qui applique cet intent à la
   simulation (`core/humanControl.ts`).
2. **Les effets de bord** (son, particules, vibration, texte à l'écran...) ne
   sont jamais déclenchés directement : la simulation les *émet* comme une
   liste de `GameEvent` sérialisables (`state.evenements`), consommée à
   chaque frame par l'audio et les effets visuels. Un serveur autoritaire
   ferait exactement la même chose : rejouer `pas()` et diffuser les
   évènements aux clients pour qu'ils jouent le son/les particules.

Cette séparation ne fait *aucun* réseau aujourd'hui (choix assumé : on ne
construit que l'architecture, pas le serveur, tant que le mode en ligne n'est
pas prioritaire) — mais le jour où il faudra l'ajouter, `game-core` peut être
publié tel quel comme dépendance d'un petit serveur Node (WebSocket), qui
appliquerait les `InputIntent` reçus de chaque client et diffuserait l'état
(ou les évènements) en retour. Le pas de temps fixe (`PAS = 1/120`) déjà en
place dans le POC est exactement ce dont un netcode a besoin pour rester
déterministe.

### Rendu

`src/render/` reprend techniquement le POC : un petit canvas logique (~200px
de haut) dessiné avec des primitives pixel (`px`, `ligne`, `disque`...), une
police bitmap maison, puis agrandi sur le vrai canvas avec
`imageSmoothingEnabled = false`. Rien ne change dans le rendu final attendu —
c'est le même procédé, juste réparti en modules (police, patinoire/foule,
sprites, HUD, menus, effets).

## Nouveautés par rapport au POC

### 1. On voit enfin qui a le palet, et qui on pilote

Deux indicateurs ajoutés dans `render/entities-render.ts` :

- un halo doré pulsant au sol + un petit palet qui rebondit au-dessus de la
  tête pour **quiconque porte le palet**, dans les deux équipes (utile en
  défense pour repérer le porteur adverse) ;
- un halo bleu clair pulsant au sol sous **le patineur que vous contrôlez**
  quand il n'a pas le palet (avant, seule une flèche au-dessus de la tête
  l'indiquait — facile à perdre de vue dans une mêlée).

### 2. PWA + plein écran qui fonctionne vraiment en paysage

Le POC appelait l'API Fullscreen du navigateur, qui ne fait rien sur Safari
iOS pour un `<canvas>` — d'où le problème observé. Le manifeste PWA
(`vite.config.ts`, `display: "fullscreen"`, `orientation: "landscape"`) fait
qu'une fois le jeu ajouté à l'écran d'accueil, il s'ouvre **sans aucune barre
de navigateur**, sur toutes les plateformes. L'appel à l'API Fullscreen est
conservé en complément (`src/app/pwa.ts`) pour le cas où le jeu est ouvert
dans un onglet classique sur un navigateur qui la supporte (Chrome/Edge
Android).

### 3. La probabilité de but augmente avec la puissance et le placement du tir

Nouveau module `src/core/shooting.ts`. À l'instant du tir, on calcule une
« qualité » (0 à 0,92 — jamais un but garanti) qui combine :

- la **puissance** du tir (la charge, comme avant) ;
- la **précision du placement** : à quel point le point visé sur la ligne de
  but est loin de la position du gardien à cet instant.

Cette qualité réduit ensuite, de façon continue, le rayon de blocage effectif
du gardien et son seuil de capture propre du palet (`physics.ts`) — donc un
tir puissant et bien placé a statistiquement plus de chances de battre le
gardien, sans jamais rendre un tir imparable à 100 %. Testé et verrouillé par
`tests/shooting.test.ts` (monotonie puissance/précision, plafond à 0,92).

### 4. Sprites pixel art

Les silhouettes du POC (un motif ASCII de ~10×14 pixels, quelques couleurs)
sont remplacées par de vrais fichiers PNG plus détaillés : casque à visière,
chandail à numéro avec épaulettes et bande, culotte rayée, patins avec lame
qui brille. Générés par `scripts/generate-sprites.mjs` (Node +
`@napi-rs/canvas`) plutôt que dessinés à la main — voir la note ci-dessous.

**Remplacer ces sprites par de vrais dessins.** Cette session n'a pas accès à
un outil de génération d'images ; les PNG actuels sont donc *procéduraux*
(dessinés par du code, en plus détaillé que le POC), pas peints à la main. Le
format est volontairement simple pour qu'une infographiste puisse les
remplacer sans toucher au moteur :

- `public/sprites/skater-{0,1}.png` : grille de `skaterFrames` colonnes ×
  2 lignes (ligne 0 = orienté droite, ligne 1 = orienté gauche), taille de
  case dans `public/sprites/meta.json`.
- `public/sprites/goalie-{0,1}.png` : 1 colonne × 2 lignes, même convention.

Il suffit de déposer de nouveaux PNG au même chemin avec la même grille (et
de mettre à jour `meta.json` si la taille de case change) — `src/render/sprites.ts`
ne connaît que ce contrat, jamais le contenu artistique.

## Roadmap : joueur contre joueur en ligne

Pas de code réseau dans ce dépôt pour l'instant (choix du scope actuel), mais
la voie est dégagée :

1. **Serveur autoritaire** (Node + WebSocket, ou un framework comme Colyseus
   pour la gestion de salons) qui importe `game-core` tel quel, applique les
   `InputIntent` reçus de chaque client à `pas()`, et diffuse le nouvel état
   (ou juste les `GameEvent` + positions) à chaque tick.
2. **Client** : remplacer `GestionnaireEntreesJeu.consomme()` local par un
   envoi de l'`InputIntent` au serveur, et l'état affiché par l'état reçu du
   serveur (avec, si besoin, de la prédiction côté client en rejouant
   localement `pas()` puis en réconciliant sur la prochaine confirmation
   serveur — le pas de temps fixe s'y prête directement).
3. **Matchmaking** minimal (créer/rejoindre une salle par code), à héberger à
   part du site statique (le serveur de jeu ne peut pas être un simple hébergement statique).

## Licence

Apache-2.0, voir [LICENSE](./LICENSE).
