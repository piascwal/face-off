import { describe, expect, it } from 'vitest';
import { lancePasse, passeVers, prendPalet, tir } from '../src/core/actions';
import { COMBO_SEUIL } from '../src/core/constants';
import { nouveauGardien, nouveauPalet, nouveauPatineur } from '../src/core/entities';
import { calculeRink } from '../src/core/rink';
import type { MatchState } from '../src/core/types';

function etatVide(): MatchState {
  return {
    mode: 'match',
    niv: { nom: 'NORMAL', vit: 1, reac: 1, err: 0.05, poke: 1, check: 1, gk: 1.9, antic: 0.25, portee: 135 },
    nivEq: [
      { nom: 'NORMAL', vit: 1, reac: 1, err: 0.05, poke: 1, check: 1, gk: 1.9, antic: 0.25, portee: 135 },
      { nom: 'NORMAL', vit: 1, reac: 1, err: 0.05, poke: 1, check: 1, gk: 1.9, antic: 0.25, portee: 135 },
    ],
    nb: 3,
    patineurs: [],
    humains: [true, false],
    controles: [null, null],
    gardiens: [nouveauGardien(0), nouveauGardien(1)],
    palet: nouveauPalet(),
    score: [0, 0],
    tirs: [0, 0],
    arrets: [0, 0],
    horloge: 180,
    prolong: false,
    phase: 'jeu',
    phaseT: 0,
    temps: 0,
    lampe: [0, 0],
    excite: 0,
    marqueur: null,
    buteur: null,
    combo: [0, 0],
    tirSpecialPret: [false, false],
    evenements: [],
    assistTir: true,
    assistPasse: true,
    changementAuto: true,
  };
}

describe('combo de passes -> tir spécial', () => {
  it('augmente la combo à chaque passe reçue, débloque le tir spécial au seuil', () => {
    const state = etatVide();
    const rink = calculeRink(400, 200);
    const passeur = nouveauPatineur(0, 0);
    const receveur = nouveauPatineur(0, 1);
    passeur.x = 100;
    passeur.y = 100;
    receveur.x = 140;
    receveur.y = 100;
    state.patineurs = [passeur, receveur];

    for (let i = 0; i < COMBO_SEUIL; i++) {
      passeVers(state, i % 2 === 0 ? passeur : receveur, i % 2 === 0 ? receveur : passeur);
      // simule la réception : le palet a une cible de passe, on l'y transporte directement
      const cible = state.palet.passe!.vers;
      prendPalet(state, cible);
    }

    expect(state.combo[0]).toBe(COMBO_SEUIL);
    expect(state.tirSpecialPret[0]).toBe(true);

    const tireur = state.controles[0]!;
    tir(state, rink, tireur, Math.atan2(rink.cy - tireur.y, rink.butD - tireur.x), 0.5);

    // un tir consomme toujours la combo et le bonus, spécial ou non
    expect(state.combo[0]).toBe(0);
    expect(state.tirSpecialPret[0]).toBe(false);
  });

  it('réinitialise la combo de l’équipe qui perd le palet (changement de camp)', () => {
    const state = etatVide();
    const a = nouveauPatineur(0, 0);
    const b = nouveauPatineur(1, 0);
    state.patineurs = [a, b];

    prendPalet(state, a);
    state.combo[0] = 2;
    prendPalet(state, b); // le palet passe à l'équipe adverse

    expect(state.combo[0]).toBe(0);
  });

  it('un tir spécial rend le palet statistiquement plus dangereux (qualité augmentée)', () => {
    const state = etatVide();
    const rink = calculeRink(400, 200);
    const s = nouveauPatineur(0, 0);
    s.x = rink.cx - 60;
    s.y = rink.cy;
    state.patineurs = [s];
    const ang = Math.atan2(rink.cy - s.y, rink.butD - s.x);

    state.tirSpecialPret = [false, false];
    tir(state, rink, s, ang, 0.5);
    const qualiteNormale = state.palet.qualite;

    s.tient = true;
    state.tirSpecialPret = [true, false];
    tir(state, rink, s, ang, 0.5);
    const qualiteSpeciale = state.palet.qualite;

    expect(qualiteSpeciale).toBeGreaterThan(qualiteNormale);
  });

  it('lancePasse et le seuil de combo restent cohérents (pas de régression du seuil)', () => {
    expect(COMBO_SEUIL).toBeGreaterThanOrEqual(2);
    // vérifie juste que lancePasse existe et fonctionne sans lever d'exception
    const state = etatVide();
    const m = nouveauPatineur(0, 1);
    m.x = 50;
    m.y = 50;
    state.patineurs = [nouveauPatineur(0, 0), m];
    expect(() => lancePasse(state, 0, 0, m, 0)).not.toThrow();
  });
});
