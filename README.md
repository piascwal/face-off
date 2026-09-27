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
  net/      — multijoueur Wi-Fi : découverte chiffrée, liaison WebRTC, protocole
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

Les joueurs et les gardiens viennent de deux **illustrations pixel art**
générées avec un outil d'image (`assets/sprites-src/planche-patinage.jpg`, une planche
d'images de patinage, et `gardien.jpg`). Ces images sont des dessins pixel
art agrandis et compressés en JPEG sur fond magenta ; la chaîne les ramène à
du vrai pixel art, puis les décline pour chaque équipe.

**1. Conversion (une fois, Python)** — `scripts/convertit-sources.py` :

- détoure le fond (et, pour le gardien, la glace, l'ombre et le reflet) ;
- découpe la planche image par image, en rendant à chacune le bout de
  palette qui touche le joueur voisin ;
- retrouve la grille du dessin (période et calage) et garde **une couleur
  par case** (la médiane : le plus proche voisin ramasserait le bruit JPEG) ;
- réduit chaque dessin à **64 couleurs** (k-moyennes) ;
- classe chaque pixel dans un **rôle** : maillot, bandes, empiècements
  clairs, casque, gants, peau, barbe, emplacement de l'écusson, contour, ou
  « à garder » (crosse, culotte, patins, grille du masque).

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
fait 0,28 px logique pour un patineur (≈ 28 px de haut) et 0,2 pour le
gardien (≈ 23 px). Plus grands, les joueurs se chevauchaient dans les
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

**Jeu de passes aussi payant qu'une échappée** (réglages dans
`core/constants.ts`, tests dans `tests/jeu-de-passes.test.ts`) :

- passes plus appuyées ; le coéquipier visé capte le palet de plus loin et
  le palet est légèrement attiré vers sa crosse, un adversaire doit être
  bien sur la ligne pour l'intercepter ;
- chaque passe de la séquence ajoute un petit bonus de qualité au tir
  suivant, avant même le tir spécial ;
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
change selon qu'on a le palet ou non :

| | Gros bouton | Bouton moyen | Petit bouton |
|---|---|---|---|
| **Avec le palet** | TIR | PASSE | SPRINT / ESQUIVE |
| **Sans le palet** | ÉCHEC | CHANGER DE JOUEUR | CROSSE |

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

Au clavier : ESPACE tire ou met en échec, L passe, MAJ sprinte / esquive /
donne le coup de crosse. En IA contre IA, les buts ne bougent pas et 3 à
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
tablette ou ordinateur) devient le serveur. Il règle d'abord le format du
match : 2, 3 ou 5 contre 5, durée et assistances, pour les deux joueurs.
Sur un autre appareil du même Wi-Fi, la partie apparaît toute seule dans la
liste, sans adresse IP à saisir ; le bouton **ACTUALISER** relance la
recherche. Le joueur qui rejoint attend dans la **salle d'attente** que
l'hôte appuie sur **LANCER**.

Le déroulé est ensuite une machine d'états arbitrée par l'hôte
(`net/partie.ts`, testée dans `tests/partie-lan.test.ts`). **On ne passe à
l'étape suivante que quand les deux joueurs ont validé.**

1. **Choix des équipes**, en simultané. Chacun ne règle que son côté, **PRÊT**
   verrouille son choix et **MODIFIER** le déverrouille.
2. **Choix des maillots**, même principe. Si les deux ont pris le même club,
   l'invité démarre en extérieur, et deux maillots identiques ne peuvent pas
   être validés.
3. **Match**. La **pause est partagée** : n'importe lequel des deux la
   déclenche (bouton, Échap, ou téléphone verrouillé), l'hôte fige la
   simulation pour les deux. À la reprise, un compte à rebours de 3 s évite de
   surprendre l'autre joueur.
4. **Fin** : chacun vote **REJOUER** ou **CHANGER D'ÉQUIPES**. On ne relance que
   quand les deux votes concordent.

L'hôte peut **exclure** le joueur ; si l'un des deux quitte ou perd la
connexion, l'autre est ramené au bon écran avec un message.

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
  publique, on ne peut ni lire les annonces, ni injecter une offre.
