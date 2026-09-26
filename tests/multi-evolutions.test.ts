import { describe, expect, it } from 'vitest';
import { CELEBRATION_S, DUREE_BUT_RALENTI, Ralenti } from '../src/app/ralenti';
import { passeVers, prendPalet, tir } from '../src/core/actions';
import { calculeRink } from '../src/core/rink';
import { creePartie } from '../src/core/rules';
import { pas } from '../src/core/simulation';
import { INTENT_VIDE } from '../src/core/types';
import { appliqueAction, inviteArrive, lisAction, lisEtatPartie, nouvellePartie } from '../src/net/partie';
import { decodeInstantane, encodeInstantane } from '../src/net/protocole';

const rink = calculeRink(400, 200);
const match = (extra = {}) => creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1, ...extra });

describe('handicap', () => {
  it('« 1 but d’avance » fait commencer le match en menant', () => {
    expect(match({ bonus: ['aucun', 'but'] }).score).toEqual([0, 1]);
  });

  it('vitesse et gardien modulent le niveau de l’équipe aidée seulement', () => {
    const neutre = match();
    const aide = match({ bonus: ['vitesse', 'gardien'] });
    expect(aide.nivEq[0].vit).toBeCloseTo(neutre.nivEq[0].vit * 1.1);
    expect(aide.patineurs.find((s) => s.eq === 0)!.vit).toBeCloseTo(neutre.nivEq[0].vit * 1.1);
    expect(aide.gardiens[1].vit).toBeCloseTo(neutre.gardiens[1].vit * 1.2);
    expect(aide.gardiens[0].vit).toBeCloseTo(neutre.gardiens[0].vit);
  });

  it('« tir puissant » fait partir le palet plus vite', () => {
    const vitesse = (bonus: 'aucun' | 'tir') => {
      const st = match({ bonus: [bonus, 'aucun'] });
      const s = st.patineurs[0]!;
      s.tient = true;
      tir(st, rink, s, 0, 0.5);
      return Math.hypot(st.palet.vx, st.palet.vy);
    };
    expect(vitesse('tir')).toBeGreaterThan(vitesse('aucun') * 1.1);
  });

  it('seul l’hôte règle le handicap, et chacun doit revalider', () => {
    const e = nouvellePartie(
      { effectif: 1, duree: 1, assistTir: true, assistPasse: true, changementAuto: true, ralenti: true },
      'LYNX 12',
      'nice',
      '0123456789abcdef',
    );
    inviteArrive(e, 'ORQUE 7', 'nice', 'fedcba9876543210');
    appliqueAction(e, 0, { a: 'lancer' });
    appliqueAction(e, 1, { a: 'pret', pret: true });
    appliqueAction(e, 0, { a: 'bonus', place: 1, bonus: 'gardien' });
    expect(e.bonus).toEqual(['aucun', 'gardien']);
    expect(e.joueurs[1]!.pret).toBe(false);
    appliqueAction(e, 1, { a: 'bonus', place: 1, bonus: 'but' });
    expect(e.bonus[1]).toBe('gardien');
    expect(lisAction({ a: 'bonus', place: 1, bonus: 'but' })).toBeNull();
    expect(lisEtatPartie(JSON.parse(JSON.stringify(e)))?.bonus).toEqual(['aucun', 'gardien']);
  });
});

describe('statistiques de match', () => {
  it('compte passes réussies, meilleure combo et possession', () => {
    const st = match();
    st.phase = 'jeu';
    const [a, b] = st.patineurs.filter((s) => s.eq === 0) as [never, never];
    prendPalet(st, a);
    for (let i = 0; i < 3; i++) {
      passeVers(st, i % 2 ? b : a, i % 2 ? a : b);
      prendPalet(st, st.palet.passe!.vers);
    }
    expect(st.stats.passes[0]).toBe(3);
    expect(st.stats.comboMax[0]).toBe(3);
    for (let i = 0; i < 120; i++) pas(rink, st, 1 / 120, () => INTENT_VIDE);
    expect(st.stats.possession[0] + st.stats.possession[1]).toBeGreaterThan(0.5);
  });

  it('voyagent dans les instantanés réseau', () => {
    const st = match();
    st.stats = { passes: [4, 2], possession: [30.5, 12], checks: [3, 1], comboMax: [4, 2] };
    expect(decodeInstantane(encodeInstantane(st, rink, 1))!.stats).toEqual(st.stats);
  });
});

describe('ralenti des buts', () => {
  it('rejoue les secondes avant le but après la célébration, puis s’arrête', () => {
    const st = match({ dureeBut: DUREE_BUT_RALENTI });
    const r = new Ralenti();
    for (let i = 0; i < 300; i++) {
      st.temps = i / 60;
      st.patineurs[0]!.x = 100 + i * 0.5;
      r.enregistre(decodeInstantane(encodeInstantane(st, rink, i))!);
    }
    st.phase = 'jeu';
    r.maj(st, 1 / 60, false);
    st.phase = 'but';
    r.maj(st, 1 / 60, false);
    expect(r.actif).toBe(false); // célébration en direct d'abord
    st.temps += CELEBRATION_S;
    r.maj(st, 1 / 60, false);
    expect(r.actif).toBe(true);
    const vue = match({ dureeBut: DUREE_BUT_RALENTI });
    r.applique(vue, rink);
    expect(vue.patineurs[0]!.x).toBeLessThan(st.patineurs[0]!.x); // on revoit le passé
    for (let i = 0; i < 1000 && r.actif; i++) r.maj(st, 1 / 60, false);
    expect(r.actif).toBe(false);
    r.maj(st, 1 / 60, false);
    expect(r.actif).toBe(false); // ne repart pas tout seul
  });

  it('s’interrompt dès que le jeu reprend, et reste figé pendant une pause', () => {
    const st = match({ dureeBut: DUREE_BUT_RALENTI });
    const r = new Ralenti();
    for (let i = 0; i < 200; i++) {
      st.temps = i / 60;
      r.enregistre(decodeInstantane(encodeInstantane(st, rink, i))!);
    }
    st.phase = 'but';
    r.maj(st, 0, false);
    st.temps += CELEBRATION_S;
    r.maj(st, 0, false);
    const p0 = r.progression;
    r.maj(st, 0.5, true);
    expect(r.progression).toBe(p0);
    st.phase = 'engagement';
    r.maj(st, 1 / 60, false);
    expect(r.actif).toBe(false);
  });

  it('sans ralenti activé, rien ne se rejoue', () => {
    const st = match();
    const r = new Ralenti();
    for (let i = 0; i < 200; i++) {
      st.temps = i / 60;
      r.enregistre(decodeInstantane(encodeInstantane(st, rink, i))!);
    }
    st.phase = 'but';
    r.maj(st, 0, false);
    st.temps += CELEBRATION_S + 1;
    r.maj(st, 0, false);
    expect(r.actif).toBe(false);
  });
});
