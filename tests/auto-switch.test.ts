import { describe, expect, it } from 'vitest';
import { changeAutoSiLoin, controle } from '../src/core/actions';
import { CHANGEMENT_AUTO_MARGE, CHANGEMENT_AUTO_SEUIL } from '../src/core/constants';
import { nouveauGardien, nouveauPalet, nouveauPatineur } from '../src/core/entities';
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

describe('changement automatique de joueur (palet libre, loin du joueur contrôlé)', () => {
  it('rend la main au coéquipier bien plus proche quand le palet part loin', () => {
    const state = etatVide();
    const loin = nouveauPatineur(0, 0);
    loin.x = 0;
    loin.y = 0;
    const pres = nouveauPatineur(0, 1);
    pres.x = 100;
    pres.y = 0;
    state.patineurs = [loin, pres];
    controle(state, loin);
    state.palet.x = 100 + CHANGEMENT_AUTO_MARGE; // proche de `pres`, loin de `loin`
    state.palet.y = 0;

    changeAutoSiLoin(state);

    expect(state.controles[0]).toBe(pres);
  });

  it("ne change rien si le palet est déjà assez proche du joueur contrôlé", () => {
    const state = etatVide();
    const controlé = nouveauPatineur(0, 0);
    controlé.x = 0;
    controlé.y = 0;
    const autre = nouveauPatineur(0, 1);
    autre.x = 100;
    autre.y = 0;
    state.patineurs = [controlé, autre];
    controle(state, controlé);
    state.palet.x = CHANGEMENT_AUTO_SEUIL - 10;
    state.palet.y = 0;

    changeAutoSiLoin(state);

    expect(state.controles[0]).toBe(controlé);
  });

  it("ne change rien si l'écart entre les deux distances est trop faible (pas de va-et-vient)", () => {
    const state = etatVide();
    const controlé = nouveauPatineur(0, 0);
    controlé.x = 0;
    controlé.y = 0;
    const autre = nouveauPatineur(0, 1);
    autre.x = CHANGEMENT_AUTO_SEUIL + 50;
    autre.y = 0;
    state.patineurs = [controlé, autre];
    controle(state, controlé);
    // légèrement plus proche de `controlé`, mais pas de la marge requise
    state.palet.x = (controlé.x + autre.x) / 2 - 2;
    state.palet.y = 0;

    changeAutoSiLoin(state);

    expect(state.controles[0]).toBe(controlé);
  });

  it('ne change rien tant que quelqu\'un tient le palet', () => {
    const state = etatVide();
    const controlé = nouveauPatineur(0, 0);
    controlé.x = 0;
    controlé.y = 0;
    const autre = nouveauPatineur(0, 1);
    autre.x = 200;
    autre.y = 0;
    state.patineurs = [controlé, autre];
    controle(state, controlé);
    state.palet.x = 200;
    state.palet.y = 0;
    state.palet.porteur = autre;

    changeAutoSiLoin(state);

    expect(state.controles[0]).toBe(controlé);
  });
});
