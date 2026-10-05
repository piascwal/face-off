/**
 * Écrans de l'application. Chaque parcours (solo, coupe, Wi-Fi) dessine et
 * pilote les siens ; le noyau (game-app.ts) garde le match lui-même (`jeu`)
 * et la fin de match.
 */
export type EcranUI =
  // solo (parcours-solo.ts)
  | 'menu'
  | 'avance'
  | 'commandes'
  | 'entrainement'
  | 'equipes'
  | 'maillots'
  | 'pause'
  // coupe (parcours-coupe.ts)
  | 'coupeChoix'
  | 'coupe'
  // multijoueur : en ligne ou Wi-Fi (parcours-ligne.ts, parcours-lan.ts)
  | 'multi'
  | 'lanLigne'
  | 'lan'
  | 'lanConfig'
  | 'salon'
  | 'lanRole'
  | 'lanChoix'
  | 'lanSpect'
  // match et fin de match (tous les parcours)
  | 'jeu'
  | 'fin';

/** Écrans de menu plein cadre : ni tableau d'affichage ni bandeau par-dessus. */
export const ECRANS_MENU: EcranUI[] = ['menu', 'avance', 'commandes', 'entrainement', 'equipes', 'maillots', 'coupeChoix', 'coupe', 'multi', 'lanLigne', 'lan', 'lanConfig', 'salon', 'lanRole', 'lanChoix', 'lanSpect'];
