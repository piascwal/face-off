/**
 * Les notes des équipes et ce qu'elles changent en jeu.
 *
 * Chaque équipe a sept notes de patineur et une note de gardien, de 70 à 100.
 * Elles s'appliquent à TOUS les patineurs de l'équipe — l'ordinateur comme les
 * humains, le joueur piloté comme ses coéquipiers — mais pas de la même façon :
 * un humain en ressent l'effet sur son patinage, sa frappe et ses passes ;
 * l'ordinateur y ajoute son placement et ses décisions.
 *
 *   vit     vitesse de patinage
 *   att     vitesse quand l'équipe a le palet ; pour l'ordinateur, placement
 *           en attaque (se démarquer, monter)
 *   def     vitesse quand l'adversaire a le palet ; pour l'ordinateur, retour
 *           et placement en défense, coups de crosse
 *   frappe  rapidité de chargement de la jauge de tir
 *   puiss   vitesse du palet à la sortie de la crosse
 *   passe   précision des passes
 *   phys    force des mises en échec données et résistance à celles subies
 *   gardien réflexes du gardien (une note d'équipe)
 *
 * Une note devient un multiplicateur autour de 1 : 85 → 1, et chaque 15 points
 * d'écart valent 15 % × `INFLUENCE_STATS`. Ce coefficient règle d'un coup l'écart
 * entre équipes sans toucher aux notes : à 0, toutes les équipes sont égales ;
 * à 1, de 70 à 100 on va de −15 % à +15 %.
 */

export type StatPatineur = 'vit' | 'att' | 'def' | 'frappe' | 'puiss' | 'passe' | 'phys';
export const STATS_PATINEUR: readonly StatPatineur[] = ['vit', 'att', 'def', 'frappe', 'puiss', 'passe', 'phys'];

export type NotesPatineur = Record<StatPatineur, number>;
export interface NotesEquipe extends NotesPatineur {
  gardien: number;
  /** Les notes du joueur star de l'équipe : pas des notes gonflées, un profil à lui (voir teams.ts). */
  star: NotesPatineur;
}

/** Multiplicateurs d'un patineur, un par stat (1 = neutre). */
export type MultPatineur = Record<StatPatineur, number>;

/**
 * Coefficient global : combien les notes pèsent en jeu (1 = ±15 % entre 70 et 100, 0,6 = ±9 %).
 * Réglé en faisant jouer l'ordinateur contre lui-même : à 0,6, la meilleure équipe marque
 * environ 1,8 fois plus que la plus faible, comme avant l'arrivée des sept notes.
 */
export const INFLUENCE_STATS = 0.6;

/** Ce qu'une note de 85 vaut (le neutre) et l'écart de multiplicateur pour 15 points. */
const NOTE_NEUTRE = 85;
const ECART_PAR_15 = 0.15;

/** Multiplicateur d'une note : 1 à 85, ±0,15 à 70 / 100 (× `influence`). */
export function mult(note: number, influence = INFLUENCE_STATS): number {
  return 1 + ((note - NOTE_NEUTRE) / 15) * ECART_PAR_15 * influence;
}

/** La moyenne des sept notes d'un patineur. */
export const moyenne = (n: NotesPatineur): number => STATS_PATINEUR.reduce((a, k) => a + n[k], 0) / STATS_PATINEUR.length;

export function multPatineur(n: NotesPatineur, influence = INFLUENCE_STATS): MultPatineur {
  const m = {} as MultPatineur;
  for (const k of STATS_PATINEUR) m[k] = mult(n[k], influence);
  return m;
}

/** Tous les multiplicateurs à 1 : un patineur sans équipe jouable (renfort, tests). */
export const MULT_NEUTRE: Readonly<MultPatineur> = { vit: 1, att: 1, def: 1, frappe: 1, puiss: 1, passe: 1, phys: 1 };

/** Les deux profils d'une équipe : le patineur normal et le joueur star. */
export interface ProfilsEquipe {
  normal: MultPatineur;
  star: MultPatineur;
  gardien: number;
}

export function profilsEquipe(n: NotesEquipe, influence = INFLUENCE_STATS): ProfilsEquipe {
  return { normal: multPatineur(n, influence), star: multPatineur(n.star, influence), gardien: mult(n.gardien, influence) };
}

/** Le joueur star d'une équipe : son premier patineur. */
export const RANG_STAR = 0;
export const estStar = (s: { rang: number; renfort: boolean }): boolean => s.rang === RANG_STAR && !s.renfort;

/**
 * Moyennes affichées au choix des équipes : ATT, DEF et globale, sur
 * l'ensemble des patineurs (le star compte comme un patineur parmi `nb`).
 */
export function resumeNotes(n: NotesEquipe, nb = 3): { attaque: number; defense: number; globale: number } {
  const star = n.star;
  const moy = (f: (x: NotesPatineur) => number) => (f(n) * (nb - 1) + f(star)) / nb;
  const attaque = moy((x) => (x.vit + x.att + x.frappe + x.puiss) / 4);
  const defense = (moy((x) => (x.def + x.phys) / 2) + n.gardien) / 2;
  const globale = moy(moyenne) * 0.75 + n.gardien * 0.25;
  return { attaque: Math.round(attaque), defense: Math.round(defense), globale: Math.round(globale) };
}
