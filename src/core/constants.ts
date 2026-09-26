import type { LevelConfig } from './types';

// Pas de temps fixe de la simulation (s). Toute la logique de jeu tourne à ce
// rythme, indépendamment du taux de rafraîchissement de l'écran — c'est ce
// qui permettra plus tard à un serveur de rejouer exactement la même
// simulation qu'un client.
export const PAS = 1 / 120;

export const BUT_DEMI = 16; // demi-largeur de l'ouverture des cages
export const BUT_PROF = 9; // profondeur des filets
export const VMAX = 100; // vitesse de patinage de base (px/s)
export const ACCEL = 640;

export const NIVEAUX: LevelConfig[] = [
  { nom: 'FACILE', vit: 0.8, reac: 0.4, err: 0.085, poke: 0.45, check: 0.5, gk: 1.5, antic: 0.1, portee: 115 },
  { nom: 'NORMAL', vit: 0.93, reac: 0.24, err: 0.05, poke: 0.85, check: 1.1, gk: 1.9, antic: 0.25, portee: 135 },
  { nom: 'PRO', vit: 1.03, reac: 0.11, err: 0.028, poke: 1.35, check: 1.9, gk: 2.4, antic: 0.4, portee: 155 },
];

export const DUREES = [120, 180, 300];
export const EFFECTIFS = [2, 3, 5];

/** Nombre de passes réussies d'affilée pour débloquer un tir spécial. */
export const COMBO_SEUIL = 3;

// Jeu de passes : de quoi rendre une action collective aussi payante qu'une
// échappée en solo (voir actions.ts et physics.ts).
/** Bonus de qualité de tir par passe réussie de la séquence en cours (avant le tir spécial). */
export const COMBO_BONUS = 0.03;
/**
 * Tir sur réception (« une-touche ») : fenêtre après la réception, bonus de
 * qualité, et charge accélérée pour le joueur humain seulement (donnée aussi
 * à l'IA, elle tirait trop vite et le score montait de 20 % en IA contre IA).
 */
export const UNE_TOUCHE_S = 0.8;
export const UNE_TOUCHE_BONUS = 0.06;
export const UNE_TOUCHE_CHARGE = 2;
/** Réception : le coéquipier visé capte de plus loin, un adversaire doit être bien sur la ligne. */
export const RECEPTION_RAYON = 9;
export const INTERCEPTION_RAYON = 6.5;
/**
 * Dans sa propre moitié de patinoire, loin de la pression, une passe réussit
 * plus souvent : réception et interception décalées d'autant (px), et visée
 * deux fois plus précise.
 */
export const PASSE_FACILE_MARGE = 1.5;
/** Le palet est légèrement attiré vers la crosse du receveur dans ce rayon (px). */
export const PASSE_AIMANT = 16;
/** Le gardien pivote moins vite pendant qu'une passe traverse devant lui. */
export const GARDIEN_PASSE_LENTEUR = 0.9;
/**
 * Temps de recharge de l'élan quand on porte le palet (s) : un peu plus long
 * qu'avant (1,4 s), sans casser les échappées en solo.
 */
export const ELAN_CD_PALET = 1.7;
/**
 * Bouton ÉCHEC (le gros bouton, sans le palet) : l'élan vise tout seul le
 * porteur adverse, ou l'adversaire le plus proche, s'il est à cette distance (px).
 */
export const ECHEC_PORTEE = 55;

// Changement automatique de joueur : quand le palet est libre (personne ne le
// tient, pas de passe en cours) et qu'un coéquipier en est nettement plus
// proche que celui qu'on contrôle, la main lui est redonnée sans attendre que
// le joueur appuie sur le bouton de passe. Deux seuils pour éviter les
// changements intempestifs quand deux joueurs sont à peu près à la même
// distance : le palet doit être franchement loin du joueur contrôlé, et
// l'autre doit être nettement plus proche (pas juste d'un cheveu).
export const CHANGEMENT_AUTO_SEUIL = 70;
export const CHANGEMENT_AUTO_MARGE = 24;

