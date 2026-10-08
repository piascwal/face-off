import { describe, expect, it } from 'vitest';
import { LAME_COTE, distanceCrosse, passeVers, pointCrosse, prendPalet } from '../src/core/actions';
import { recuperations } from '../src/core/palet';
import { calculeRink } from '../src/core/rink';
import { creePartie } from '../src/core/rules';
import { pas } from '../src/core/simulation';
import type { MatchState, Skater } from '../src/core/types';

const rink = calculeRink(400, 200);

/** Un patineur seul au centre, palet libre et immobile, tous les autres loin. */
function seul(face: number): { st: MatchState; s: Skater } {
  const st = creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1 });
  st.phase = 'jeu';
  for (const o of st.patineurs) Object.assign(o, { x: rink.cx - 150, y: rink.cy + 80, vx: 0, vy: 0 });
  const s = st.patineurs[0]!;
  Object.assign(s, { x: rink.cx, y: rink.cy, vx: 0, vy: 0, face, recupCd: 0 });
  for (const o of st.patineurs) if (o.tient) o.tient = false;
  Object.assign(st.palet, { porteur: null, passe: null, vx: 0, vy: 0, x: 20, y: 20 });
  return { st, s };
}

/** Le palet libre, posé à (dx, dy) du patineur : est-il ramassé ? */
function ramasse(face: number, dx: number, dy: number): boolean {
  const { st, s } = seul(face);
  st.palet.x = s.x + dx;
  st.palet.y = s.y + dy;
  recuperations(st, 1 / 60);
  return st.palet.porteur === s;
}

describe('la crosse : spatule, conduite et réception du palet', () => {
  it('la spatule est du côté où regarde le sprite (de profil), jamais dans les patins', () => {
    const s = seul(0).s;
    for (const [face, cote] of [[0, 1], [Math.PI, -1], [-Math.PI / 2, 1], [Math.PI / 2, 1], [0.8 * Math.PI, -1]] as const) {
      s.face = face;
      const sp = pointCrosse(s);
      expect(sp.x - s.x).toBe(cote * LAME_COTE);
      // en montant ou en descendant, la spatule ne glisse que de quelques pixels
      expect(Math.abs(sp.y - s.y)).toBeLessThanOrEqual(4);
    }
  });

  it('le palet tenu file sur la spatule', () => {
    for (const face of [0, Math.PI, -Math.PI / 2, Math.PI / 2]) {
      const { st, s } = seul(face);
      for (const o of st.patineurs) Object.assign(o.ia, { t: 99, tx: o.x, ty: o.y });
      prendPalet(st, s);
      st.palet.x = s.x;
      st.palet.y = s.y;
      for (let i = 0; i < 20; i++) pas(rink, st, 1 / 60);
      expect(st.palet.porteur).toBe(s);
      const sp = pointCrosse(s);
      expect(Math.hypot(st.palet.x - sp.x, st.palet.y - sp.y)).toBeLessThan(2);
    }
  });

  it('on ramasse le palet sur la crosse, jusqu’au bout de la spatule', () => {
    expect(ramasse(0, LAME_COTE, 1)).toBe(true);
    expect(ramasse(0, LAME_COTE + 5, 1)).toBe(true);
    expect(ramasse(Math.PI, -LAME_COTE - 5, 1)).toBe(true);
    // en montant : la spatule reste sur le côté du sprite
    expect(ramasse(-Math.PI / 2, LAME_COTE, 0)).toBe(true);
  });

  it('dans les patins, seulement au contact ; plus de ramassage à distance sous les pieds', () => {
    const { s } = seul(0);
    // au contact des patins : contrôlé
    expect(ramasse(0, 0, s.r + 1)).toBe(true);
    // sous les pieds ou derrière, à distance : plus ramassé (avant : jusqu'à 11 px du centre)
    expect(ramasse(0, 0, 10)).toBe(false);
    expect(ramasse(0, -10, 0)).toBe(false);
    expect(ramasse(Math.PI / 2, 0, 10)).toBe(false);
  });

  it('une passe vers l’arrière part de la crosse, pas dans les patins du passeur', () => {
    // le passeur regarde à gauche, le receveur est à droite : sans se tourner, le palet
    // partirait de la spatule côté gauche et rebondirait dans ses propres patins
    for (let essai = 0; essai < 20; essai++) {
      const { st, s } = seul(Math.PI);
      const r = st.patineurs.find((o) => o.eq === s.eq && o !== s)!;
      Object.assign(r, { x: s.x + 110, y: s.y, vx: 0, vy: 0, face: Math.PI });
      for (const o of st.patineurs) Object.assign(o.ia, { t: 99, tx: o.x, ty: o.y });
      prendPalet(st, s);
      passeVers(st, s, r, 0);
      expect(st.palet.vx).toBeGreaterThan(0);
      expect(st.palet.x).toBeGreaterThan(s.x);
      for (let i = 0; i < 90 && !st.palet.porteur; i++) pas(rink, st, 1 / 60);
      expect(st.palet.porteur).toBe(r);
    }
  });

  it('la zone de contrôle va du talon à la spatule', () => {
    const { s } = seul(0);
    const sp = pointCrosse(s);
    expect(distanceCrosse(s, sp.x, sp.y)).toBe(0);
    expect(distanceCrosse(s, s.x + 6, s.y + 1)).toBe(0);
    expect(distanceCrosse(s, s.x - 6, s.y + 1)).toBeGreaterThan(8);
  });
});
