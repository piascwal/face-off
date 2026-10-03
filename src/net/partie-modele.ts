/** Partie Wi-Fi : le modèle (sièges, formats, état partagé, actions) et ses constantes. Voir partie.ts. */

import { type BonusEquipe } from '@core/types';

export type VarianteMaillot = 'interieur' | 'exterieur';
export type PhaseLan = 'attente' | 'equipes' | 'maillots' | 'match' | 'fin';
export type VoteFin = 'rejouer' | 'equipes';
/** Un camp : 0 = l'équipe de gauche (celle de l'hôte), 1 = celle de droite. */
export type Camp = 0 | 1;
/** Un siège : 0 = A1 (l'hôte), 1 = A2, 2 = B1, 3 = B2. */
export type Siege = 0 | 1 | 2 | 3;

export const SIEGES: readonly Siege[] = [0, 1, 2, 3];
export const campDe = (s: Siege): Camp => (s >> 1) as Camp;
export const rangDe = (s: Siege): 0 | 1 => (s & 1) as 0 | 1;
export const siegeDeCamp = (camp: Camp, rang: 0 | 1): Siege => ((camp << 1) | rang) as Siege;

/** Spectateurs (et indécis) au plus par partie : c'est l'appareil de l'hôte qui leur envoie le match. */
export const SPECTATEURS_MAX = 8;

/** Formats de la partie : combien d'humains de chaque côté (le CPU tient les autres places). */
export const FORMATS = ['1v1', '2v1', '1v2', '2v2', 'coop'] as const;
export type FormatLan = (typeof FORMATS)[number];
export const estFormat = (x: unknown): x is FormatLan => FORMATS.includes(x as FormatLan);
/** Humains par camp : `coop` = deux humains d'un côté, le CPU en face. */
export const PLACES_FORMAT: Record<FormatLan, [number, number]> = {
  '1v1': [1, 1],
  '2v1': [2, 1],
  '1v2': [1, 2],
  '2v2': [2, 2],
  coop: [2, 0],
};
/** Le siège existe-t-il dans ce format ? */
export const siegeExiste = (format: FormatLan, s: Siege): boolean => rangDe(s) < PLACES_FORMAT[format][campDe(s)];

/**
 * Réactions des spectateurs (et des joueurs sur l'écran de fin) : les deux
 * logos des équipes du match, toujours présents, puis quatre icônes.
 */
export const REACTIONS = ['logo0', 'logo1', 'feu', 'gyro', 'coeur', 'ouf'] as const;
export type Reaction = (typeof REACTIONS)[number];
export const estReaction = (x: unknown): x is Reaction => REACTIONS.includes(x as Reaction);

/** Un appareil connecté à la partie (joueur, spectateur ou indécis). */
export interface MembreLan {
  nom: string;
  /** Identifiant stable de l'appareil (historique des duels), jamais publié hors de la liaison chiffrée. */
  appareil: string;
}

/** Un joueur assis. */
export interface JoueurLan extends MembreLan {
  pret: boolean;
  vote: VoteFin | null;
}

/** L'équipe d'un camp et son maillot. */
export interface CampLan {
  equipe: string;
  variante: VarianteMaillot;
}

export interface ConfigLan {
  effectif: number;
  duree: number;
  assistTir: boolean;
  assistPasse: boolean;
  changementAuto: boolean;
  /** Ralenti des buts sur tous les écrans. */
  ralenti: boolean;
  /** Bonus (power-ups) en jeu. */
  pouvoirs: boolean;
  /** Combien d'humains de chaque côté (voir `PLACES_FORMAT`). */
  format: FormatLan;
  /** Niveau du CPU en coop (index dans NIVEAUX) ; ignoré dans les autres formats. */
  niveau: number;
}

export interface EtatPartieLan {
  phase: PhaseLan;
  config: ConfigLan;
  /** Équipe et maillot des deux camps. */
  camps: [CampLan, CampLan];
  /** Les quatre sièges (A1, A2, B1, B2) ; l'hôte occupe toujours le premier. */
  sieges: [JoueurLan | null, JoueurLan | null, JoueurLan | null, JoueurLan | null];
  /** Appareils qui regardent la partie. */
  spectateurs: MembreLan[];
  /** Appareils arrivés, qui n'ont pas encore choisi entre jouer et regarder. */
  indecis: MembreLan[];
  /** Joueur qui a mis le match en pause (la pause vaut pour tous les écrans). */
  pause: Siege | null;
  /** Secondes restantes du compte à rebours de reprise (0 = aucun). */
  reprise: number;
  /** Handicap de chaque camp, réglé par l'hôte (validé par les autres en appuyant sur PRÊT). */
  bonus: [BonusEquipe, BonusEquipe];
  /** Qui a demandé à passer le ralenti du but en cours (il s'arrête quand tous les humains ont passé). */
  ralentiPasse: [boolean, boolean, boolean, boolean];
  /**
   * Connexion perdue avec des joueurs : secondes qu'il leur reste pour revenir
   * (0 = tout le monde est là). Leurs sièges sont gardés (`absents`), le match est en pause.
   */
  absent: number;
  absents: Siege[];
}

export type ActionLan =
  /** Réservé à l'hôte : fermer la salle d'attente et passer aux équipes. */
  | { a: 'lancer' }
  /** Réservé à l'hôte : le format de la partie. */
  | { a: 'format'; format: FormatLan }
  /** Prendre un siège libre (salle d'attente). */
  | { a: 'siege'; siege: Siege }
  /** Choisir de regarder (salle d'attente) ; libère le siège éventuel. */
  | { a: 'spectateur' }
  /** `camp` : le camp à régler (hôte seulement, hors 1 contre 1) ; sinon le sien. */
  | { a: 'equipe'; equipe: string; camp?: Camp }
  | { a: 'variante'; variante: VarianteMaillot; camp?: Camp }
  | { a: 'pret'; pret: boolean }
  | { a: 'vote'; vote: VoteFin | null }
  | { a: 'pause'; on: boolean }
  /** Réservé à l'hôte : handicap d'un des deux camps. */
  | { a: 'bonus'; camp: Camp; bonus: BonusEquipe }
  | { a: 'passer' };

export const REPRISE_S = 3;
/** Temps laissé aux joueurs pour se reconnecter après une coupure (s). */
export const RECONNEXION_S = 60;
