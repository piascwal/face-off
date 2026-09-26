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

### Sélection d'équipe

Onze équipes jouables — six clubs français (Toulouse, Nice, Vaujany, Nîmes,
Grenoble, Montpellier) et cinq écussons « invités » (Canadiens de Montréal,
Ducks d'Anaheim, Spartiates de Marseille, Lynx de Valence, Chevaliers du lac
d'Annecy) — chacune avec un profil de stats (`core/teams.ts` : vitesse, tir,
défense, gardien — des multiplicateurs qui modulent réellement la simulation,
pas juste de la couleur) affiché en notes façon jeu de sport (ATT/DEF/note
globale, 65 à 99). Le choix se fait en deux écrans pensés « manette »
(flèches cliquables plutôt qu'une grille, `render/team-select.ts` +
`app/game-app.ts`) :

1. **Les équipes** — écran scindé en deux (vous à gauche, l'adversaire à
   droite), chaque camp se fait défiler indépendamment avec ses propres
   flèches (clavier : gauche/droite pour vous, haut/bas pour l'adversaire).
2. **Les maillots** — chaque équipe a un maillot domicile et un extérieur
   (corps et bande inversés, voir `team-visuals.ts`) ; l'écran affiche un
   vrai patineur portant le maillot choisi pour chaque camp, l'un en face de
   l'autre, pour vérifier au coup d'œil que les couleurs des deux équipes ne
   se confondent pas avant de lancer le match.

Les écussons sources (`assets/logos-src/*.jpg`) sont détourés
automatiquement par `scripts/logo-cutout.mjs` : fond uni retiré depuis le
bord ; fond en damier « transparent » incrusté dans le JPEG retiré en
reconstruisant la grille du damier (pas et décalage mesurés sur le
pourtour), ce qui élimine aussi les poches de damier enfermées dans le dessin
et les jointures floutées par la compression. Les écussons sont ensuite
recadrés sur leur partie opaque, en 256×256. Les 44
feuilles de sprites (11 équipes × domicile/extérieur × patineur/gardien)
générées par le même script que les sprites — voir
[Sprites](#sprites-pixel-art).

## Nouveautés par rapport au POC

### 1. On voit enfin qui a le palet, et qui on pilote

Indicateurs dans `render/entities-render.ts` :

- une flaque de lumière dorée (fondu additif, se voit même à moitié cachée
  dans une mêlée) + un anneau net + un palet qui rebondit au-dessus de la
  tête pour **quiconque porte le palet**, dans les deux équipes (utile en
  défense pour repérer le porteur adverse) ;
- un halo bleu clair (couleur fixe, indépendante des maillots) **toujours**
  visible sous **le patineur que vous contrôlez**, palet ou pas, plus un
  double chevron plus gros au-dessus de sa tête.

Le palet libre change aussi automatiquement de main : si personne ne le
tient et qu'un coéquipier en est nettement plus proche que le patineur
contrôlé, la main lui est redonnée sans attendre le bouton de passe
(`core/actions.ts::changeAutoSiLoin`, appelé à chaque pas de simulation —
voir `tests/auto-switch.test.ts`). Désactivable dans les réglages avancés.

### 2. PWA + plein écran qui fonctionne vraiment en paysage

Le POC appelait l'API Fullscreen du navigateur, qui ne fait rien sur Safari
iOS pour un `<canvas>` — d'où le problème observé. Le manifeste PWA
(`vite.config.ts`, `display: "fullscreen"`, `orientation: "landscape"`) fait
qu'une fois le jeu ajouté à l'écran d'accueil, il s'ouvre **sans aucune barre
de navigateur**, sur toutes les plateformes. L'appel à l'API Fullscreen est
conservé en complément (`src/app/pwa.ts`) pour le cas où le jeu est ouvert
dans un onglet classique sur un navigateur qui la supporte (Chrome/Edge
Android) : il est tenté **dès le premier geste** sur l'app (premier toucher,
clic ou touche sur le menu), pas au lancement du match. Les navigateurs
interdisent le plein écran sans geste de l'utilisateur, on ne peut donc pas
le déclencher au simple chargement de la page ; si le joueur le quitte
ensuite, il n'est réimposé qu'au lancement d'un match.

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
sont remplacées par de vrais fichiers PNG plus détaillés : casque en dôme
(reflet clair, ombre sombre, visière teintée) plutôt qu'une casquette plate,
chandail ombré à numéro avec épaulettes et bande, culotte rayée, patins avec
languette/lacet et lame qui brille, crosse en bois de 2px tenue à deux mains
avec sa palette scotchée posée sur la glace. Générés par
`scripts/generate-sprites.mjs` (Node + `@napi-rs/canvas`) plutôt que dessinés
à la main — voir la note ci-dessous.

**Remplacer ces sprites par de vrais dessins.** Cette session n'a pas accès à
un outil de génération d'images ; les PNG actuels sont donc *procéduraux*
(dessinés par du code, en plus détaillé que le POC), pas peints à la main. Le
format est volontairement simple pour qu'une infographiste puisse les
remplacer sans toucher au moteur :

- `public/sprites/skater-<id>-<variante>.png` (un par équipe × maillot
  domicile/extérieur, voir `teamIds`/`variants` dans `meta.json`) : grille de
  `skaterFrames` colonnes × 2 lignes (ligne 0 = orienté droite, ligne 1 =
  orienté gauche), taille de case dans `public/sprites/meta.json`.
- `public/sprites/goalie-<id>-<variante>.png` : 1 colonne × 2 lignes, même convention.

Il suffit de déposer de nouveaux PNG au même chemin avec la même grille (et
de mettre à jour `meta.json` si la taille de case change) — `src/render/sprites.ts`
ne connaît que ce contrat, jamais le contenu artistique. Même logique pour les
écussons (`public/logos/<id>.png`, fond déjà transparent).

### 5. Célébration de but avec l'écusson de l'équipe

Lors d'un but, l'écusson de l'équipe qui marque s'affiche en très grand
(`render/screens.ts::dessineLogoBut`, rebond « easeOutBack » à l'entrée puis
fondu). Ordre d'empilement : la patinoire et les joueurs (assombris), puis
l'écusson géant, puis le tableau et le bandeau « BUT ! » avec le score. Le cœur du jeu (`physics.ts::marque`)
ne connaît toujours aucune couleur ni logo : il émet juste l'équipe (`eq`)
qui a marqué, et c'est `SystemeEffets` côté rendu qui résout la couleur du
bandeau et l'écusson à afficher — cohérent avec le reste de l'architecture
(voir plus haut) où le cœur du jeu ne connaît jamais l'identité visuelle des
équipes.

### 6. Combo de passes → tir spécial

Enchaîner des passes réussies (3 par défaut, `COMBO_SEUIL` dans
`core/constants.ts`) sans perdre le palet charge un tir spécial pour
l'équipe : le tir suivant part ~25 % plus vite et voit sa « qualité »
(voir le point 3) augmentée d'un bonus, avec un effet visuel et sonore
distinct. La combo se réinitialise dès que le palet change de camp, ou
qu'un tir est tenté (spécial ou non) — logique dans `core/actions.ts`
(`prendPalet`/`tir`), testée dans `tests/combo.test.ts`. Ça s'applique aussi
bien à l'IA qu'au joueur humain, puisque les deux passent par les mêmes
fonctions.

### 7. 5 contre 5, et un écran de réglages avancés

`EFFECTIFS` (`core/constants.ts`) passe de `[2, 3]` à `[2, 3, 5]`. Les
formations à plus de 3 joueurs par équipe (mise au jeu dans `rules.ts`,
placement défensif dans `ai.ts`) utilisaient des tableaux fixes à 3 cases
(`[0, -35, 35][s.rang]`) qui ne couvraient pas un rang 3 ou 4 — remplacés
par `core/utils.ts::decalageRang`, qui étale n'importe quel effectif de
chaque côté du joueur central sans tableau à taille fixe.

Le menu gagne un bouton « RÉGLAGES AVANCÉS » (`render/screens.ts::dessineAvance`)
avec quatre bascules, persistées comme le reste dans `app/preferences.ts` et
appliquées pour de vrai côté simulation (`MatchState.assistTir/assistPasse/changementAuto`,
voir `core/rules.ts::creePartie`) :

- **Assistance de tir** : coupe l'aimant vers le coin de la cage
  (`core/humanControl.ts::assistance`) — sans, l'angle tiré est exactement
  celui du geste.
- **Assistance de passe** : sans, `meilleurReceveur` (`core/actions.ts`)
  resserre le cône de ciblage (1,1 rad → 0,4 rad) et abandonne le score
  positionnel (ligne dégagée, prise d'avance) — il faut vraiment viser le
  coéquipier, pas juste appuyer dans sa direction générale.
- **Changement de joueur automatique** : le point 1 ci-dessus,
  désactivable pour un contrôle entièrement manuel.
- **Secousses d'écran** : réduit l'intensité des tremblements et flashs
  (`render/effects.ts::SystemeEffets.intensiteEcran`) — accessibilité.

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
