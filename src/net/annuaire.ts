import { TEXTE_SUR, type Annonce, type ValideContenu } from '@piascwal/lan-kit';
import { estFormat, SPECTATEURS_MAX, type FormatLan } from './partie';

/** Ce que l'hôte annonce sur le réseau : de quoi remplir la liste des parties (aucune donnée sensible). */
export interface AnnonceFaceOff {
  nom: string;
  equipe: string;
  effectif: number;
  duree: number;
  /** La partie est lancée : les sièges sont pris, on ne peut plus que regarder (mode spectateur). */
  enCours: boolean;
  /** Format (combien d'humains de chaque côté) et nombre de joueurs déjà assis. */
  format: FormatLan;
  joueurs: number;
  /** Nombre de spectateurs connectés. */
  spect: number;
  /** Équipe du camp adverse (celui de droite). */
  adverse: string;
  /** Score du match en cours (ou du dernier). */
  score: [number, number];
}

/** Une partie vue sur le réseau : son contenu plus les champs de l'annuaire (id, version, date, salon). */
export type AnnoncePartie = Annonce<AnnonceFaceOff>;

const entier = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Valide le contenu d'une annonce reçue (l'annuaire de lan-kit a déjà validé id, version et date). */
export const valideAnnonceFaceOff: ValideContenu<AnnonceFaceOff> = (a) => {
  if (typeof a.nom !== 'string' || !TEXTE_SUR.test(a.nom)) return null;
  if (typeof a.equipe !== 'string' || !/^[a-z]{2,16}$/.test(a.equipe)) return null;
  if (!entier(a.effectif, 0, 9) || !entier(a.duree, 0, 9)) return null;
  if (typeof a.enCours !== 'boolean' || !entier(a.spect, 0, SPECTATEURS_MAX)) return null;
  if (!estFormat(a.format) || !entier(a.joueurs, 0, 4)) return null;
  if (typeof a.adverse !== 'string' || !/^([a-z]{2,16})?$/.test(a.adverse)) return null;
  const sc = a.score;
  if (!Array.isArray(sc) || sc.length !== 2 || !entier(sc[0], 0, 99) || !entier(sc[1], 0, 99)) return null;
  return {
    nom: a.nom,
    equipe: a.equipe,
    effectif: a.effectif,
    duree: a.duree,
    enCours: a.enCours,
    format: a.format,
    joueurs: a.joueurs,
    spect: a.spect,
    adverse: a.adverse,
    score: [sc[0], sc[1]],
  };
};
