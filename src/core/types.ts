export type TeamId = 0 | 1;

export interface Vec2 {
  x: number;
  y: number;
}

/** Géométrie de la patinoire, recalculée à chaque redimensionnement de l'écran. */
export interface Rink {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  cx: number;
  cy: number;
  butG: number;
  butD: number;
  bleueG: number;
  bleueD: number;
}

export interface Skater {
  eq: TeamId;
  rang: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  r: number;
  tient: boolean;
  recupCd: number;
  elanT: number;
  elanCd: number;
  sonne: number;
  charge: number;
  arme: boolean;
  /** Coup de crosse en cours (> 0) puis temps de recharge (< 0), en s. */
  pokeT: number;
  /** Esquive d'une mise en échec en cours (s) ; `esquiveVerrou` : appui raté, pas d'esquive possible (anti-matraquage). */
  esquiveT: number;
  esquiveVerrou: number;
  /** IA : mise en échec en préparation (s restantes avant de charger le porteur). */
  prepaEchecT: number;
  /** Au sol après une esquive ou un tir surpuissant (s restantes) : plongeon puis allongé, en glissant. */
  chuteT: number;
  /** Durée totale de la chute en cours (s), pour savoir quand passer du plongeon à allongé. */
  chuteD: number;
  /** Geste de tir en cours (s restantes, voir TIR_ANIM_S) : descente, impact, accompagnement. */
  tirT: number;
  /** Joueur en renfort (bonus surnombre) : il repart à la fin du bonus. */
  renfort: boolean;
  /** Flash blanc d'impact (s restantes). */
  flashT: number;
  anim: number;
  humain: boolean;
  ex: number;
  ey: number;
  vit: number;
  grince: number;
  vise: number | null;
  ia: { t: number; tx: number; ty: number; but: number };
}

export interface Goalie {
  eq: TeamId;
  a: number;
  x: number;
  y: number;
  r: number;
  tient: number;
  cd: number;
  vit: number;
  antic: number;
  secoue: number;
}

export type Porteur = Skater | Goalie;

export interface Puck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  porteur: Porteur | null;
  dernier: Porteur | null;
  tireur: TeamId | null;
  /** Passe en cours : receveur visé, temps restant, et passe « facile » (partie de sa propre moitié). */
  passe: { vers: Skater; t: number; facile: boolean } | null;
  trace: Vec2[];
  /**
   * Qualité (0..1) du tir en cours : combine la puissance et la précision du
   * placement par rapport à la position du gardien au moment du tir. Sert à
   * moduler la probabilité d'un but sans casser la simulation physique — voir
   * `shooting.ts`.
   */
  qualite: number;
  /** Tir en cours : nombre de passes réussies qui l'ont précédé, et tir sur réception ou non. */
  passes: number;
  uneTouche: boolean;
  /** Tir surpuissant en vol : il renverse les adversaires sur sa trajectoire. */
  puissant: boolean;
  /** Traînée spéciale (rendu) : 0 aucune, 3 tir surpuissant. */
  lueur: number;
}

export interface LevelConfig {
  nom: string;
  vit: number;
  reac: number;
  err: number;
  poke: number;
  check: number;
  gk: number;
  antic: number;
  portee: number;
  /** Probabilité qu'un porteur de l'IA esquive une mise en échec. */
  esquive: number;
}

/** `loupe` : bonus « loupé complet », le tir adverse part vers la caméra et brise l'écran, puis engagement au centre. */
export type GamePhase = 'engagement' | 'jeu' | 'but' | 'fin' | 'loupe';

/** Coup de pouce accordé à une équipe pour équilibrer un match entre joueurs de niveaux différents. */
export type BonusEquipe = 'aucun' | 'gardien' | 'vitesse' | 'tir' | 'but';
export const BONUS_EQUIPE: BonusEquipe[] = ['aucun', 'gardien', 'vitesse', 'tir', 'but'];

/** Statistiques cumulées pendant le match, par équipe (affichées à la fin). */
export interface StatsMatch {
  passes: [number, number];
  /** Secondes passées avec le palet (patineur ou gardien). */
  possession: [number, number];
  checks: [number, number];
  comboMax: [number, number];
}

