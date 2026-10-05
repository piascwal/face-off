import { nettoiePseudo } from '@piascwal/lan-kit';
import { sauvePreferences, type Preferences } from './preferences';
import { ouvreSaisie } from './saisie';

/** Pendant la frappe : majuscules sans accent, lettres, chiffres et espaces (les espaces de fin restent, on tape le mot suivant). */
const filtrePseudo = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/ {2,}/g, ' ')
    .replace(/^ /, '');

/** Demande un nouveau pseudo au joueur ; il est gardé d'une partie à l'autre et montré aux autres joueurs. */
export function saisitPseudo(pref: Preferences): void {
  ouvreSaisie({
    titre: 'TON PSEUDO',
    valeur: pref.pseudo,
    max: 14,
    filtre: filtrePseudo,
    valide: (t) => nettoiePseudo(t, '') || null,
    erreur: 'LETTRES ET CHIFFRES SEULEMENT',
    surValide: (nom) => {
      pref.pseudo = nom;
      sauvePreferences(pref);
    },
  });
}
