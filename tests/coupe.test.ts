import { describe, expect, it } from 'vitest';
import { NIVEAUX } from '../src/core/constants';
import {
  champion,
  coupeTerminee,
  creeCoupe,
  enregistreResultat,
  lisCoupe,
  matchDuJoueur,
  NB_TOURS,
  niveauDuTour,
  simuleMatch,
  vainqueur,
} from '../src/core/coupe';
import { EQUIPES_JOUABLES } from '../src/core/teams';

/** Générateur pseudo-aléatoire reproductible. */
function graine(n: number): () => number {
  let s = n >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('mode coupe', () => {
  it('tire 8 équipes différentes, le joueur ouvre le tableau', () => {
    const c = creeCoupe('roanne', 'interieur', 0, graine(1));
    const equipes = c.tours[0]!.flatMap((m) => [m.a, m.b]);
    expect(equipes).toHaveLength(8);
    expect(new Set(equipes).size).toBe(8);
    expect(c.tours[0]![0]!.a).toBe('roanne');
    for (const e of equipes) expect(EQUIPES_JOUABLES.some((x) => x.id === e)).toBe(true);
    expect(matchDuJoueur(c)?.adversaire).toBe(c.tours[0]![0]!.b);
  });

  it('la difficulté monte d’un cran par tour, plafonnée', () => {
    const c = creeCoupe('nice', 'interieur', 0, graine(2));
    expect(niveauDuTour(c)).toBe(0);
    c.tour = 1;
    expect(niveauDuTour(c)).toBe(1);
    c.tour = 2;
    expect(niveauDuTour(c)).toBe(Math.min(2, NIVEAUX.length - 1));
    c.niveau = NIVEAUX.length - 1;
    expect(niveauDuTour(c)).toBe(NIVEAUX.length - 1);
  });

  it('trois victoires font un champion', () => {
    const alea = graine(3);
    const c = creeCoupe('ottawa', 'exterieur', 1, alea);
    for (let t = 0; t < NB_TOURS; t++) {
      expect(c.tour).toBe(t);
      const reveles = enregistreResultat(c, 3, 1, false, alea);
      expect(reveles).toEqual([t]);
      // tous les matchs du tour ont un vainqueur
      for (const m of c.tours[t]!) expect(vainqueur(m)).not.toBeNull();
      if (t + 1 < NB_TOURS) expect(c.tours[t + 1]).toHaveLength(4 >> (t + 1));
    }
    expect(coupeTerminee(c)).toBe(true);
    expect(c.elimine).toBe(false);
    expect(champion(c)).toBe('ottawa');
    expect(matchDuJoueur(c)).toBeNull();
  });

  it('les vainqueurs avancent dans l’ordre du tableau', () => {
    const alea = graine(4);
    const c = creeCoupe('grenoble', 'interieur', 0, alea);
    enregistreResultat(c, 2, 0, false, alea);
    const q = c.tours[0]!;
    expect(c.tours[1]!.map((m) => [m.a, m.b])).toEqual([
      [vainqueur(q[0]!), vainqueur(q[1]!)],
      [vainqueur(q[2]!), vainqueur(q[3]!)],
    ]);
  });

  it('éliminé, la coupe se termine en simulation', () => {
    const alea = graine(5);
    const c = creeCoupe('nimes', 'interieur', 0, alea);
    enregistreResultat(c, 2, 1, false, alea);
    const reveles = enregistreResultat(c, 0, 2, false, alea);
    expect(reveles).toEqual([1, 2]);
    expect(c.elimine).toBe(true);
    expect(coupeTerminee(c)).toBe(true);
    const ch = champion(c);
    expect(ch).not.toBeNull();
    expect(ch).not.toBe('nimes');
    expect(c.tours[2]![0]!.a === ch || c.tours[2]![0]!.b === ch).toBe(true);
  });

  it('le joueur côté b est bien noté, une égalité n’est jamais un match nul', () => {
    const alea = graine(6);
    const c = creeCoupe('annecy', 'interieur', 0, alea);
    enregistreResultat(c, 4, 0, false, alea);
    const m = matchDuJoueur(c)!.m;
    // force le joueur côté b
    [m.a, m.b] = [m.b, m.a];
    enregistreResultat(c, 1, 1, true, alea);
    expect(m.sb).toBe(1);
    expect(m.sa).toBe(2);
    expect(m.prol).toBe(true);
    expect(c.elimine).toBe(true);
  });

  it('la simulation donne des scores plausibles et favorise la meilleure équipe', () => {
    const alea = graine(7);
    let fort = 0;
    let buts = 0;
    let prol = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const r = simuleMatch('montpellier', 'marseille', alea);
      expect(r.sa).not.toBe(r.sb);
      if (r.sa! > r.sb!) fort++;
      buts += r.sa! + r.sb!;
      if (r.prol) prol++;
    }
    expect(fort / N).toBeGreaterThan(0.5);
    expect(fort / N).toBeLessThan(0.8);
    expect(buts / N).toBeGreaterThan(4);
    expect(buts / N).toBeLessThan(7.5);
    expect(prol / N).toBeGreaterThan(0.05);
    expect(prol / N).toBeLessThan(0.25);
  });

  it('relit une sauvegarde et rejette une coupe abîmée', () => {
    const alea = graine(8);
    const c = creeCoupe('montreal', 'interieur', 2, alea);
    enregistreResultat(c, 3, 2, true, alea);
    const relue = lisCoupe(JSON.parse(JSON.stringify(c)));
    expect(relue).toEqual(c);
    expect(lisCoupe(null)).toBeNull();
    expect(lisCoupe({ ...c, niveau: 9 })).toBeNull();
    expect(lisCoupe({ ...c, tour: 4 })).toBeNull();
    expect(lisCoupe({ ...c, variante: 'autre' })).toBeNull();
    expect(lisCoupe({ ...c, tours: [c.tours[0], [], []].map((l, i) => (i === 0 ? l!.slice(0, 3) : l)) })).toBeNull();
    expect(lisCoupe({ ...c, equipe: '<img>' })).toBeNull();
    expect(lisCoupe({ ...c, tours: [[{ a: 'nice', b: 'nimes', sa: -1, sb: 0, prol: false }], [], []] })).toBeNull();
  });
});