- Le jeu lui-même est chiffré par DTLS.
- Un **code de vérification à 4 chiffres**, dérivé des empreintes des certificats
  DTLS des deux appareils, est affiché des deux côtés. S'il diffère, quelqu'un
  s'est interposé.
- L'hôte est **autoritaire** : il ne reçoit du client que des intentions de
  jeu, bornées et validées (direction ramenée à ±1, appuis comptés, rien
  d'autre). Les deux côtés valident chaque message reçu (schéma, tailles, valeurs
  finies — `net/protocole.ts`, testé dans `tests/net.test.ts`).
- Une seule place par partie : l'annonce est retirée dès qu'un joueur est
  entré, et l'hôte peut **exclure** le joueur.
- Le client n'envoie que des *actions* sur ses propres choix (équipe, maillot,
  prêt, vote, pause). L'hôte les applique selon les règles de
  `net/partie.ts` ; « lancer » ne vient jamais du réseau.

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
  6 s de silence, la partie est considérée comme perdue et chacun est ramené
  à l'écran adapté avec un message.

En développement, `?reseau=xxx&courtier=ws://localhost:8883` (actif seulement
avec `npm run dev`) remplace la détection du réseau et les serveurs publics
par un broker MQTT local, pour tester à deux onglets sur une seule machine.

**Limites connues.**

- Les Wi-Fi « invités » qui isolent les appareils entre eux (isolation AP)
  empêchent la liaison directe.
- Un réseau d'entreprise qui bloque STUN empêche la détection du réseau.
- Pour du jeu par Internet, le même protocole pourrait passer par un serveur
  relais (TURN).

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

## Licence

Apache-2.0, voir [LICENSE](./LICENSE).


**Image de fin de match.** Juste avant les statistiques, une image plein
écran (`public/fins/victoire.jpg` ou `defaite.jpg`) montre la victoire ou la
défaite du point de vue de chaque joueur — en Wi-Fi, chacun voit la sienne.
Elle reste seule 2 s (`IMAGE_FIN_S`), ou jusqu'à un appui (ou Entrée), puis
les statistiques s'affichent par-dessus, l'image restant en fond. Elle est
calée en bas de l'écran pour toujours montrer les joueurs.

**Célébration du buteur.** Pendant l'écran de but, un joueur de l'équipe qui
marque, tiré au sort parmi les dessins `assets/sprites-src/celebration-<n>.jpg`
(repeints aux couleurs du maillot, `celebration-<id>.png`), traverse le bas de
l'écran de gauche à droite, devant l'écusson géant, en ralentissant au centre,
avec une gerbe de glace. Le tirage part avec l'annonce du but (`celeb`) : en
Wi-Fi, les deux écrans montrent le même dessin. Tous les réglages (retard,
durée de la traversée, ralentissement au centre, taille) sont regroupés dans
`CELEBRATION` (`src/render/celebration.ts`) ; avec le ralenti des buts, la
célébration en direct dure au moins le temps de la traversée. Pour ajouter un
dessin : fond magenta, joueur entier ; l'ajouter à `CELEBRATIONS` dans
`scripts/convertit-sources.py` avec les zones du casque, du visage, des gants,
de la culotte et de la crosse (et la grille du dessin si la source n'a pas la
même taille), puis relancer la conversion et `npm run sprites`. Quatre
dessins pour l'instant : jambe levée, à genou poing levé, crosse brandie
au-dessus de la tête, bras écartés. Tous gardent la même échelle (calée sur
le premier dessin) : un joueur à genou reste plus petit qu'un joueur debout.

**Joueur au sol.** Le défenseur esquivé a ses propres dessins
(`chute-<id>.png` : plongeon puis allongé, convertis depuis
`assets/sprites-src/chute-plongeon.jpg` et `chute-allonge.jpg`), repeints aux
couleurs de chaque équipe comme les autres ; le dessin est deux fois moins fin
que la planche de patinage, d'où son échelle de 0,22 (casque de la même
taille qu'en patinant).

**Écran des maillots.** Le joueur y est vu de face (`portrait-<id>.png`,
converti depuis `assets/sprites-src/portrait.jpg` comme les autres dessins),
aux couleurs du maillot choisi, avec l'écusson sur la poitrine ; la crosse est
tournée vers l'extérieur de l'écran de chaque côté.
