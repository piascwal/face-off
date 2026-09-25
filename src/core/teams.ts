/**
 * Les équipes jouables. Les stats sont des multiplicateurs (1 = neutre)
 * appliqués par-dessus le niveau de difficulté choisi dans le menu — voir
 * `rules.ts` (`combineProfil`). Elles influencent la simulation pour de vrai :
 * vitesse de patinage, portée/précision de tir, agressivité défensive
 * (échecs et harponnages) et réflexes du gardien. Montpellier a le meilleur
 * profil global, chaque autre équipe est forte sur deux axes et faible sur
 * un ou deux — comme dans un jeu de sport classique.
 */
export interface TeamProfile {
  id: string;
  vit: number;
  tir: number;
  defense: number;
  gardien: number;
}

export const EQUIPES_JOUABLES: TeamProfile[] = [
  { id: 'toulouse', vit: 1.0, tir: 0.95, defense: 1.1, gardien: 1.0 },
  { id: 'nice', vit: 1.1, tir: 1.05, defense: 0.9, gardien: 0.95 },
  { id: 'vaujany', vit: 0.88, tir: 0.92, defense: 1.15, gardien: 1.05 },
  { id: 'nimes', vit: 1.05, tir: 1.1, defense: 0.88, gardien: 0.92 },
  { id: 'grenoble', vit: 1.08, tir: 1.08, defense: 0.95, gardien: 0.98 },
  { id: 'montpellier', vit: 1.12, tir: 1.12, defense: 1.05, gardien: 1.1 },
];

export function trouveEquipe(id: string): TeamProfile {
  return EQUIPES_JOUABLES.find((e) => e.id === id) ?? EQUIPES_JOUABLES[0]!;
}

/** Profil neutre (aucun multiplicateur) : utilisé par le mode démo, qui ne connaît pas d'équipe choisie. */
export const PROFIL_NEUTRE: TeamProfile = { id: 'neutre', vit: 1, tir: 1, defense: 1, gardien: 1 };
