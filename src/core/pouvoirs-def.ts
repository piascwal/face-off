/** Bonus : la liste, leurs définitions (nom, durée, effets) et leurs réglages. Voir pouvoirs.ts. */

import type { PouvoirId } from './types';

/** Ordre fixe : l'index d'un bonus dans cette liste est ce qui voyage en Wi-Fi. */
export const POUVOIRS: PouvoirId[] = [
  'vitesse',
  'puissant',
  'freeze',
  'savon',
  'inversion',
  'surnombre',
  'double',
  'heros',
  'tremblement',
  'givre',
  'geante',
  'minicage',
  'endormi',
  'blackout',
  'envahissement',
  'loupe',
  'superpasse',
];

export interface DefPouvoir {
  nom: string;
  /** Durée maximale (s, en temps de jeu) ; un but y met fin plus tôt. */
  duree: number;
  /** Un joueur devient doré (celui qu'on pilote, ou celui qui l'a déclenché pour l'ordinateur). */
  dore: boolean;
  /** Bonus déjà en jeu ; les autres ne sortent pas au tirage. */
  dispo: boolean;
}

export const DEF_POUVOIRS: Record<PouvoirId, DefPouvoir> = {
  vitesse: { nom: 'SUPER VITESSE', duree: 6, dore: true, dispo: true },
  puissant: { nom: 'SUPER TIR', duree: 10, dore: true, dispo: true },
  freeze: { nom: 'FREEZE', duree: 3, dore: true, dispo: true },
  savon: { nom: 'FULL ESQUIVE', duree: 8, dore: true, dispo: true },
  inversion: { nom: 'INVERSION', duree: 5, dore: true, dispo: true },
  surnombre: { nom: 'SURNOMBRE', duree: 10, dore: false, dispo: true },
  double: { nom: 'BUT X2', duree: 10, dore: false, dispo: true },
  heros: { nom: 'SUPER HEROS', duree: 8, dore: true, dispo: true },
  tremblement: { nom: 'TREMBLEMENT', duree: 2.5, dore: false, dispo: true },
  givre: { nom: 'GIVRE', duree: 7, dore: false, dispo: true },
  geante: { nom: 'CAGE GEANTE', duree: 10, dore: false, dispo: true },
  minicage: { nom: 'MINI CAGE', duree: 10, dore: false, dispo: true },
  endormi: { nom: 'GARDIEN ENDORMI', duree: 6, dore: false, dispo: true },
  blackout: { nom: 'BLACKOUT', duree: 8, dore: true, dispo: true },
  envahissement: { nom: 'FOULE', duree: 8, dore: false, dispo: true },
  loupe: { nom: 'LOUPE COMPLET', duree: 10, dore: false, dispo: true },
  superpasse: { nom: 'SUPER PASSE', duree: 8, dore: false, dispo: true },
};

/**
 * Poids de chaque bonus au tirage (le super héros, qui cumule trois bonus,
 * sort deux fois moins souvent que les autres). C'est ici
 * qu'on pourra plus tard donner plus souvent les bonus puissants à l'équipe
 * menée au score (voir `poidsPouvoirs`).
 */
export const POIDS_POUVOIRS: Record<PouvoirId, number> = {
  vitesse: 1,
  puissant: 1,
  freeze: 1,
  savon: 1,
  inversion: 1,
  surnombre: 1,
  double: 1,
  heros: 0.5,
  tremblement: 1,
  givre: 1,
  geante: 1,
  minicage: 1,
  endormi: 1,
  blackout: 1,
  envahissement: 1,
  loupe: 1,
  superpasse: 1,
};

/** Passes réussies d'affilée pour obtenir un bonus (toujours le même nombre). */
export const SEUIL_PASSES = 4;
/** Durée du tirage (icônes qui défilent dans la case du bonus), en s. */
export const TIRAGE_S = 1.2;
/** Fin d'un bonus : le joueur doré clignote pendant ces dernières secondes. */
export const ALERTE_FIN_S = 2;
/** Super vitesse : vitesse et accélération du joueur doré. */
export const VITESSE_FACTEUR = 1.4;
/** Tir surpuissant : vitesse du palet, bonus de qualité, et adversaires renversés (s au sol, portée en px autour du corps). */
export const PUISSANT_VITESSE = 1.5;
export const PUISSANT_BONUS = 0.2;
export const PUISSANT_CHUTE = 2;
export const PUISSANT_PORTEE = 4;
/** En dessous de cette vitesse (px/s), le tir surpuissant est retombé : il ne renverse plus personne. */
export const PUISSANT_VMIN = 160;
/**
 * Super passe : le palet d'une passe de l'équipe se dirige tout seul vers le
 * receveur (vitesse minimale en px/s), l'adversaire ne peut plus l'intercepter
 * et le receveur le capte de plus loin (px de portée en plus).
 */
export const SUPER_PASSE_VITESSE = 190;
export const SUPER_PASSE_PORTEE = 4;
/** Super héros : les adversaires restent gelés pendant ses premières secondes. */
export const HEROS_FREEZE_S = 3;
/** Tremblement : temps au sol (s) de tous les joueurs sauf le porteur du palet, et de la secousse de l'écran. */
export const TREMBLEMENT_CHUTE = 1.6;
/** Cage géante (cage adverse) et mini cage (sa propre cage) : facteur sur la largeur de l'ouverture. */
export const CAGE_GEANTE = 2;
export const MINI_CAGE = 0.45;
/** Gardien endormi : il ne bouge plus, n'attrape plus rien, et son corps ne couvre plus que cette part. */
export const ENDORMI_RAYON = 0.6;
/** Blackout : l'équipe dans le noir intercepte moins bien (rayon) et vole moins de palets (taux). */
export const BLACKOUT_INTERCEPTION = 0.5;
export const BLACKOUT_VOL = 0.3;
/** Envahissement : nombre de supporters, leur vitesse (px/s), et leur gêne sur un adversaire touché. */
export const ENVAHISSEMENT_N = 5;
export const SUPPORTER_VIT = 125;
export const SUPPORTER_RAYON = 11;
/** Freinage (par s) d'un adversaire accroché par un supporter, et taux (par s) auquel il lâche le palet. */
export const SUPPORTER_FREIN = 7;
export const SUPPORTER_PERTE = 1.4;
/**
 * Loupé complet : durée de la scène, instant où le palet (parti en l'air)
 * rebondit sur le bord de l'écran, et instant où il revient briser la vitre.
 */
export const LOUPE_S = 2.6;
export const LOUPE_REBOND = 0.42;
export const LOUPE_IMPACT = 0.95;
/** Surnombre : rang donné au renfort (hors des rangs de l'effectif, pour le reconnaître). */
export const RANG_RENFORT = 9;
/** Mode entraînement : délai (s) avant que le bonus choisi revienne, après usage. */
export const ENTRAINEMENT_RETOUR_S = 0.8;
