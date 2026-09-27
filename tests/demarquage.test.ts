import { describe, expect, it } from 'vitest';
import { posteDe } from '../src/core/ai';
import { calculeRink } from '../src/core/rink';
import { creePartie } from '../src/core/rules';
import { pas } from '../src/core/simulation';

const rink = calculeRink(420, 200);

/** Matchs IA contre IA : part des joueurs collés à un coéquipier, et des instants avec une grappe de 3. */
function espacement(effectifIdx: number, matchs: number): { colles: number; grappes: number } {
  let echant = 0;
  let colles = 0;
  let instants = 0;
  let grappes = 0;
  for (let m = 0; m < matchs; m++) {
    const st = creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 0, effectifIdx, humains: [false, false] });
    for (let i = 0; i < 120 * 60 && st.phase !== 'fin'; i++) {
      pas(rink, st, 1 / 120);
      st.evenements.length = 0;
      if (st.phase !== 'jeu' || i % 12) continue;
      for (const eq of [0, 1]) {
        const nous = st.patineurs.filter((s) => s.eq === eq);
        for (const s of nous) {
          echant++;
          if (nous.some((o) => o !== s && Math.hypot(o.x - s.x, o.y - s.y) < 22)) colles++;
        }
        instants++;
        if (nous.some((s) => nous.filter((o) => Math.hypot(o.x - s.x, o.y - s.y) < 35).length >= 3)) grappes++;
      }
    }
  }
  return { colles: colles / echant, grappes: grappes / instants };
}

describe('démarquage des joueurs non contrôlés', () => {
  it('postes : centre, ailiers le long des bandes, défenseurs en couverture', () => {
    const postes = (nb: number) => creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 0, effectifIdx: [2, 3, 5].indexOf(nb) })
      .patineurs.filter((s) => s.eq === 1)
      .map((s) => posteDe(s, nb).poste);
    expect(postes(2)).toEqual(['centre', 'defenseur']);
    expect(postes(3)).toEqual(['centre', 'ailier', 'defenseur']);
    expect(postes(5)).toEqual(['centre', 'ailier', 'ailier', 'defenseur', 'defenseur']);
    // les deux ailiers (et les deux défenseurs) tiennent des couloirs opposés
    const st = creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 0, effectifIdx: 2 });
    const c = st.patineurs.filter((s) => s.eq === 0).map((s) => posteDe(s, 5).couloir);
    expect(Math.sign(c[1]!)).toBe(-Math.sign(c[2]!));
    expect(Math.sign(c[3]!)).toBe(-Math.sign(c[4]!));
  });

  it('en 5 contre 5, les joueurs ne s’agglutinent plus', () => {
    // avant les postes : ~49 % de joueurs collés, une grappe de 3 ~70 % du temps
    const { colles, grappes } = espacement(2, 2);
    expect(colles).toBeLessThan(0.25);
    expect(grappes).toBeLessThan(0.35);
  }, 60_000);
});
