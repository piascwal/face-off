/**
 * Géométrie (en pixels logiques) des commandes tactiles et du bouton pause.
 * Pure fonction de la taille de l'écran — partagée par la détection tactile
 * (src/input) et le rendu des commandes à l'écran (src/render), pour garder
 * une seule source de vérité sur "où sont les boutons".
 */
export const RAYON_JOY = 22;
export const GLISSE_MIN = 6; // en pixels logiques : en dessous, pas de visée manuelle

export const zoneTir = (W: number, H: number) => ({ x: W - 34, y: H - 32, r: 20 });
export const zonePasse = (W: number, H: number) => ({ x: W - 80, y: H - 20, r: 14 });
export const zoneElan = (W: number, H: number) => ({ x: W - 30, y: H - 78, r: 13 });
export const zonePause = (W: number) => ({ x: W - 22, y: 4, w: 16, h: 14 });
