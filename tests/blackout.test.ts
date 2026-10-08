import { describe, expect, it } from 'vitest';
import { changeAutoSiLoin } from '../src/core/actions';
import { activePouvoir } from '../src/core/pouvoirs';
import { calculeRink } from '../src/core/rink';
import { creePartie } from '../src/core/rules';
import { pas } from '../src/core/simulation';
import type { MatchState, Skater, TeamId } from '../src/core/types';

const rink = calculeRink(400, 200);

function partie(): MatchState {
  const st = creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1, pouvoirs: true });
  st.phase = 'jeu';
  return st;
}

/** Le patineur piloté, loin d'un palet libre, et un coéquipier assez près du palet pour que la main change toute seule. */
function paletLoin(st: MatchState): { c: Skater; autre: Skater; remet: () => void } {
  const c = st.controles[0]!;
  const autre = st.patineurs.find((s) => s.eq === 0 && s !== c && !s.humain)!;
  const remet = () => {
    // tous les autres restent loin du palet : seul le changement automatique peut changer la main
    for (const s of st.patineurs) if (s !== c && s !== autre) Object.assign(s, { x: 30, y: 190, vx: 0, vy: 0 });
    Object.assign(c, { x: 80, y: 40, vx: 0, vy: 0 });
    Object.assign(st.palet, { x: 320, y: 150, vx: 0, vy: 0, porteur: null, passe: null });
    Object.assign(autre, { x: 285, y: 150, vx: 0, vy: 0, sonne: 0 });
  };
  remet();
  return { c, autre, remet };
}

describe('blackout : le joueur piloté ne saute pas d’un patineur à l’autre', () => {
  it('sans blackout, la main passe au coéquipier proche d’un palet libre et lointain', () => {
    const st = partie();
    const { c } = paletLoin(st);
    changeAutoSiLoin(st);
    expect(st.controles[0]).not.toBe(c);
  });

  for (const eqBlackout of [0, 1] as TeamId[]) {
    it(`pendant un blackout de l’équipe ${eqBlackout}, la main ne change pas toute seule`, () => {
      const st = partie();
      st.pouvoirs![eqBlackout].pret = 'blackout';
      st.pouvoirs![eqBlackout].tirage = 0;
      expect(activePouvoir(rink, st, eqBlackout, null)).toBe(true);
      const { c, remet } = paletLoin(st);
      for (let i = 0; i < 120; i++) {
        remet();
        pas(rink, st, 1 / 120);
        expect(st.controles[0]).toBe(c);
      }
    });
  }

  it('la main change de nouveau à la fin du blackout', () => {
    const st = partie();
    st.pouvoirs![1].pret = 'blackout';
    st.pouvoirs![1].tirage = 0;
    activePouvoir(rink, st, 1, null);
    st.pouvoirs![1].actif = null;
    const { c } = paletLoin(st);
    changeAutoSiLoin(st);
    expect(st.controles[0]).not.toBe(c);
  });
});
