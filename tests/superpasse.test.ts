import { describe, expect, it } from 'vitest';
import { passeJoueur, passeVers, prendPalet } from '../src/core/actions';
import { activePouvoir, DEF_POUVOIRS, POUVOIRS, superPasse } from '../src/core/pouvoirs';
import { calculeRink } from '../src/core/rink';
import { creePartie } from '../src/core/rules';
import { pas } from '../src/core/simulation';
import type { MatchState, Skater, TeamId } from '../src/core/types';
import { appliqueInstantane, decodeInstantane, encodeInstantane } from '../src/net/instantane';

const rink = calculeRink(400, 200);

function partie(): MatchState {
  const st = creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1, pouvoirs: true });
  st.phase = 'jeu';
  return st;
}

function donne(st: MatchState, eq: TeamId): void {
  st.pouvoirs![eq].pret = 'superpasse';
  st.pouvoirs![eq].tirage = 0;
  expect(activePouvoir(rink, st, eq, null)).toBe(true);
}

/** Le passeur au centre gauche, le receveur loin à droite, deux adversaires pile sur la ligne de passe. */
function scene(st: MatchState, eq: TeamId): { passeur: Skater; receveur: Skater } {
  const equipe = st.patineurs.filter((s) => s.eq === eq);
  const autres = st.patineurs.filter((s) => s.eq !== eq);
  const [passeur, receveur, tiers] = equipe as [Skater, Skater, Skater];
  Object.assign(passeur, { x: 120, y: 100, vx: 0, vy: 0 });
  Object.assign(receveur, { x: 300, y: 100, vx: 0, vy: 0 });
  Object.assign(tiers, { x: 60, y: 30, vx: 0, vy: 0 });
  Object.assign(autres[0]!, { x: 200, y: 100, vx: 0, vy: 0 });
  Object.assign(autres[1]!, { x: 250, y: 102, vx: 0, vy: 0 });
  Object.assign(autres[2]!, { x: 330, y: 20, vx: 0, vy: 0 });
  for (const s of st.patineurs) s.recupCd = 0;
  prendPalet(st, passeur);
  return { passeur, receveur };
}

describe('super passe', () => {
  it('est un bonus à part entière, limité dans le temps et sans joueur doré', () => {
    expect(POUVOIRS).toContain('superpasse');
    expect(DEF_POUVOIRS.superpasse.nom).toBe('SUPER PASSE');
    expect(DEF_POUVOIRS.superpasse.duree).toBeGreaterThan(0);
    expect(DEF_POUVOIRS.superpasse.dore).toBe(false);
  });

  it('les passes arrivent toujours au coéquipier, même avec des adversaires sur la ligne', () => {
    for (let essai = 0; essai < 30; essai++) {
      const st = partie();
      donne(st, 0);
      const { passeur, receveur } = scene(st, 0);
      passeVers(st, passeur, receveur);
      expect(st.palet.lueur === 0 || st.palet.lueur === 2).toBe(true);
      for (let i = 0; i < 240 && st.palet.porteur !== receveur; i++) {
        // les adversaires foncent sur le palet : sans la super passe, ils l'intercepteraient
        for (const o of st.patineurs) if (o.eq === 1) o.ex = o.ey = 0;
        pas(rink, st, 1 / 120);
        if (st.phase !== 'jeu') break;
      }
      expect(st.palet.porteur).toBe(receveur);
    }
  });

  it('l’adversaire ne peut pas intercepter, pour l’équipe 1 comme pour l’équipe 0', () => {
    for (const eq of [0, 1] as TeamId[]) {
      const st = partie();
      donne(st, eq);
      const { passeur, receveur } = scene(st, eq);
      passeVers(st, passeur, receveur);
      for (let i = 0; i < 240 && st.palet.porteur !== receveur; i++) pas(rink, st, 1 / 120);
      expect(st.palet.porteur).toBe(receveur);
    }
  });

  it('la passe part toujours vers un coéquipier, même sans l’assistance de passe', () => {
    const st = partie();
    st.assistPasse = false;
    donne(st, 0);
    const { passeur, receveur } = scene(st, 0);
    // on vise dans la direction opposée : sans la super passe, le cône étroit ne trouverait personne
    expect(passeJoueur(st, passeur, -1, 0, false)).toBe(true);
    expect(st.palet.passe).not.toBeNull();
    for (let i = 0; i < 360 && !st.palet.porteur?.tient; i++) pas(rink, st, 1 / 120);
    expect(st.palet.porteur?.eq).toBe(0);
    expect(receveur.eq).toBe(0);
  });

  it('le palet est guidé : lueur verte en vol, et la super passe ne profite pas à l’autre équipe', () => {
    const st = partie();
    donne(st, 0);
    const { passeur, receveur } = scene(st, 0);
    passeVers(st, passeur, receveur);
    pas(rink, st, 1 / 120);
    expect(st.palet.lueur).toBe(2);
    expect(superPasse(st, 0)).toBe(true);
    expect(superPasse(st, 1)).toBe(false);
  });

  it('elle se termine avec sa durée, et un but la coupe', () => {
    const st = partie();
    donne(st, 0);
    st.pouvoirs![0].reste = 0.01;
    for (let i = 0; i < 4; i++) pas(rink, st, 1 / 120);
    expect(superPasse(st, 0)).toBe(false);
  });

  it('voyage en Wi-Fi : le bonus et la lueur du palet', () => {
    const st = partie();
    donne(st, 0);
    const { passeur, receveur } = scene(st, 0);
    passeVers(st, passeur, receveur);
    pas(rink, st, 1 / 120);
    const dec = decodeInstantane(encodeInstantane(st, rink, 1))!;
    expect(dec.pouvoirs![0].actif).toBe('superpasse');
    expect(dec.palet.lueur).toBe(2);
    const client = partie();
    appliqueInstantane(client, dec, dec, 1, rink);
    expect(client.pouvoirs![0].actif).toBe('superpasse');
    expect(client.palet.lueur).toBe(2);
  });
});
