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
  pokeT: number;
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
  passe: { vers: Skater; t: number } | null;
  trace: Vec2[];
  /**
   * Qualité (0..1) du tir en cours : combine la puissance et la précision du
   * placement par rapport à la position du gardien au moment du tir. Sert à
   * moduler la probabilité d'un but sans casser la simulation physique — voir
   * `shooting.ts`.
   */
  qualite: number;
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
}

export type GamePhase = 'engagement' | 'jeu' | 'but' | 'fin';

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
  | { type: 'bulle'; txt: string; x: number; y: number; c: string }
  // `c` est une couleur neutre de repli ; quand `eq` est fourni, le rendu
  // préfère la couleur de maillot de cette équipe (core ne connaît pas les
  // couleurs de maillot — voir render/team-visuals.ts).
  | { type: 'annonce'; txt: string; sous: string; c: string; duree: number; eq?: TeamId };

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
  /** Le prochain tir de cette équipe est-il chargé en tir spécial (voir COMBO_SEUIL) ? */
  tirSpecialPret: [boolean, boolean];
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
