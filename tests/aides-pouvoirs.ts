/** Outils communs des tests des bonus : une partie, des passes, un bonus donné à une équipe. */

import { passeVers, prendPalet } from '../src/core/actions';
import { calculeRink } from '../src/core/rink';
import { creePartie } from '../src/core/rules';
import type { MatchState, PouvoirId, Skater, TeamId } from '../src/core/types';

export const rink = calculeRink(400, 200);

export function partie(pouvoirs = true): MatchState {
  const st = creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1, pouvoirs });
  st.phase = 'jeu';
  return st;
}

/** Une passe réussie de `a` vers `b` (réception immédiate). */
export function passe(st: MatchState, a: Skater, b: Skater): void {
  passeVers(st, a, b);
  prendPalet(st, b);
}

/** Enchaîne `n` passes dans l'équipe `eq`, entre ses deux premiers joueurs. */
export function passes(st: MatchState, eq: TeamId, n: number): void {
  const [a, b] = st.patineurs.filter((s) => s.eq === eq);
  prendPalet(st, a!);
  for (let i = 0; i < n; i++) passe(st, i % 2 ? b! : a!, i % 2 ? a! : b!);
}

/** Donne directement un bonus prêt à l'équipe (tirage terminé). */
export function donne(st: MatchState, eq: TeamId, id: PouvoirId): void {
  st.pouvoirs![eq].pret = id;
  st.pouvoirs![eq].tirage = 0;
}