export function statsVides(): StatsMatch {
  return { passes: [0, 0], possession: [0, 0], checks: [0, 0], comboMax: [0, 0] };
}
export type GameMode = 'demo' | 'match';

/** Bonus (power-ups), voir pouvoirs.ts. */
export type PouvoirId =
  | 'vitesse'
  | 'puissant'
  | 'freeze'
  | 'savon'
  | 'inversion'
  | 'surnombre'
  | 'double'
  | 'heros'
  | 'tremblement'
  | 'givre'
  | 'geante'
  | 'minicage'
  | 'endormi'
  | 'blackout'
  | 'envahissement'
  | 'loupe'
  | 'superpasse';

/** Bonus d'une équipe : jauge de passes, bonus en main, effet en cours. */
export interface EtatPouvoirs {
  /** Passes réussies d'affilée vers le prochain bonus. */
  passes: number;
  /** Passes nécessaires pour un bonus. */
  seuil: number;
  /** Tirage en cours (s restantes) : le bonus est connu, mais pas encore utilisable. */
  tirage: number;
  /** Bonus tiré (pendant le tirage, puis jusqu'à ce qu'il parte, dès que le jeu tourne). */
  pret: PouvoirId | null;
  /** Bonus en cours, et son temps restant (s ; un but y met fin plus tôt). */
  actif: PouvoirId | null;
  reste: number;
  /** Rang du joueur doré quand c'est l'ordinateur qui a déclenché le bonus (-1 : aucun). */
  dore: number;
  /** Entraînement : temps écoulé depuis la fin du bonus (il revient à ENTRAINEMENT_RETOUR_S). */
  attente: number;
  /** Super héros : son tir surpuissant est déjà parti (le reste du bonus continue). */
  tirFait: boolean;
}

/** Un évènement de gameplay à effet de bord (son, particule, vibration, texte...). */
export type GameEvent =
  | { type: 'frappe'; puissance: number }
  | { type: 'touche' }
  | { type: 'bande'; force: number }
  | { type: 'poteau' }
  | { type: 'jambiere' }
  | { type: 'charge' }
  | { type: 'elan' }
  | { type: 'raclement' }
  | { type: 'clic' }
  | { type: 'sifflet'; long: boolean }
  | { type: 'klaxon' }
  | { type: 'ovation'; niveau: number }
  | { type: 'but'; eq: TeamId; buteur: Porteur | null }
  | { type: 'arret'; eq: TeamId }
  | { type: 'vole'; eq: TeamId; x: number; y: number }
  | { type: 'check'; x: number; y: number; humain: boolean }
  | { type: 'etincelles'; x: number; y: number; n: number; c?: string }
  | { type: 'neige'; x: number; y: number; n: number; vx?: number; vy?: number }
  | { type: 'confettis'; x: number; y: number; eq: TeamId }
  | { type: 'secousse'; force: number }
  | { type: 'flash'; force: number }
  | { type: 'vibre'; ms: number | number[] }
  // `gros` : en grand, avec un contour (le « BONUS » doré de la 4e passe)
  | { type: 'bulle'; txt: string; x: number; y: number; c: string; gros?: boolean }
  // bonus : `id` = index dans POUVOIRS (voir pouvoirs.ts)
  | { type: 'pouvoir'; eq: TeamId; quoi: 'tirage' | 'active' | 'fin'; id: number }
  // onde de choc circulaire (rendu) : rayon final `r` (px)
  | { type: 'onde'; x: number; y: number; r: number; c: string }
  // loupé complet : le palet frappe l'écran, qui se brise
  | { type: 'verre' }
  // `c` est une couleur neutre de repli ; quand `eq` est fourni, le rendu
  // préfère la couleur de maillot de cette équipe (core ne connaît pas les
  // couleurs de maillot — voir render/team-visuals.ts).
  // `celeb` : tirage de la célébration du buteur (même dessin sur les deux écrans en Wi-Fi)
  | { type: 'annonce'; txt: string; sous: string; c: string; duree: number; eq?: TeamId; celeb?: number };

