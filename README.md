# Face-Off — Hockey Arcade

Hockey arcade en pixel art, jouable en mode paysage : **humain contre CPU**,
ou **à deux sur le même Wi-Fi** (l'appareil hôte fait office de serveur, sans
aucun backend à déployer — voir [Multijoueur Wi-Fi](#8-multijoueur-wi-fi-lhôte-est-le-serveur)).

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

### Tests de bout en bout (navigateur)

```bash
npm run e2e                       # tous
npm run e2e -- spectateur coupe   # certains
```

Les scénarios de `e2e/` pilotent le vrai jeu dans Chromium (Playwright).
Chaque appareil est un contexte de navigateur séparé : on joue à 2 ou 3
« téléphones » sans matériel. Un courtier MQTT local remplace les serveurs
publics de découverte, et le serveur Vite est lancé automatiquement. Les
captures d'écran vont dans `e2e/captures/` (ignoré par git). La CI les lance à
chaque push (job `e2e`) et joint les captures en cas d'échec.

| Scénario | Ce qu'il vérifie |
|---|---|
| `solo` | Au clavier : menu, choix des équipes et maillots (avec retour), match, pause, fin, rejouer, bilan, écran des commandes |
| `coupe` | Mode coupe de 8 équipes : ancienne sauvegarde migrée, choix, tableau, dévoilement, élimination, titre |
| `coupe16` | Coupe de 16 équipes : bouton MODE (classique, coupe 8, coupe 16), huitièmes à la finale, titre, élimination dès les huitièmes (tours suivants simulés) |
| `multi` | Un vrai match à deux joueurs : les touches de l'invité pilotent son joueur chez l'hôte, positions identiques, tir (charge et geste) vu des deux côtés, but et score synchronisés, reprise, bonus en Wi-Fi (envahissement, cage géante, givre, tremblement et son secousse, loupé complet déclenché par le tir de l'invité), fin de match au même score |
| `coop` | Mode coop à deux contre le CPU : format COOP choisi par l'hôte, l'invité prend le second siège de l'équipe, choix des équipes et maillots par l'hôte seul (l'invité regarde, son « prêt » ne compte pas), les touches de chacun ne pilotent que son patineur, tir de l'invité, but et score identiques, changement de joueur sans jamais prendre le patineur de l'autre, bonus doré qui suit le porteur du palet, fin de match sans bilan de duel, revanche |
| `spectateur` | 3 appareils : hôte, invité et spectateur arrivé en cours de match, réactions, revanche |
| `quatre` | 7 appareils en 2 contre 2 : écran JOUER / REGARDER à l'arrivée (aucun siège par défaut), siège pris ou refusé, 3 spectateurs, équipes et maillots réglés par l'hôte seul, quatre patineurs humains distincts, entrées routées par siège, revanche à l'unanimité, départ d'un joueur (retour en salle d'attente, un spectateur prend le siège libéré) |
| `bonus` | Bonus en solo : jauge, 4e passe (gros « BONUS » doré sans combo), départ automatique, but x2 limité à 10 s, freeze, inversion, full esquive, super tir (bouton TIR doré), super héros, tremblement, givre, cage géante (qui le reste pendant le but), mini cage, gardien endormi, blackout, foule, loupé complet, super passe (3 passes sur 3 malgré les adversaires sur la ligne), surnombre, un but qui coupe tout, option du menu, mode entraînement |
| `reconnexion` | Coupure franche puis coupure silencieuse en plein match (retour de l'invité, même score, spectateur présent), invité qui ne revient pas, coupure pendant le choix des équipes |

En local, Chromium doit être installé une fois : `npx playwright install chromium`.
Pour écrire un scénario, `e2e/outils.mjs` fournit `appareil()`,
`attendsQue()`, `verifie()` et les raccourcis Wi-Fi (`lan.ouvrePartie`,
`lan.rejoint`, `lan.prendSiege`, `lan.connecte`, `lan.lanceMatch`). L'application est accessible en `window.faceOff` en mode
développement.

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
  net/      — multijoueur Wi-Fi : découverte chiffrée, liaison WebRTC, protocole,
              sessions (session-hote / session-client / session-commun),
              règles de la partie (partie, partie-modele, sieges, partie-validation)
  render/   — tout le dessin canvas (police pixel, patinoire, sprites, HUD, menus)
  app/      — assemble le tout (voir « L'application » ci-dessous)
scripts/
  convertit-sources.py — conversion des illustrations sources en pixel art
                         (étapes dans scripts/sources/, une par type de dessin)
  generate-sprites.mjs — génère les PNG des joueurs/gardiens et les icônes PWA
                         (icônes tirées de assets/icone-app.jpg, carrée : à
                         remplacer pour changer l'icône, puis npm run sprites)
tests/      — tests Vitest (simulation, IA, coupe, réseau)
e2e/        — tests de bout en bout dans Chromium (voir « Démarrer »)
```

**Taille des fichiers.** Aucun fichier de code, de script ou de test ne
dépasse 500 lignes : au-delà, on découpe par responsabilité (le module
d'origine réexporte les morceaux quand d'autres fichiers l'importent déjà,
comme `core/physics.ts`, `core/pouvoirs.ts` ou `net/partie.ts`). Quelques
exemples : la physique est répartie entre `core/physics.ts` (patineurs,
gardien), `core/collisions.ts` (chocs, mises en échec) et `core/palet.ts`
(palet, buts) ; les bonus entre `core/pouvoirs.ts` (tirage, activation),
`pouvoirs-def.ts` (définitions) et `pouvoirs-effets.ts` (effets en jeu) ; les
écrans Wi-Fi entre `render/lan-liste.ts`, `lan-salon.ts`, `lan-choix.ts`,
`lan-match.ts` et `lan-commun.ts` ; les patineurs dans
`render/entities-render.ts`, le gardien et le palet dans
`gardien-palet-render.ts`, les traces et particules dans
`particules-render.ts`.

### L'application (`src/app/`)

Un noyau et trois parcours, chacun responsable de ses écrans (dessin,
boutons, touches du clavier) :

| Fichier | Rôle |
|---|---|
| `game-app.ts` | Noyau : canevas et mise à l'échelle, patinoire, boucle de jeu à pas fixe, entrées, ralenti des buts, fin de match |
| `rendu-app.ts` | Dessin d'une image : match, surcouches, ralenti, écrans |
| `parcours-solo.ts` | Menu, réglages avancés, choix des équipes et maillots, match contre l'ordinateur, pause, écran de fin |
| `parcours-coupe.ts` | Mode coupe : choix de l'équipe, tableau, dévoilement des résultats |
| `parcours-lan.ts` | Multijoueur Wi-Fi : sessions hôte/client, phases de la partie, réactions |
| `match-lan.ts` | Match en réseau : simulation chez l'hôte, instantanés et évènements, boucle du client, ralenti, fin |
| `vues-lan.ts` | Écrans du Wi-Fi et surcouches du match en réseau (pause, coupure, latence) |
| `image-fin.ts` | Image de victoire / défaite aux couleurs du joueur |
| `ecrans.ts` | Liste des écrans |
| `preferences.ts`, `ralenti.ts`, `pwa.ts` | Préférences sauvegardées, enregistrement et lecture du ralenti, plein écran et PWA |

Les parcours partagent l'état du noyau (`app.state`, `app.ecranUI`,
`app.pref`...). Une touche du clavier ne déclenche qu'une action, même si
cette action change d'écran. En développement, l'application est accessible
en `window.faceOff` (`faceOff.lan.hote`, `faceOff.coupe.revelation`...) pour
les tests de bout en bout.

### `game-core` : la simulation isolée du rendu

Tout le gameplay (physique du palet, patinage, IA, règles, score, prolongation...)
vit dans `src/core/`, qui ne touche **jamais** au DOM, à `canvas`, ni à `window`.
C'est une fonction pure de `(état, entrée) → nouvel état + évènements` :

```ts
pas(rink, state, dt, (eq) => entreeDeLEquipe(eq)); // avance la simulation d'un pas fixe
```

Deux conséquences directes, sur lesquelles repose le multijoueur Wi-Fi :

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

`game-core` ne fait lui-même aucun réseau : en multijoueur Wi-Fi, c'est
l'appareil hôte qui fait tourner `pas()` exactement comme en solo, avec
l'`InputIntent` reçu du client pour l'équipe 1 (`MatchState.humains` /
`controles` : un humain par équipe au plus), et qui diffuse l'état et les
évènements (voir `src/net/`). Le même `game-core` pourrait demain tourner
dans un serveur Node pour du jeu par Internet.

### Rendu

`src/render/` reprend techniquement le POC : un petit canvas logique (~200px
de haut) dessiné avec des primitives pixel (`px`, `ligne`, `disque`...), une
police bitmap maison, puis agrandi sur le vrai canvas avec
`imageSmoothingEnabled = false`. Rien ne change dans le rendu final attendu —
c'est le même procédé, juste réparti en modules (police, patinoire/foule,
sprites, HUD, menus, effets).

### Sélection d'équipe

Vingt équipes jouables : des clubs français (Toulouse, Nice, Vaujany,
Nîmes, Grenoble, Montpellier, Marseille, Valence, Annecy, Roanne, Angers,
Bordeaux, Rouen, Castres) et des écussons « invités » (Canadiens de Montréal, Ducks
d'Anaheim, Avalanche du Colorado, Senators d'Ottawa, Oilers d'Edmonton,
Blackhawks de Chicago). Pour en ajouter une : l'écusson dans
`assets/logos-src/<id>.jpg`, sa palette dans `src/render/team-visuals.ts` et
`scripts/generate-sprites.mjs`, son profil dans `src/core/teams.ts`, puis
`npm run sprites`. Chacune avec un profil de stats (`core/teams.ts` : vitesse, tir,
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
  double chevron plus gros au-dessus de sa tête ;
- en réseau, une flèche **rouge vif** au-dessus du patineur de l'autre humain.

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

**Mise à jour proposée, jamais imposée.** Le service worker (`registerType:
'prompt'`) télécharge la nouvelle version en arrière-plan sans l'installer de
force : le menu affiche « MISE A JOUR DISPONIBLE » (`src/app/mise-a-jour.ts`,
`src/render/mise-a-jour-vue.ts`) avec METTRE A JOUR (installe et recharge) et
PLUS TARD. Rien n'est bloquant : hors ligne, la recherche échoue en silence et le
jeu reste jouable avec la version en cache ; après un « plus tard », un petit
bouton MISE A JOUR reste en haut à gauche du menu, et la proposition revient au
prochain lancement. La recherche a lieu au lancement, toutes les 30 minutes et au
retour au premier plan. `version.json`, publié à chaque build et jamais mis en
cache, donne le numéro de la version proposée. On ne propose qu'au menu, jamais
en plein match (une version différente casserait aussi le Wi-Fi : voir §8).

### 3. La probabilité de but augmente avec la puissance et le placement du tir

Nouveau module `src/core/shooting.ts`. À l'instant du tir, on calcule une
« qualité » (0 à 0,92 — jamais un but garanti) qui combine :

- la **puissance** du tir (la charge, comme avant) ;
- la **précision du placement** : à quel point le point visé sur la ligne de
  but est loin de la position du gardien à cet instant.

Cette qualité réduit ensuite, de façon continue, le rayon de blocage effectif
du gardien et son seuil de capture propre du palet (`core/palet.ts`) — donc un
tir puissant et bien placé a statistiquement plus de chances de battre le
gardien, sans jamais rendre un tir imparable à 100 %. Testé et verrouillé par
`tests/shooting.test.ts` (monotonie puissance/précision, plafond à 0,92).

### 4. Sprites pixel art

Les joueurs et les gardiens viennent de deux **illustrations pixel art**
générées avec un outil d'image (`assets/sprites-src/planche-patinage.jpg`, une planche
d'images de patinage, et `gardien.jpg`). Ces images sont des dessins pixel
art agrandis et compressés en JPEG sur fond magenta ; la chaîne les ramène à
du vrai pixel art, puis les décline pour chaque équipe.

**1. Conversion (une fois, Python)** — `scripts/convertit-sources.py`, qui
enchaîne les étapes rangées dans `scripts/sources/` (outils communs dans
`commun.py`, puis un module par type de dessin : `planche.py`, `gardien.py`,
`portrait.py`, `chutes.py`, `tirs.py`, `echec.py`, `supporters.py`,
`celebrations.py`, `coupe.py`) :

- détoure le fond (et, pour le gardien, la glace, l'ombre et le reflet) ;
- découpe la planche image par image, en rendant à chacune le bout de
  palette qui touche le joueur voisin ;
- retrouve la grille du dessin (période et calage) et garde **une couleur
  par case** (la médiane : le plus proche voisin ramasserait le bruit JPEG) ;
- réduit chaque dessin à **64 couleurs** (k-moyennes) ;
- classe chaque pixel dans un **rôle** : maillot, bandes, empiècements
  clairs, casque, gants, peau, barbe, emplacement de l'écusson, contour, ou
  « à garder » (crosse, culotte, patins, grille du masque).

Le gardien est un dessin à part (`gardien.jpg`, sur fond magenta, sans glace) :
le maillot rouge, le casque (base dorée, bande rouge), les empiècements et les
bandes suivent l'équipe, l'écusson est posé sur la poitrine, alors que le cuir
brun-or des jambières, du blocage et du gant d'attrape, la crosse et la grille
du masque gardent leurs couleurs (zones en tête de `gardien()` dans
`scripts/sources/gardien.py` : à ajuster si le dessin change).

Il écrit `joueur.png` / `gardien.png`, leurs cartes de rôles
(`*-roles.png`) et `sprites.json` (tailles de case, ancrages) dans
`assets/sprites-src/`. Ces fichiers sont committés : `npm run sprites` n'a
pas besoin de Python. Le patinage utilise 4 images de la planche, calées sur
le casque et les patins, avec la moitié de l'écart de hauteur rattrapée pour
adoucir le rebond ; la première sert aussi de pose à l'arrêt.

**2. Déclinaison (Node)** — `scripts/generate-sprites.mjs` +
`scripts/sprites-illustres.mjs` :

- les pixels isolés prennent le rôle de leurs voisins (sinon quelques
  ombres mal classées gardaient le rouge ou l'or d'origine) ;
- chaque rôle est repeint aux couleurs de l'équipe × maillot
  domicile/extérieur en gardant les ombres et les reflets du dessin (même
  rapport de luminosité à la couleur d'origine) ;
- l'écusson de l'équipe est posé sur la poitrine ;
- chaque feuille est ramenée à 64 couleurs au plus ;
- un calque commun (`visages.png`) donne **6 visages** (teint, couleur de
  barbe ; 16 couleurs chacun) : chaque joueur garde le sien, tiré de son rang et de son équipe
  (le même sur les deux écrans en Wi-Fi).

Format des feuilles (`public/sprites/meta.json` : cases, ancrages, échelle) :

- `skater-<id>-<variante>.png` : 4 colonnes (cycle de patinage) × 2 lignes
  (vers la droite / vers la gauche) ;
- `goalie-<id>-<variante>.png` : 1 colonne × 2 lignes ;
- `visages.png` : 4 colonnes × (6 variantes vers la droite, puis 6 vers la
  gauche).

Le jeu dessine directement à la résolution de l'écran : un pixel de sprite
fait 0,28 px logique pour un patineur (≈ 28 px de haut) et 0,25 pour le
gardien (≈ 27 px : accroupi, il reste un peu plus bas que les patineurs ; à 0,2 il paraissait trop petit). Plus grands, les joueurs se chevauchaient dans les
mêlées et le gardien cachait sa cage. Le dessin est aussi décalé
(`decalage` dans meta.json) : le patineur un peu en arrière, pour que la
palette de sa crosse tombe sur le palet qu'il porte, et le gardien en avant,
devant sa cage plutôt que dessus.
`src/render/sprites.ts` ne connaît que ce contrat, jamais le contenu
artistique. Même logique pour les écussons (`public/logos/<id>.png`, fond
déjà transparent).

### 5. Célébration de but avec l'écusson de l'équipe

Lors d'un but, l'écusson de l'équipe qui marque s'affiche en très grand
(`render/screens.ts::dessineLogoBut`, rebond « easeOutBack » à l'entrée puis
fondu). Ordre d'empilement : la patinoire et les joueurs (assombris), puis
l'écusson géant, puis le tableau et le bandeau « BUT ! » avec le score. Le cœur du jeu (`palet.ts::marque`)
ne connaît toujours aucune couleur ni logo : il émet juste l'équipe (`eq`)
qui a marqué, et c'est `SystemeEffets` côté rendu qui résout la couleur du
bandeau et l'écusson à afficher — cohérent avec le reste de l'architecture
(voir plus haut) où le cœur du jeu ne connaît jamais l'identité visuelle des
équipes.

### 6. Combo de passes

La combo de passes (passes réussies d'affilée, `state.combo`) ne donne plus de
tir spécial : elle est remplacée par les bonus (voir le point 11). Elle reste
pour les statistiques (« MEILLEURE COMBO ») et le petit bonus de qualité de
tir ci-dessous. Elle se réinitialise dès que le palet change de camp, ou
qu'un tir est tenté (`core/actions.ts`, `prendPalet`/`tir`).

**Jeu de passes aussi payant qu'une échappée** (réglages dans
`core/constants.ts`, tests dans `tests/jeu-de-passes.test.ts`) :

- passes plus appuyées ; le coéquipier visé capte le palet de plus loin et
  le palet est légèrement attiré vers sa crosse, un adversaire doit être
  bien sur la ligne pour l'intercepter ;
- chaque passe de la séquence ajoute un petit bonus de qualité au tir
  suivant (pour 2 passes au plus) ;
- **tir sur réception** (« une-touche ») : dans les 0,8 s qui suivent une
  passe reçue, le tir est plus dangereux, et pour le joueur humain il se
  charge deux fois plus vite ;
- le gardien pivote un peu moins vite pendant qu'une passe traverse ;
- l'élan (sprint) se recharge en 1,7 s au lieu de 1,4 quand on porte le
  palet : les échappées en solo restent possibles, juste moins gratuites ;
- un but marqué au bout d'au moins deux passes s'annonce « BUT COLLECTIF ! ».

Équilibrage vérifié en faisant jouer l'IA contre elle-même (60 matchs) :
+13 % de passes, +4 % de buts. La charge accélérée n'est pas donnée à l'IA,
sinon le score montait d'environ 20 %.

Ensuite :

- **les coéquipiers se démarquent** (`ai.ts::pointDeSoutien`) : autour du
  porteur, chaque soutien choisit l'endroit le plus libre (loin des
  adversaires, ligne de passe dégagée, à bonne distance, sans se coller à un
  coéquipier) — l'un vers la cage, les autres en retrait pour la remise ;
- **passes plus sûres dans sa propre moitié** : visée deux fois plus
  précise, réception un peu plus large et interception un peu plus dure
  (`PASSE_FACILE_MARGE`) ;
- **cages un peu plus larges** (ouverture de 32 px au lieu de 30) et gardien
  dessiné un peu plus bas, pour que ses jambières couvrent bien la zone où il
  arrête vraiment le palet.

Mesure en IA contre IA (50 matchs) : en 3 contre 3, +21 % de passes pour
le même nombre de buts (8,9 contre 8,6) ; en 2 contre 2, +11 % de passes.

**Mise en échec, esquive et coup de crosse.** Trois boutons, dont le rôle
change selon qu'on a le palet ou non ; le petit bouton garde toujours les
accélérations (sprint, esquive, mise en échec) :

| | Gros bouton | Bouton moyen | Petit bouton |
|---|---|---|---|
| **Avec le palet** | TIR | PASSE | SPRINT / ESQUIVE |
| **Sans le palet** | CROSSE | CHANGER DE JOUEUR | ÉCHEC |

- **ÉCHEC** : l'élan vise tout seul le porteur adverse à moins de 55 px
  (`ECHEC_PORTEE`), à défaut l'adversaire le plus proche, sinon la direction
  du joystick. Puissant et très arcade — mais il peut être esquivé.
- **ESQUIVE** : quand un défenseur arrive en échec sur le porteur, un « ! »
  clignote au-dessus de lui et le petit bouton affiche ESQUIVE. Face à un
  porteur humain, l'IA prépare sa charge au moins 0,45 s (`ECHEC_PREPA` : le
  défenseur tremble, un anneau rouge clignote sous lui) avant de s'élancer,
  sans quoi l'élan ne laissait que 0,03 s pour réagir. Un appui pendant la
  préparation ou l'élan (défenseur à moins de 56 px) fait un pas de côté : le
  défenseur passe à côté, tombe et reste au sol 1,2 s (contre 0,8 s de
  sonnerie pour un joueur mis en échec), avec image fantôme, bulle
  « ESQUIVÉ ! » et un court arrêt sur image. Au sol, il glisse d'environ
  35 px dans le sens de sa charge (`CHUTE_GLISSE`, `CHUTE_FROTTEMENT`) : en
  plongeon pendant 0,4 s (`CHUTE_PLONGEON`), puis allongé, sans bousculer
  personne, avant de se relever. Un appui hors fenêtre bloque l'esquive
  0,35 s : matraquer le bouton ne marche pas. L'IA esquive aussi, selon son
  niveau (10 % en Facile, 25 % en Normal, 45 % en Pro). Contre un porteur IA,
  la charge part sans délai : l'équilibre IA contre IA ne bouge pas.
- **Impacts** : le joueur touché (mis en échec, ou défenseur esquivé) passe
  en blanc 0,1 s (`FLASH_T`), comme dans les jeux d'arcade ; une mise en
  échec réussie fige aussi l'action 0,07 s (`ECHEC_FIGE`), avec secousse et
  étincelles — plus besoin de la bulle « ÉCHEC ! ».
- **CROSSE** : coup de crosse sûr, qui ne s'esquive pas — la crosse vole le
  palet de plus loin et bien plus souvent pendant 0,3 s, puis se recharge.

Au clavier : ESPACE tire ou donne le coup de crosse, L passe, MAJ sprinte /
esquive / met en échec. En IA contre IA, les buts ne bougent pas et 3 à
8 % des mises en échec sont esquivées.

Passes et tirs laissent une **traînée** derrière le palet (bleue pour une
passe, orange avec des lignes de vitesse pour un tir), sur le modèle de
l'élan des patineurs.

### 7. 5 contre 5, et un écran de réglages avancés

`EFFECTIFS` (`core/constants.ts`) passe de `[2, 3]` à `[2, 3, 5]`. Les
formations à plus de 3 joueurs par équipe (mise au jeu dans `rules.ts`,
placement défensif dans `ai.ts`) utilisaient des tableaux fixes à 3 cases
(`[0, -35, 35][s.rang]`) qui ne couvraient pas un rang 3 ou 4 — remplacés
par `core/utils.ts::decalageRang`, qui étale n'importe quel effectif de
chaque côté du joueur central sans tableau à taille fixe.

**Postes et démarquage** (`core/ai.ts`). Chaque joueur non contrôlé a un
poste selon son rang (`posteDe`) :

| Effectif | Postes |
|---|---|
| 2 contre 2 | un centre, un défenseur |
| 3 contre 3 | un centre, un ailier, un défenseur |
| 5 contre 5 | un centre, deux ailiers, deux défenseurs |

- **Quand l'équipe a le palet**, les attaquants se démarquent vers la cage
  sur leur couloir : le centre dans l'axe, les ailiers le long des bandes.
  Les défenseurs restent en couverture derrière le jeu (remise en retrait) et
  ne dépassent pas la ligne bleue offensive.
- **En défense**, les défenseurs marquent d'abord les adversaires les plus
  proches de leur cage.
- **Palet libre** : chacun reprend son couloir.
- Tous les réglages sont dans `DEMARQUAGE` : écart entre coéquipiers,
  largeur des couloirs, recul des défenseurs.

Mesure sur 30 matchs IA contre IA en 5 contre 5 :

| | Avant | Après |
|---|---|---|
| Joueurs collés à un coéquipier (moins de 22 px) | 49 % | 10 % |
| Grappe de 3 coéquipiers ou plus | 70 % du temps | 10 % |
| Largeur occupée par une équipe | 51 px | 93 px |

`tests/demarquage.test.ts` garde ces valeurs sous contrôle.

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

### 8. Multijoueur Wi-Fi : l'hôte est le serveur

Menu → **MULTI WIFI**. L'appareil qui fait **CRÉER UNE PARTIE** (téléphone,
tablette ou ordinateur) devient le serveur. Il règle d'abord le **format** de
la partie (voir ci-dessous), puis la taille des équipes (2, 3 ou 5 contre 5),
la durée et les assistances, pour tous les joueurs. Sur les autres appareils
du même Wi-Fi, la partie apparaît toute seule dans la liste, sans adresse IP à
saisir ; le bouton **ACTUALISER** relance la recherche. Chaque ligne indique
l'hôte, le format, le nombre de joueurs déjà assis (« 1/4 ») et l'équipe de
l'hôte ; une partie lancée affiche son score et **REGARDER**.

**Jusqu'à 4 joueurs et 8 spectateurs.** L'hôte choisit le format :

| Format | Humains à gauche (équipe A, l'hôte) | à droite (équipe B) |
|---|---|---|
| 1 CONTRE 1 | 1 | 1 |
| 2 CONTRE 1 | 2 | 1 |
| 1 CONTRE 2 | 1 | 2 |
| 2 CONTRE 2 | 2 | 2 |
| COOP CONTRE CPU | 2 | le CPU |

Les places que personne n'occupe sont tenues par le CPU. L'hôte est assis
d'office au premier siège (A1) ; il n'y a **aucun siège par défaut pour les
autres**. Quatre sièges : A1 (l'hôte), A2, B1, B2.

- **À l'arrivée**, un écran propose **JOUER** (prendre un siège) ou
  **REGARDER**. Tant qu'on n'a pas choisi, l'hôte voit l'arrivant grisé parmi
  les spectateurs (« ? »).
- **La salle d'attente** montre les quatre sièges au centre (équipe A à
  gauche, équipe B à droite) avec le portrait de chaque joueur et son rôle
  (HÔTE, JOUEUR, VOUS), et les spectateurs en petits bonhommes en bas
  (8 au plus). Un siège libre se prend d'un toucher (**PRENDRE**) ; on peut en
  changer, ou passer spectateur (**REGARDER**), tant que la partie n'est pas
  lancée. L'hôte change le format (si un siège disparaît, son joueur doit
  rechoisir), règle le handicap de chaque camp, **exclut** un joueur (la
  croix sur sa carte) et lance quand il y a quelqu'un en face (en coop :
  quand le second siège de l'équipe est pris). Ceux qui n'ont pas choisi au
  lancement regardent.
- **Une fois la partie lancée**, les sièges sont verrouillés : quiconque
  arrive ensuite regarde. Un spectateur reste dans la salle d'attente tant
  qu'on y est (et peut y prendre un siège libéré), puis attend sur l'écran
  « mode spectateur » pendant le choix des équipes.

Le déroulé est ensuite une machine d'états arbitrée par l'hôte
(`net/partie.ts`, testée dans `tests/partie-lan.test.ts`). **On ne passe à
l'étape suivante que quand tous les joueurs ont validé.**

1. **Choix des équipes**. En **1 contre 1**, chacun ne règle que son côté,
   **PRÊT** verrouille son choix et **MODIFIER** le déverrouille. Dans **tous
   les autres formats**, l'hôte règle les deux camps (flèches sur chaque
   panneau ; au clavier gauche/droite pour son équipe, haut/bas pour l'autre)
   et valide seul : les autres regardent les choix se faire.
2. **Choix des maillots**, même principe. Si les deux camps ont pris le même
   club, le camp de droite démarre en extérieur, et deux maillots identiques ne
   peuvent pas être validés.
3. **Match**. La **pause est partagée** : n'importe quel joueur la déclenche
   (bouton, Échap, ou téléphone verrouillé), l'hôte fige la simulation pour
   tous. À la reprise, un compte à rebours de 3 s évite de surprendre les
   autres. Le ralenti d'un but s'arrête quand **tous** les joueurs l'ont passé.
4. **Fin** : chaque joueur vote **REJOUER** ou **CHANGER D'ÉQUIPES** (on voit
   le vote de chacun). On ne relance que quand **tous** les votes concordent.

Si un joueur quitte volontairement, tout le monde retourne en salle d'attente
avec un message ; s'il perd la connexion, son siège lui est gardé (voir
Reconnexion plus bas).

**Pourquoi c'est un peu plus subtil qu'il n'y paraît.** Une page web (même
installée en PWA) n'a pas le droit d'ouvrir un port d'écoute, de faire du
broadcast UDP ni du mDNS : elle ne peut ni « être un serveur » au sens
classique, ni découvrir seule les appareils voisins. D'où le montage :

- **Jeu en direct sur le Wi-Fi — WebRTC** (`net/liaison.ts`). L'hôte et le
  client ouvrent une liaison pair-à-pair avec deux canaux : un canal fiable
  pour le salon et les évènements, et un canal sans retransmission pour les
  instantanés et les entrées. Un paquet perdu est remplacé par le suivant au lieu
  de bloquer les autres. Le trafic de jeu ne sort pas du réseau local, et il est
  chiffré de bout en bout par DTLS, que WebRTC impose.
- **Découverte sans IP — l'adresse publique comme clé de salon**
  (`net/reseau-local.ts`). Les appareils d'un même Wi-Fi sortent sur Internet
  par la même adresse publique (celle de la box). Le navigateur la découvre
  tout seul par STUN, le mécanisme que WebRTC utilise de toute façon ; en IPv6,
  c'est le préfixe /64 qui sert de clé. Cette adresse n'est jamais publiée :
  on en dérive par SHA-256 un nom de salon, et une clé AES-GCM distincte.
- **Boîte aux lettres — des serveurs MQTT publics** (`net/mqtt.ts`,
  `net/annuaire.ts`). Il faut bien un endroit où l'hôte dépose son annonce et
  le client son offre de connexion : on utilise trois serveurs MQTT publics
  gratuits (EMQX, HiveMQ, Mosquitto) en `wss://`, **en parallèle** (la découverte
  marche tant qu'un seul répond, messages dédoublonnés), via un client MQTT
  3.1.1 minimal écrit pour l'occasion (~250 lignes, aucune dépendance).
  L'annonce est un message *retenu* qui s'efface automatiquement (testament
  MQTT) si l'hôte disparaît sans prévenir. Ces serveurs ne servent qu'à la
  mise en relation : une fois la liaison WebRTC ouverte, le client s'en
  déconnecte.

**Sécurité.**

- Tout ce qui transite par les serveurs publics est chiffré (AES-GCM, le topic
  en donnée authentifiée) avec la clé dérivée du réseau : sans votre adresse
  publique, on ne peut ni lire les annonces, ni injecter une offre. Cette
  adresse n'est pas un secret (elle se devine, et les clients 4G/5G la
  partagent souvent avec des inconnus) : la vraie barrière est la suivante.
- **Liaisons limitées au réseau local** (`net/liaison.ts`, `candidatLocal`).
  Les appareils ne se proposent et n'acceptent que des adresses locales :
  candidats `host` sur un nom mDNS `.local` (le défaut des navigateurs), une
  IPv4 privée ou de lien local, une IPv6 locale. En secours (réseau qui bloque
  le mDNS), un candidat vu depuis Internet (`srflx`) n'est accepté que s'il
  sort par **notre propre adresse publique** : le trafic ne fait que traverser
  la box. Jamais de relais. Un tiers sur Internet, même avec la clé de
  découverte, ne peut donc pas se connecter à une partie. Testé, avec le
  limiteur et le plafond MQTT, dans `tests/securite.test.ts`.
- **Débit limité par appareil** (`net/limiteur.ts`) : chez l'hôte, 20 messages
  de contrôle par seconde (rafale de 40) et 240 entrées de jeu par seconde ;
  au-delà, les messages sont ignorés. Un appareil malveillant ne peut pas
  saturer l'hôte, ni, à travers lui, les autres appareils.
- Le client MQTT coupe la connexion à un paquet de plus de 64 Ko
  (`PAQUET_MQTT_MAX`), dès son en-tête, sans le stocker.
- **Politique de sécurité du contenu (CSP)** sur la page publiée
  (`vite.config.ts`) : seuls les fichiers du jeu sont chargés, et les seules
  connexions sortantes autorisées sont celles des trois serveurs de découverte
  (`net/courtiers.ts`). Aucune dépendance n'est livrée aux joueurs : tout le
  code exécuté est celui du dépôt.
- La CI s'exécute avec des droits en lecture seule (`permissions: contents: read`).
- Le jeu lui-même est chiffré par DTLS.
- Un **code de vérification à 4 chiffres**, dérivé des empreintes des certificats
  DTLS des deux appareils, est affiché des deux côtés. S'il diffère, quelqu'un
  s'est interposé.
- L'hôte est **autoritaire** : il ne reçoit du client que des intentions de
  jeu, bornées et validées (direction ramenée à ±1, appuis comptés, rien
  d'autre). Les deux côtés valident chaque message reçu (schéma, tailles, valeurs
  finies — `net/protocole.ts`, `instantane.ts` et `entrees.ts`, testé dans `tests/net.test.ts`).
- Les sièges sont comptés par l'hôte : un siège pris ne peut pas être volé,
  une même machine ne se présente pas deux fois, et l'hôte peut **exclure**
  n'importe quel joueur.
- Le client n'envoie que des *actions* sur ses propres choix (siège, équipe,
  maillot, prêt, vote, pause). L'hôte les applique selon les règles de
  `net/partie.ts` et `partie-validation.ts` ; « lancer », le format et le handicap ne viennent jamais du
  réseau, et l'équipe d'un camp n'est réglable que par l'hôte (sauf en 1 contre 1).

**Fiabilité et fluidité.**

- L'hôte simule à 120 Hz et envoie ~60 instantanés binaires par seconde
  (~600 octets chacun).
- Le client les affiche avec un léger retard, **adaptatif** selon la
  régularité du Wi-Fi (≈ 30 ms sur un réseau calme), en **interpolant** entre
  deux instantanés (`net/synchro.ts`). Les sons et effets sont datés et joués
  au moment où l'image correspondante s'affiche.
- Les appuis (tir, passe, élan) voyagent comme des **compteurs cumulés**, pas
  comme des booléens : même si un paquet se perd, l'appui arrive quand même,
  et une seule fois.
- Les deux écrans n'ont pas la même taille : positions, vitesses et directions
  sont reprojetées d'une patinoire à l'autre.
- Des pings permettent d'afficher la latence (en haut à gauche). Au-delà de
  6 s de silence, la liaison est considérée comme coupée.
- **Reconnexion.** Une coupure pendant une partie (Wi-Fi qui décroche,
  téléphone mis en veille) ne la termine plus.
  - L'hôte garde le siège du joueur pendant 60 s (`RECONNEXION_S` dans
    `net/partie.ts`) et fige le match ; avec plusieurs joueurs absents, le
    match ne reprend que quand tous sont revenus. L'hôte et les spectateurs
    voient « CONNEXION PERDUE — EN ATTENTE DE X » avec le compte à rebours.
  - L'invité relance seul la découverte, retrouve l'annonce de son hôte et se
    reconnecte. Il prouve qu'il est bien le joueur parti avec un jeton secret,
    tiré à son arrivée et envoyé seulement par la liaison chiffrée.
  - Le match reprend au même score et au même temps de jeu, après le compte à
    rebours de 3 s. En plein match, l'invité est repris en route comme un
    spectateur.
  - Au bout du délai, ou si l'hôte appuie sur NE PLUS ATTENDRE, tout le monde
    revient en salle d'attente et les sièges perdus sont libérés. Un joueur
    peut aussi quitter pendant l'attente.
  - En salle d'attente, rien n'est gardé : la place se libère tout de suite.
    Si c'est l'hôte qui tombe, pas de reprise possible, car il porte la
    simulation : l'invité revient à la liste au bout du délai.

En développement, `?reseau=xxx&courtier=ws://localhost:8883` (actif seulement
avec `npm run dev`) remplace la détection du réseau et les serveurs publics
par un broker MQTT local, pour tester à deux onglets sur une seule machine.
`&reconnexion=15` raccourcit le délai de reconnexion (tests).

**Limites connues.**

- Les Wi-Fi « invités » qui isolent les appareils entre eux (isolation AP)
  empêchent la liaison directe.
- Un réseau d'entreprise qui bloque STUN empêche la détection du réseau.
- Le jeu par Internet est volontairement impossible : les liaisons sont
  limitées au réseau local (voir Sécurité). Il faudrait un serveur relais
  (TURN) et une vraie authentification des parties.

**Mode spectateur.** Une partie lancée reste annoncée sur le réseau (avec le
score et le nombre de spectateurs) : dans la liste, elle affiche REGARDER.
Jusqu'à 8 spectateurs (`SPECTATEURS_MAX`, indécis compris) se branchent sur
l'hôte, qui leur envoie le match comme aux joueurs (instantanés, évènements,
état de la partie) ; on peut arriver en plein match, il est pris en route. Le
spectateur ne pilote rien et ne vote pas. En bas de son écran, une barre de
réactions : les deux logos des équipes du match, toujours présents, puis
flamme, gyrophare, cœur et « OUF » (touches 1 à 6 au clavier). L'hôte relaie
chaque réaction à tout le monde avec le nom de son auteur (une toutes les
0,4 s au plus par appareil) ; elles montent le long du bord droit de tous les
écrans, petites et semi-transparentes. Les joueurs peuvent aussi réagir, mais
seulement sur l'écran de fin. Le nombre de spectateurs s'affiche en haut à
gauche chez les joueurs.

**Ça tient ? (coût réseau).** Chaque appareil branché reçoit ~60 instantanés
par seconde de ~0,6 Ko : environ 35 Ko/s, soit 0,3 Mbit/s. Avec 3 joueurs et
8 spectateurs, l'hôte émet ~3 Mbit/s, ce qui est peu pour un Wi-Fi local ;
le vrai coût, pour un téléphone d'entrée de gamme comme hôte, est de tenir 11
liaisons WebRTC (chiffrement DTLS compris) en plus de la simulation et du
rendu. L'hôte limite donc les appareils à 3 + 8 et refuse au-delà (« COMPLET »).

**Mode coop (à deux contre le CPU).** Dans **CRÉER UNE PARTIE**, la ligne
**FORMAT** passe à **COOP CONTRE CPU** et une ligne **NIVEAU DU CPU** (facile,
normal, pro) apparaît. L'hôte et un autre joueur (siège A2) forment alors la
même équipe, à gauche, contre l'ordinateur à droite. Dans la liste des parties,
le format s'affiche (COOP).

- **La salle d'attente** affiche le niveau du CPU ; pas de handicap (c'est le
  niveau du CPU qui règle la difficulté) ni de bilan de duels.
- **Choix des équipes et des maillots** : l'hôte règle tout, l'équipe commune
  (« NOTRE ÉQUIPE ») comme celle du CPU (« ADVERSAIRE CPU »), avec des flèches
  sur chaque panneau (au clavier : gauche/droite pour son équipe, haut/bas pour
  le CPU). L'autre joueur regarde les choix se faire et n'a rien à valider : le
  « PRÊT » de l'hôte suffit à passer à l'étape suivante.
- **En match**, l'hôte pilote un patineur et son équipier un autre, tous deux de
  l'équipe 0 ; les coéquipiers CPU jouent comme d'habitude, et passer le palet
  à l'autre humain est la base du jeu. Chacun a son bouton CHANGE : il donne la
  main à un coéquipier CPU, jamais au patineur de l'autre (le changement
  automatique non plus). Sur une passe vers un coéquipier CPU, c'est celui qui
  a passé qui prend la main sur le receveur ; un palet ramassé par un CPU va à
  l'humain le plus proche. Ma flèche est bleue ; celle de chaque autre humain
  est rouge vif, bien visible sur la glace.
- **Les bonus** de l'équipe ne s'appliquent qu'à celui des deux humains qui a
  le palet : il est doré (super vitesse, tir surpuissant et son bouton TIR doré,
  freeze, blackout...), et l'or passe de l'un à l'autre avec le palet, puis
  reste sur le dernier porteur si le palet est libre. L'autre humain n'a aucun
  avantage et subit comme les CPU un freeze ou un tremblement de son propre
  bonus (`MatchState.pouvoirs[0].dore` garde le siège doré, 0 ou 1).
- **Fin de match** : le même écran que partout (victoire ou défaite, score,
  statistiques du match : tirs cadrés, passes, possession, mises en échec,
  meilleure combo), puis on vote REJOUER ou CHANGER D'ÉQUIPES comme en versus.
  Pas de bilan de duel (le CPU n'en est pas un).

Code, pour toutes les équipes à deux humains (coop, 2 contre 1, 2 contre 2) :
`MatchState.duo[eq]` et `MatchState.partenaires[eq]` (le patineur du second
humain de l'équipe ; `controles[eq]` est celui du premier), `OptionsPartie.duo`,
`controle(state, s, siege)` et `changeJoueur(..., siege)` (`core/actions.ts`),
`siegeDe` et `joueurDore` (`core/pouvoirs.ts`), `pas(..., entree)` dont le
callback reçoit `partenaire` pour distinguer les deux humains d'une équipe.
Côté réseau (`net/partie-modele.ts`, `net/sieges.ts`) : `EtatPartieLan.sieges` (quatre sièges),
`camps` (équipe et maillot de chaque camp), `spectateurs`, `indecis`,
`ConfigLan.format`/`niveau`, `compositionHumaine` (ce que le simulateur veut,
d'après les sièges occupés) et `siegeReel` (quel siège pilote quel humain du
simulateur : un humain seul d'une équipe est toujours le « premier »). Chaque
appareil a sa propre liaison avec l'hôte (`SessionHote.membres`), et l'hôte lit
l'entrée de chaque siège (`entreeSiege`) pour piloter le bon patineur.
Protocole v23 : l'instantané porte `duo` des deux équipes (le patineur du
second humain est marqué, avec son équipe). Testé dans `tests/coop.test.ts`,
`tests/duo.test.ts`, `tests/partie-lan.test.ts` et par les scénarios e2e `coop`
et `quatre`.

**Le buteur célèbre aussi sur la glace.** Pendant que le bandeau « BUT ! »,
l'écusson et le buteur en grand traversent l'écran, le jeu reste visible
derrière (assombri) et le buteur y est dessiné avec le même sprite de
célébration que celui qui glisse devant (même dessin tiré au sort, mêmes
couleurs). Il regarde à gauche ou à droite selon la direction où il patine :
si c'est vous, le joystick (ou les flèches) l'oriente et le déplace comme
d'habitude ; l'ordinateur fait son tour d'honneur. Au bout de la traversée
(2 s), il reprend son sprite de patineur. Code : `render/celebration.ts`
(`celebrationEnCours`, `dessineButeurGlace`) ; le buteur est désigné dans
l'instantané (protocole v22), l'invité le voit donc aussi.

**Engagement animé.** À chaque balle au centre (début de match, après un but,
prolongation, après un loupé complet), les joueurs ne sont plus posés : ils
arrivent en patinant de leur point de départ à leur place, en 0,85 s au plus
(`APPROCHE_S`). Le joueur de la mise au jeu part de plus loin (58 px, en biais)
que ses coéquipiers (30 px), glisse en freinant (vitesse maximale au départ,
gerbe de glace et raclement à la fin), regarde où il va puis se tourne face à
l'adversaire. Le bandeau « PRETS ? » attend 0,7 s pour ne pas cacher la scène.
Code : `core/rules.ts::preparerApproche` et `animeApproche` (testé dans
`tests/engagement.test.ts`) ; en Wi-Fi, seules les positions voyagent, comme
d'habitude.

### 9. Handicap, statistiques et ralenti des buts

- **Handicap (Wi-Fi)**. Dans la salle d'attente, l'hôte peut donner un coup de
  pouce à chaque camp : gardien +20 %, vitesse +10 %, tir puissant (palet
  15 % plus rapide) ou 1 but d'avance. L'invité le voit, et tout changement
  oblige les deux joueurs à revalider. L'équipe aidée porte une petite étoile
  au tableau d'affichage.
  - Moteur : `OptionsPartie.bonus` et `MatchState.bonus` (`core/rules.ts`,
    `core/actions.ts::tir`).
- **Statistiques de fin de match (solo et Wi-Fi)** : tirs cadrés, passes
  réussies, possession, mises en échec, meilleure combo. Elles sont comptées
  par la simulation (`MatchState.stats`) et transmises dans les instantanés en
  Wi-Fi.
- **Historique des duels (Wi-Fi)**. Chaque appareil a un identifiant stable,
  échangé seulement dans la liaison chiffrée, et garde son bilan contre chaque
  adversaire (« VOS DUELS : 5 V - 3 D »). Le bilan s'affiche en salle
  d'attente et en fin de match.
- **Ralenti des buts (solo et Wi-Fi)**. Après la célébration, les 2,5 s avant
  le but sont rejouées à demi-vitesse (`app/ralenti.ts`). Chaque appareil
  rejoue ses propres instantanés (ceux que l'hôte envoie déjà), calés sur le
  temps de simulation : le ralenti démarre ensemble sur les deux écrans, sans
  trafic de plus.
  - **PASSER** l'arrête tout de suite en solo ; en Wi-Fi, le jeu reprend
    quand les deux ont passé.
  - Désactivable dans les réglages avancés (solo) et dans la configuration de
    la partie Wi-Fi.

### 10. Mode coupe

Sur l'accueil, la ligne **MODE** fait défiler **CLASSIQUE** (un match),
**COUPE 8** (quarts, demi-finales, finale : 3 tours) et **COUPE 16**
(huitièmes de finale en plus : 4 tours), des tableaux à élimination directe.
Une ancienne sauvegarde « coupe » devient COUPE 8.

- **JOUER** ouvre le choix de votre équipe et de son maillot. Les 7 (ou 15)
  adversaires sont tirés au sort.
- **Le tableau** est symétrique, avec la finale et le trophée au centre
  (5 colonnes pour 8 équipes, 7 pour 16). Votre équipe est encadrée en or.
  Il se dessine à partir du nombre de tours (`nbTours`, `place` dans
  `render/coupe.ts`).
- **Après chaque match**, les résultats du tour se dévoilent un par un, en
  commençant par le vôtre. Les vainqueurs avancent ensuite dans le tableau.
  Un appui passe l'animation.
- **Difficulté.** Elle monte un peu à chaque tour, à partir du niveau choisi
  au menu : d'un quart de niveau par tour (`MONTEE_PAR_TOUR` dans
  `core/coupe.ts`). En partant de FACILE, la finale se joue à mi-chemin entre
  FACILE et NORMAL (affiché « FACILE+ »). Les réglages de l'IA sont
  interpolés entre les deux niveaux (`niveauInterpole`, `core/constants.ts`),
  sans dépasser PRO.
- **Pas de match nul.** Chaque match se termine par un vainqueur (prolongation
  au but en or).
- **Les autres matchs** sont simulés d'après les notes des équipes. Les buts
  sont tirés selon une loi de Poisson : l'attaque (tir, vitesse) contre la
  défense (défense, gardien).
- **Sauvegarde.** La coupe est sauvegardée sur l'appareil (avec sa taille) et
  reprend au prochain JOUER, telle qu'elle est, même si le menu est sur une
  autre taille ; l'accueil le rappelle (« COUPE 16 EN COURS »).
- **Fin de la coupe.** Si vous êtes éliminé, le tableau se termine en
  simulation et affiche le vainqueur.
- **Boutons.**
  - ABANDONNER (deux appuis) efface la coupe.
  - Abandonner un match depuis la pause ramène au tableau sans compter le
    match.
- Code :
  - `core/coupe.ts` (module pur, testé dans `tests/coupe.test.ts`) ;
  - `render/coupe.ts` (écrans) ;
  - le trophée `public/coupe.png` est converti depuis
    `assets/sprites-src/coupe.jpg` par `scripts/convertit-sources.py`.

### 11. Bonus (power-ups)

Option **BONUS** sur l'accueil (le son est passé dans les réglages
avancés). En Wi-Fi, c'est le réglage de l'hôte qui compte.

- **La jauge.** Chaque équipe compte ses passes réussies d'affilée : 4 passes
  donnent un bonus, toujours (`SEUIL_PASSES`). La série retombe à zéro sur
  une interception, un arrêt d'un gardien ou un but.
- **Le tirage.** Au seuil, un bonus est tiré au sort : les icônes défilent
  un peu plus d'une seconde dans la case en haut à gauche, puis s'arrêtent.
  Le tirage est le même pour les deux équipes, tout au long du match :
  personne n'est avantagé pour toute la partie par un tirage chanceux.
- **La pondération.** Chaque bonus a un poids (`POIDS_POUVOIRS` : 1, et 0,5
  pour le super héros). Le tirage reçoit l'état du match (`poidsPouvoirs`) : on
  pourra plus tard donner plus souvent les bonus puissants à l'équipe menée.
- **Le départ.** Il n'y a pas de bouton BONUS : à la 4e passe, un gros
  « BONUS » doré jaillit au-dessus du joueur (à la place de la bulle de
  combo), le tirage tourne, et le bonus part tout seul à sa fin, pour tout
  le monde (ordinateur et Wi-Fi compris). Tiré pendant un arrêt de jeu, il
  part à la reprise. Pendant qu'un bonus tourne ou est en cours, les passes
  ne remplissent pas la jauge.
- **Le bouton doré.** Quand un bonus se joue avec un bouton (le tir
  surpuissant, avec TIR), ce bouton passe en or : relief, respiration d'un
  pixel, éclat qui fait le tour et halo qui pulse (`boutonBonus`,
  `render/controls-overlay.ts`). Sans le palet, un anneau doré rappelle
  que le tir attend.
- **Toujours une fin.** Chaque bonus dure au plus 10 s (but x2 compris).
- **Taille des cages.** Les cages géante et mini passent par `demiCage`
  (collisions, détection du but, gardien, visée et qualité du tir).
- **Un but met fin à tous les bonus**, des deux côtés, même à un tirage en
  cours.
- **Le joueur doré.** Le joueur piloté devient doré (maillot, crosse et
  visage) avec une auréole. Pendant les 2 dernières secondes, il clignote
  entre doré et normal, de plus en plus vite.
- **L'affichage.** En haut à gauche : votre case, les passes, le tirage, puis
  le nom du bonus en cours et sa barre de temps. En haut à droite, en plus
  petit : celle de l'adversaire.

| Bonus | Effet | Durée |
|---|---|---|
| Super vitesse | joueur doré ×1,4 (vitesse et accélération), images fantômes | 6 s |
| Super tir | le prochain tir part 1,5× plus vite, qualité +0,2 ; il traverse et renverse les adversaires sur sa route (2 s au sol) ; traînée de feu, onde de choc ; bouton TIR doré | prochain tir, 10 s max |
| Freeze (icône : glaçon) | tout le monde est pris dans la glace, sauf le joueur doré (les gardiens jouent) ; on garde la main sur lui ; onde de givre | 3 s |
| Full esquive | toute mise en échec contre l'équipe se transforme en esquive, étincelles bleues ; le coup de crosse, lui, prend toujours le palet | 8 s |
| Inversion | les déplacements des adversaires partent à l'envers (l'ordinateur aussi), spirales au-dessus de leur tête | 5 s |
| Surnombre | un coéquipier de plus saute du banc (doré, semi-transparent, piloté par l'ordinateur ou par vous si vous changez de joueur), puis repart | 10 s |
| But x2 | le prochain but de l'équipe compte double ; « 2X » au-dessus de la cage adverse | 10 s |
| Super héros | super vitesse + un tir surpuissant + freeze des adversaires pendant les 3 premières secondes (`HEROS_FREEZE_S`) ; le tir ne coupe pas le reste du bonus ; deux fois plus rare au tirage | 8 s |
| Tremblement | tout le monde tombe (la chute de l'esquive, 1,6 s), coéquipiers compris, sauf le porteur du palet ; l'écran tremble fort, grondement, poussière | 2,5 s |
| Givre (icône : flocon) | l'écran de tout le monde gèle : patinoire très floue et bleutée, cristaux de glace sur les bords (`render/givre-ecran.ts`) ; le tableau et les commandes restent nets. Le flou réduit l'image par moitiés successives puis la ré-agrandit par étapes : en une seule réduction (14 fois), un joueur qui glisse apparaissait par paliers de 14 pixels et clignotait | 7 s |
| Cage géante | la cage adverse s'ouvre deux fois plus large ; le gardien garde sa taille et ne couvre plus les coins ; l'ouverture brille en or. Un but marqué dans une cage déformée (géante ou mini) la laisse telle quelle pendant toute la célébration et le ralenti, pour qu'on voie où le palet est entré : elle ne reprend sa taille qu'à l'engagement suivant | 10 s |
| Mini cage | sa propre cage rétrécit (×0,45) ; l'ouverture brille en or | 10 s |
| Gardien endormi | le gardien adverse ne bouge plus, n'attrape plus rien et ne couvre plus que 60 % de son corps ; des « Z » montent au-dessus de lui | 6 s |
| Blackout | les lumières s'éteignent (après deux clignotements) : tout est noir, sauf deux projecteurs, sur le joueur doré et sur le gardien adverse ; l'équipe dans le noir garde une petite lueur autour du joueur qu'elle pilote, et intercepte (×0,5) et vole (×0,3) moins bien | 8 s |
| Foule (icône : mégaphone) | 5 supporters aux couleurs de l'équipe sautent des tribunes et foncent sur les adversaires (deux sur le porteur) ; au contact, l'adversaire est freiné net et peut lâcher le palet (« OUPS ! ») ; à la fin, ils regagnent les tribunes | 8 s |
| Super passe | pendant le bonus, toutes les passes de l'équipe arrivent au coéquipier : le palet file droit sur lui (jamais sous 190 px/s), l'adversaire ne peut plus l'intercepter, le receveur le capte de plus loin ; la passe part toujours vers un coéquipier, même sans l'assistance de passe ; traînée verte (`palet.lueur` = 2) | 8 s |
| Loupé complet | si un adversaire tire pendant le bonus, son tir est raté d'office : le palet part en cloche (son ombre sur la glace), claque contre le bord de l'écran, revient vers la caméra en grossissant et brise la vitre (fissures, éclats, « LOUPE ! », bruit de verre), puis engagement au centre ; le bonus est consommé | 10 s max |

**Supporters.** Les dessins viennent de `assets/sprites-src/supporters/`
(fond magenta, comme les autres sources) : pour en ajouter un, il suffit d'y
déposer son image et de relancer `python3 scripts/convertit-sources.py` puis
`npm run sprites`. Le rouge vif prend la couleur principale de l'équipe, le
jaune et l'or sa couleur secondaire, le reste garde ses couleurs. Si un
détail rouge ou jaune doit rester tel quel (des cheveux roux), un fichier
`<nom>.json` à côté de l'image liste ces zones (voir `supporter-1.json` pour des cheveux roux, `supporter-4.json` pour le bois d'une grosse caisse).
Il y a six supporters (un amateur à la cloche, une fan qui montre du doigt, un barbu à la main géante, un tambour et une joueuse de caisse claire, une meneuse au mégaphone) : la Foule en tire cinq, qui se suivent à partir d'un point de départ au hasard, pour que tous servent à tour de rôle.
Feuilles par équipe : `supporters-<id>.png`.

**Loupé complet.** C'est une phase de jeu à part (`loupe`, `LOUPE_S`) :
l'animation (`render/loupe-ecran.ts`) se déduit du temps restant, donc chaque
écran, Wi-Fi et spectateur compris, joue la même scène.

**Mode entraînement** (Réglages avancés > ENTRAINEMENT) : on choisit un
bonus dans la grille (le choix est gardé), puis un match sans chrono
contre l'ordinateur. Le bonus choisi part tout seul et revient peu après
chaque fin ; l'adversaire n'a pas de bonus. PAUSE > ABANDONNER pour sortir.

Code : `core/pouvoirs.ts` (tirage, départ automatique, activation),
`core/pouvoirs-def.ts` (définitions) et `core/pouvoirs-effets.ts` (effets en jeu) ;
testé dans `tests/pouvoirs-*.test.ts`, `render/hud-bonus.ts` et `render/icones-bonus.ts`
(jauges, tirage), `render/scene.ts` (le « BONUS » doré), feuille dorée calculée à la volée
(`BanqueSprites.spriteJoueurDore`). En Wi-Fi, les bonus voyagent dans
l'instantané (protocole v19 : en plus, le tir déjà fait du super héros, les
supporters et la phase de loupé ; v20 : le mode coop ; v21 : la super passe ; v22 : le buteur qui célèbre) ; les
effets d'écran (tremblement, givre, blackout) se calculent sur chaque appareil
à partir de l'état du bonus.

L'aide des commandes (tactile et clavier) est dans **Réglages avancés >
Commandes**.

## Licence

Apache-2.0, voir [LICENSE](./LICENSE).


**Image de fin de match.** Juste avant les statistiques, une image plein
écran (`public/fins/victoire.jpg` ou `defaite.jpg`) montre la victoire ou la
défaite du point de vue de chaque joueur — en Wi-Fi, chacun voit la sienne.
Elle reste seule 2 s (`IMAGE_FIN_S`), ou jusqu'à un appui (ou Entrée), puis
les statistiques s'affichent par-dessus, l'image restant en fond. Elle est
calée en bas de l'écran pour toujours montrer les joueurs, et repeinte aux
couleurs de l'équipe du joueur (maillot, bandes, empiècements) comme les
sprites : `scripts/roles-fins.py` prépare une carte de rôles par image (seul
le rouge des maillots compte, pas les lignes de la glace ni la cage), et
`src/render/fins.ts` repeint l'image à la fin du match.

**Célébration du buteur.** Pendant l'écran de but, un joueur de l'équipe qui
marque, tiré au sort parmi les dessins `assets/sprites-src/celebration-<n>.jpg`
(repeints aux couleurs du maillot, `celebration-<id>.png`), traverse le bas de
l'écran de gauche à droite, au premier plan (devant l'écusson géant et le
bandeau « BUT ! »), en ralentissant au centre, avec une gerbe de glace. Le
bandeau et l'écusson restent 2,9 s (`ANNONCE_BUT_S`), la traversée dure 2 s. Le tirage part avec l'annonce du but (`celeb`) : en
Wi-Fi, les deux écrans montrent le même dessin. Tous les réglages (retard,
durée de la traversée, ralentissement au centre, taille) sont regroupés dans
`CELEBRATION` (`src/render/celebration.ts`) ; avec le ralenti des buts, la
célébration en direct dure au moins le temps de la traversée. Pour ajouter un
dessin : fond magenta, joueur entier ; l'ajouter à `CELEBRATIONS` dans
`scripts/sources/celebrations.py` avec les zones du casque, du visage, des gants,
de la culotte et de la crosse (et la grille du dessin si la source n'a pas la
même taille), puis relancer la conversion et `npm run sprites`. Sept
dessins pour l'instant : jambe levée, à genou poing levé, crosse brandie
au-dessus de la tête, bras écartés, crosse jouée comme une guitare, main sur
le cœur, barbu qui pointe le gant vers la foule (sans crosse ; calé pour que sa hauteur de joueur égale celle des autres). Tous gardent la même échelle (calée sur
le premier dessin) : un joueur à genou reste plus petit qu'un joueur debout.

**Joueur au sol.** Le défenseur esquivé a ses propres dessins
(`chute-<id>.png` : plongeon puis allongé, convertis depuis
`assets/sprites-src/chute-plongeon.jpg` et `chute-allonge.jpg`), repeints aux
couleurs de chaque équipe comme les autres ; le dessin est deux fois moins fin
que la planche de patinage, d'où son échelle de 0,22 (casque de la même
taille qu'en patinant).

**Geste de tir.** Quatre dessins (`tir-<id>.png`, convertis depuis
`assets/sprites-src/tir/tir-1.jpg` à `tir-4.jpg`) : armé, descente, impact et
accompagnement. Ils sont pixelisés sur une grille commune (ils sont déjà calés
entre eux), puis élargis de 18 % (`ELARGISSEMENT_TIR`, colonnes répétées) pour
retrouver la carrure du joueur qui patine ; leurs visages ont leurs propres
variantes (`visages-tir.png`). En jeu, l'image « armé » reste affichée tant
que le tir se charge (bouton TIR) ; au tir, les
trois autres s'enchaînent en 0,32 s (`TIR_ANIM`, `core/constants.ts`), puis le
patinage reprend. Pendant que le tir se charge, le joueur se tourne vers la
direction de la visée (`s.vise`), même s'il patine dans une autre direction
(celle du joystick) ; il garde cette orientation pendant le geste. L'ordinateur joue le même geste. Le joueur doré d'un bonus
garde son or pendant le geste.

**Mise en échec.** Une seule image (`echec-<id>.png`, convertie depuis
`assets/sprites-src/echec.jpg`, même grille et même échelle que les autres
dessins, repeinte par équipe avec ses variantes de visage). Elle remplace le
patinage pendant tout l'élan du bouton ÉCHEC sans le palet (`elanT`, déjà
transmis en Wi-Fi) et 0,12 s après (choc ou glisse). Pendant l'élan : trois
images fantômes et des traits de vitesse derrière le joueur ; au choc, en plus
du flash et de la secousse, une onde blanche et des étincelles blanches et
dorées (`core/collisions.ts`). Le test `e2e/echec.mjs` déclenche un vrai élan et
capture la pose et le choc.

**Écran des maillots.** Le joueur y est vu de face (`portrait-<id>.png`,
converti depuis `assets/sprites-src/portrait.jpg` comme les autres dessins),
aux couleurs du maillot choisi, avec l'écusson sur la poitrine ; la crosse est
tournée vers l'extérieur de l'écran de chaque côté.
