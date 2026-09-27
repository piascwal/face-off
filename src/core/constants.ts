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
  { nom: 'FACILE', vit: 0.8, reac: 0.4, err: 0.085, poke: 0.45, check: 0.5, gk: 1.5, antic: 0.1, portee: 115, esquive: 0.1 },
  { nom: 'NORMAL', vit: 0.93, reac: 0.24, err: 0.05, poke: 0.85, check: 1.1, gk: 1.9, antic: 0.25, portee: 135, esquive: 0.25 },
  { nom: 'PRO', vit: 1.03, reac: 0.11, err: 0.028, poke: 1.35, check: 1.9, gk: 2.4, antic: 0.4, portee: 155, esquive: 0.45 },
];

/**
 * Niveau intermédiaire (mode coupe) : `x` fractionnaire entre deux niveaux,
 * chaque réglage de l'IA est interpolé (1,5 = à mi-chemin entre NORMAL et
 * PRO). Un niveau entier renvoie une copie du niveau tel quel.
 */
export function niveauInterpole(x: number): LevelConfig {
  const v = Math.min(NIVEAUX.length - 1, Math.max(0, x));
  if (Number.isInteger(v)) return { ...NIVEAUX[v]! };
  const i = Math.min(NIVEAUX.length - 2, Math.floor(v));
  const u = v - i;
  const a = NIVEAUX[i]!;
  const b = NIVEAUX[i + 1]!;
  const m = (k: Exclude<keyof LevelConfig, 'nom'>) => a[k] + (b[k] - a[k]) * u;
  // un « + » signale un niveau un peu au-dessus de celui qu'on nomme
  return {
    nom: `${NIVEAUX[Math.floor(v)]!.nom}+`,
    vit: m('vit'),
    reac: m('reac'),
    err: m('err'),
    poke: m('poke'),
    check: m('check'),
    gk: m('gk'),
    antic: m('antic'),
    portee: m('portee'),
    esquive: m('esquive'),
  };
}

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

// Esquive : le porteur appuie sur SPRINT pile quand un défenseur arrive en
// mise en échec. Le défenseur passe à côté et reste sonné plus longtemps
// qu'un joueur mis en échec : l'échec reste puissant, mais devient risqué.
/** Distance (px) à laquelle un défenseur en élan (ou qui s'apprête à charger) ouvre la fenêtre d'esquive. */
export const ESQUIVE_PORTEE = 56;
/**
 * L'IA prépare sa mise en échec au moins ce temps (s) avant de charger : le
 * « ! » apparaît sur le porteur dès la préparation, ce qui laisse le temps de
 * réagir (sans elle, l'élan ne durait qu'environ 0,06 s avant le choc). Elle
 * charge ensuite dès qu'elle est assez près, et renonce au bout de `ECHEC_PREPA_MAX`.
 */
export const ECHEC_PREPA = 0.45;
export const ECHEC_PREPA_MAX = 0.9;
/** Durée de l'esquive (s) : le porteur ne peut pas être mis en échec pendant ce temps. */
export const ESQUIVE_T = 0.3;
/** Défenseur esquivé : sonné (s). Une mise en échec réussie sonne 0,8 s. */
export const ESQUIVE_SONNE = 1.2;
/** Appui hors fenêtre : pas d'esquive possible pendant ce temps (s), contre le matraquage du bouton. */
export const ESQUIVE_VERROU = 0.35;
/** Arrêt sur image au moment de l'esquive (s). */
export const ESQUIVE_FIGE = 0.12;
/**
 * Défenseur esquivé : il tombe (pendant tout `ESQUIVE_SONNE`) et glisse sur
 * la glace dans le sens de sa charge — d'abord en plongeon (`CHUTE_PLONGEON`
 * s), puis allongé. Vitesse de départ (px/s) et frottement (/s) : environ
 * 35 px de glissade.
 */
export const CHUTE_PLONGEON = 0.4;
export const CHUTE_GLISSE = 170;
export const CHUTE_FROTTEMENT = 4.5;
/** Impact : le joueur touché passe en blanc un instant (s)… */
export const FLASH_T = 0.1;
/** …et une mise en échec réussie fige l'action un court instant (s). */
export const ECHEC_FIGE = 0.07;
/** Coup de crosse : durée (s), puis recharge (s) avant le suivant. */
export const POKE_T = 0.3;
export const POKE_RECHARGE = 0.35;

// Changement automatique de joueur : quand le palet est libre (personne ne le
// tient, pas de passe en cours) et qu'un coéquipier en est nettement plus
// proche que celui qu'on contrôle, la main lui est redonnée sans attendre que
// le joueur appuie sur le bouton de passe. Deux seuils pour éviter les
// changements intempestifs quand deux joueurs sont à peu près à la même
// distance : le palet doit être franchement loin du joueur contrôlé, et
// l'autre doit être nettement plus proche (pas juste d'un cheveu).
export const CHANGEMENT_AUTO_SEUIL = 70;
export const CHANGEMENT_AUTO_MARGE = 24;

/**
 * Écran de but : durée du bandeau « BUT ! » et de l'écusson (s). La phase
 * « but » dure un peu plus (voir DUREE_BUT dans rules.ts) ; la célébration du
 * buteur qui traverse l'écran doit tenir dedans (voir render/celebration.ts).
 */
export const ANNONCE_BUT_S = 2.9;
