import { describe, expect, it } from 'vitest';
import { passeVers, prendPalet, surReception, tir } from '../src/core/actions';
import { COMBO_BONUS, UNE_TOUCHE_BONUS, UNE_TOUCHE_S } from '../src/core/constants';
import { calculeRink } from '../src/core/rink';
import { creePartie } from '../src/core/rules';
import { pas } from '../src/core/simulation';
import type { MatchState, Skater } from '../src/core/types';

const rink = calculeRink(400, 200);

/** Deux attaquants de l'équipe 0 face au but de droite, le reste loin de l'action. */
function situation(): { st: MatchState; a: Skater; b: Skater } {
  const st = creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1 });
  st.phase = 'jeu';
  for (const s of st.patineurs) {
    s.x = rink.cx - 120;
    s.y = rink.cy + 70;
  }
  const [a, b] = st.patineurs.filter((s) => s.eq === 0) as [Skater, Skater];
  Object.assign(a, { x: rink.butD - 90, y: rink.cy - 30, face: 0, vx: 0, vy: 0 });
  Object.assign(b, { x: rink.butD - 60, y: rink.cy + 25, face: 0, vx: 0, vy: 0 });
  Object.assign(st.gardiens[1]!, { x: rink.butD - 2.5, y: rink.cy });
  return { st, a, b };
}

/** Qualité d'un tir identique, depuis la même position, selon ce qui l'a précédé. */
function qualite(prepare: (st: MatchState, a: Skater, b: Skater) => void): number {
  const { st, a, b } = situation();
  prepare(st, a, b);
  // tir un peu à côté du gardien : qualité de base modeste, pour voir les bonus sans plafond
  const gk = st.gardiens[1]!;
  const ang = Math.atan2(gk.y + 5 - b.y, rink.butD - b.x);
  tir(st, rink, b, ang, 0.8);
  return st.palet.qualite;
}

describe('jeu de passes', () => {
  it('chaque passe de la séquence rend le tir plus dangereux', () => {
    const seul = qualite((st, _a, b) => prendPalet(st, b));
    const apresDeux = qualite((st, _a, b) => {
      prendPalet(st, b);
      st.combo[0] = 2;
      st.reception = null;
    });
    expect(apresDeux).toBeCloseTo(seul + 2 * COMBO_BONUS, 5);
  });

  it('un tir sur réception (une-touche) prend le gardien à contre-pied', () => {
    const seul = qualite((st, _a, b) => prendPalet(st, b));
    const uneTouche = qualite((st, a, b) => {
      prendPalet(st, a);
      st.palet.passe = { vers: b, t: 1 };
      prendPalet(st, b); // passe reçue à l'instant
      expect(surReception(st, b)).toBe(true);
    });
    // la passe compte aussi dans la séquence
    expect(uneTouche).toBeCloseTo(seul + UNE_TOUCHE_BONUS + COMBO_BONUS, 5);
  });

  it('la fenêtre du tir sur réception se referme', () => {
    const { st, a, b } = situation();
    prendPalet(st, a);
    st.palet.passe = { vers: b, t: 1 };
    prendPalet(st, b);
    st.temps += UNE_TOUCHE_S + 0.01;
    expect(surReception(st, b)).toBe(false);
  });

  it('une passe arrive, même au receveur qui ne bouge pas, malgré un adversaire près de la ligne', () => {
    const { st, a, b } = situation();
    const adv = st.patineurs.find((s) => s.eq === 1)!;
    // un adversaire à 11 px de la ligne de passe, au milieu, crosse tournée de l'autre côté
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -(b.y - a.y) / d;
    const ny = (b.x - a.x) / d;
    Object.assign(adv, { x: (a.x + b.x) / 2 + nx * 11, y: (a.y + b.y) / 2 + ny * 11, face: Math.atan2(ny, nx), vx: 0, vy: 0 });
    // tout le monde reste sur place : on teste la réception, pas la course de l'IA vers le palet
    for (const s of st.patineurs) Object.assign(s.ia, { t: 99, tx: s.x, ty: s.y });
    prendPalet(st, a);
    passeVers(st, a, b, 0);
    for (let i = 0; i < 60 && !st.palet.porteur; i++) pas(rink, st, 1 / 60);
    expect(st.palet.porteur).toBe(b);
  });

  it('un but au bout de deux passes est fêté comme un but collectif', () => {
    const { st, b } = situation();
    const gk = st.gardiens[1]!;
    gk.vit = 0;
    gk.a = -1.3;
    prendPalet(st, b);
    st.combo[0] = 2;
    tir(st, rink, b, Math.atan2(rink.cy + 6 - b.y, rink.butD - b.x), 1);
    for (let i = 0; i < 60 && st.phase === 'jeu'; i++) pas(rink, st, 1 / 60);
    const annonce = st.evenements.find((e) => e.type === 'annonce');
    expect(st.score[0]).toBe(1);
    expect(annonce && 'txt' in annonce ? annonce.txt : '').toBe('BUT COLLECTIF !');
  });
});