/** Entrée d'un joueur humain pour une image de simulation. */
export interface InputIntent {
  ix: number;
  iy: number;
  tirAppui: boolean;
  tirTenu: boolean;
  tirRelache: boolean;
  passeAppui: boolean;
  elanAppui: boolean;
  /** Angle de visée manuelle (glissé), ou null si pilotage à l'analogique/clavier. */
  viseeManuelle: number | null;
}

export const INTENT_VIDE: InputIntent = {
  ix: 0,
  iy: 0,
  tirAppui: false,
  tirTenu: false,
  tirRelache: false,
  passeAppui: false,
  elanAppui: false,
  viseeManuelle: null,
};

/** Un supporter du bonus « envahissement », sur la glace. */
export interface Supporter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** L'équipe qu'il soutient (celle qui a lancé le bonus) : il gêne l'autre. */
  eq: TeamId;
  /** Son dessin (modulo le nombre de supporters dessinés). */
  img: number;
  /** Il repart vers les tribunes (fin du bonus). */
  sortie: boolean;
}

export interface MatchState {
  mode: GameMode;
  niv: LevelConfig;
  nivEq: [LevelConfig, LevelConfig];
  nb: number;
  patineurs: Skater[];
  /** Équipes pilotées par un humain (l'une en solo, les deux en réseau local). */
  humains: [boolean, boolean];
  /** Patineur actuellement piloté par l'humain de chaque équipe (null pour une équipe CPU). */
  controles: [Skater | null, Skater | null];
  /**
   * Wi-Fi : une équipe peut avoir deux humains (`duo[eq]`). `controles[eq]` est
   * le patineur du premier (siège 0), `partenaires[eq]` celui du second
   * (siège 1) ; null quand l'équipe n'a qu'un humain ou aucun.
   */
  duo: [boolean, boolean];
  partenaires: [Skater | null, Skater | null];
  gardiens: [Goalie, Goalie];
  palet: Puck;
  score: [number, number];
  tirs: [number, number];
  arrets: [number, number];
  horloge: number;
  prolong: boolean;
  phase: GamePhase;
  phaseT: number;
  temps: number;
  lampe: [number, number];
  excite: number;
  marqueur: TeamId | null;
  buteur: Porteur | null;
  /** Passes réussies d'affilée par équipe depuis la dernière perte de palet ou le dernier tir. */
  combo: [number, number];
  /** Bonus de chaque équipe ; null quand les bonus sont désactivés (option du menu). */
  pouvoirs: [EtatPouvoirs, EtatPouvoirs] | null;
  /** Mode entraînement : ce bonus revient sans cesse à l'équipe du joueur, pas de chrono. */
  entrainement: PouvoirId | null;
  /** Dernière passe reçue (pour le tir sur réception) : qui, et à quel instant (`temps`). */
  reception: { qui: Skater; t: number } | null;
  /** Arrêt sur image (s) : la simulation se fige un court instant pour souligner une esquive. */
  figeT: number;
  /** Bonus « envahissement » : les supporters sur la glace. */
  supporters: Supporter[];
  /**
   * Engagement : les joueurs arrivent patinant de leur point de départ à leur
   * position (`depart` → `cible`, un par patineur, dans l'ordre de `patineurs`).
   * Absent hors de l'animation ; non transmis en Wi-Fi (seules les positions le sont).
   */
  approche?: { t: number; duree: number; depart: Vec2[]; cible: Vec2[] } | null;
  /** Évènements à effet de bord produits pendant le dernier pas de simulation. */
  evenements: GameEvent[];
  /** Réglages « avancés » du menu, ignorés en mode démo (toujours activés). */
  assistTir: boolean;
  assistPasse: boolean;
  changementAuto: boolean;
  /** Handicap de chaque équipe (voir BonusEquipe). */
  bonus: [BonusEquipe, BonusEquipe];
  stats: StatsMatch;
  /** Durée de la phase « but » (célébration, plus le ralenti éventuel), en secondes. */
  dureeBut: number;
}

export function estPatineur(o: Porteur | null | undefined): o is Skater {
  return !!o && 'face' in o;
}
