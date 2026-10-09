/**
 * Les équipes jouables. Chaque équipe a sept notes de patineur (de 70 à 100,
 * voir `stats.ts` pour ce que chacune change en jeu) et une note de gardien.
 * Ce sont les notes des patineurs « normaux » ; le joueur star de l'équipe
 * (le premier patineur) a les mêmes axes, un peu plus haut (`STAR_BONUS`).
 * Montpellier a le meilleur profil global, chaque autre équipe est forte sur
 * deux ou trois axes et faible sur un ou deux — comme dans un jeu de sport
 * classique.
 */
import type { NotesEquipe } from './stats';

export interface TeamProfile extends NotesEquipe {
  id: string;
}

export const EQUIPES_JOUABLES: TeamProfile[] = [
  { id: 'toulouse', vit: 85, att: 82, def: 95, frappe: 80, puiss: 85, passe: 85, phys: 93, gardien: 85 },
  { id: 'nice', vit: 95, att: 93, def: 75, frappe: 90, puiss: 85, passe: 88, phys: 73, gardien: 80 },
  { id: 'vaujany', vit: 73, att: 75, def: 100, frappe: 77, puiss: 85, passe: 82, phys: 100, gardien: 90 },
  { id: 'nimes', vit: 90, att: 93, def: 73, frappe: 95, puiss: 88, passe: 83, phys: 73, gardien: 77 },
  { id: 'grenoble', vit: 93, att: 93, def: 80, frappe: 93, puiss: 89, passe: 88, phys: 78, gardien: 83 },
  { id: 'montpellier', vit: 97, att: 97, def: 90, frappe: 97, puiss: 95, passe: 96, phys: 84, gardien: 95 },
  { id: 'montreal', vit: 95, att: 94, def: 85, frappe: 93, puiss: 90, passe: 93, phys: 81, gardien: 90 },
  { id: 'ducks', vit: 80, att: 79, def: 97, frappe: 77, puiss: 84, passe: 87, phys: 97, gardien: 93 },
  { id: 'marseille', vit: 75, att: 74, def: 100, frappe: 73, puiss: 82, passe: 85, phys: 100, gardien: 95 },
  { id: 'valence', vit: 100, att: 98, def: 73, frappe: 95, puiss: 88, passe: 88, phys: 70, gardien: 75 },
  { id: 'annecy', vit: 83, att: 83, def: 90, frappe: 83, puiss: 85, passe: 85, phys: 90, gardien: 87 },
  { id: 'colorado', vit: 97, att: 96, def: 83, frappe: 95, puiss: 91, passe: 89, phys: 79, gardien: 80 },
  // renards de Roanne : vifs et malins, gardien solide
  { id: 'roanne', vit: 93, att: 88, def: 83, frappe: 82, puiss: 82, passe: 92, phys: 80, gardien: 90 },
  // Senators d'Ottawa : physiques, solides en défense
  { id: 'ottawa', vit: 80, att: 84, def: 95, frappe: 87, puiss: 90, passe: 82, phys: 95, gardien: 85 },
  // Ducs d'Angers : équilibrés, un cran de plus en défense
  { id: 'angers', vit: 87, att: 86, def: 90, frappe: 85, puiss: 87, passe: 86, phys: 88, gardien: 85 },
  // Boxers de Bordeaux : durs au mal, solides derrière, lents à relancer
  { id: 'bordeaux', vit: 79, att: 83, def: 98, frappe: 87, puiss: 91, passe: 83, phys: 98, gardien: 87 },
  // Dragons de Rouen : un tir de feu, une défense plus fragile
  { id: 'rouen', vit: 83, att: 90, def: 80, frappe: 97, puiss: 91, passe: 84, phys: 82, gardien: 85 },
  // Oilers d'Edmonton : l'attaque avant tout, rapides, un gardien moyen
  { id: 'edmonton', vit: 100, att: 100, def: 70, frappe: 100, puiss: 90, passe: 88, phys: 70, gardien: 77 },
  // Blackhawks de Chicago : complets, un bon gardien
  { id: 'chicago', vit: 92, att: 89, def: 90, frappe: 85, puiss: 87, passe: 93, phys: 86, gardien: 93 },
  // Castres Hockey Club : l'éclair de l'écusson, vifs en attaque, une défense plus légère
  { id: 'castres', vit: 95, att: 92, def: 79, frappe: 89, puiss: 86, passe: 89, phys: 76, gardien: 83 },
];

/** Des notes à 85 partout : tous les multiplicateurs valent 1 (le mode démo, qui n'a pas d'équipes jouables). */
export const PROFIL_NEUTRE: TeamProfile = { id: 'neutre', vit: 85, att: 85, def: 85, frappe: 85, puiss: 85, passe: 85, phys: 85, gardien: 85 };

export function trouveEquipe(id: string): TeamProfile {
  return EQUIPES_JOUABLES.find((e) => e.id === id) ?? EQUIPES_JOUABLES[0]!;
}
