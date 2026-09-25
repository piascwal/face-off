import type { LevelConfig } from './types';

// Pas de temps fixe de la simulation (s). Toute la logique de jeu tourne à ce
// rythme, indépendamment du taux de rafraîchissement de l'écran — c'est ce
// qui permettra plus tard à un serveur de rejouer exactement la même
// simulation qu'un client.
export const PAS = 1 / 120;

export const BUT_DEMI = 15; // demi-largeur de l'ouverture des cages
export const BUT_PROF = 9; // profondeur des filets
export const VMAX = 100; // vitesse de patinage de base (px/s)
export const ACCEL = 640;

export const NIVEAUX: LevelConfig[] = [
  { nom: 'FACILE', vit: 0.8, reac: 0.4, err: 0.085, poke: 0.45, check: 0.5, gk: 1.5, antic: 0.1, portee: 115 },
  { nom: 'NORMAL', vit: 0.93, reac: 0.24, err: 0.05, poke: 0.85, check: 1.1, gk: 1.9, antic: 0.25, portee: 135 },
  { nom: 'PRO', vit: 1.03, reac: 0.11, err: 0.028, poke: 1.35, check: 1.9, gk: 2.4, antic: 0.4, portee: 155 },
];

export const DUREES = [120, 180, 300];
export const EFFECTIFS = [2, 3];
