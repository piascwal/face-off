import { describe, expect, it } from 'vitest';
import { prendPalet, tir } from '../src/core/actions';
import { ENVAHISSEMENT_N, LOUPE_S, majSupporters, DEF_POUVOIRS, majPouvoirs } from '../src/core/pouvoirs';
import { pas } from '../src/core/simulation';
import type { MatchState, PouvoirId, TeamId } from '../src/core/types';
import { appliqueInstantane, decodeInstantane, encodeInstantane } from '../src/net/instantane';
import { donne, partie, rink } from './aides-pouvoirs';

describe('bonus : lot C', () => {
  function lance(st: MatchState, eq: TeamId, id: PouvoirId): void {
    donne(st, eq, id);
    majPouvoirs(rink, st, 1 / 120);
    expect(st.pouvoirs![eq].actif).toBe(id);
  }

  it('envahissement : les supporters entrent, filent sur les adversaires, les freinent, puis repartent', () => {
    const st = partie();
    lance(st, 0, 'envahissement');
    expect(st.supporters).toHaveLength(ENVAHISSEMENT_N);
    expect(st.supporters.every((s) => s.eq === 0 && !s.sortie)).toBe(true);
    // un adversaire qui fonce à côté d'un supporter est freiné net
    const o = st.patineurs.find((s) => s.eq === 1)!;
    const s0 = st.supporters[0]!;
    Object.assign(o, { x: s0.x, y: s0.y, vx: 200, vy: 0, chuteT: 0 });
    majSupporters(rink, st, 1 / 30);
    expect(Math.abs(o.vx)).toBeLessThan(200 * 0.85);
    // ils vont vers les adversaires
    const dist = () =>
      Math.min(
        ...st.supporters.map((s) =>
          Math.min(...st.patineurs.filter((x) => x.eq === 1).map((x) => Math.hypot(x.x - s.x, x.y - s.y))),
        ),
      );
    const d0 = dist();
    for (let i = 0; i < 60; i++) majSupporters(rink, st, 1 / 120);
    expect(dist()).toBeLessThanOrEqual(d0);
    // fin du bonus : ils repartent vers les tribunes, puis disparaissent
    majPouvoirs(rink, st, DEF_POUVOIRS.envahissement.duree);
    expect(st.supporters.every((s) => s.sortie)).toBe(true);
    for (let i = 0; i < 600 && st.supporters.length; i++) majSupporters(rink, st, 1 / 60);
    expect(st.supporters).toHaveLength(0);
  });

  it('envahissement en Wi-Fi : les supporters voyagent dans l’instantané', () => {
    const st = partie();
    st.humains = [true, true];
    lance(st, 1, 'envahissement');
    const inst = decodeInstantane(encodeInstantane(st, rink, 6))!;
    const client = partie();
    appliqueInstantane(client, inst, inst, 1, rink);
    expect(client.supporters).toHaveLength(ENVAHISSEMENT_N);
    expect(client.supporters[2]!.eq).toBe(1);
    expect(client.supporters[2]!.x).toBeCloseTo(st.supporters[2]!.x, 2);
    expect(client.supporters[2]!.img).toBe(st.supporters[2]!.img);
  });

  it('loupé complet : le tir adverse part vers la caméra, l’écran se brise, puis engagement au centre', () => {
    const st = partie();
    lance(st, 0, 'loupe');
    const tireur = st.patineurs.find((s) => s.eq === 1)!;
    prendPalet(st, tireur);
    tir(st, rink, tireur, Math.PI, 1);
    expect(st.phase).toBe('loupe');
    expect(st.pouvoirs![0].actif).toBeNull();
    expect(st.palet.porteur).toBeNull();
    const x0 = st.palet.x;
    let verre = false;
    for (let i = 0; i < LOUPE_S * 120 - 2; i++) {
      pas(rink, st, 1 / 120);
      verre ||= st.evenements.some((e) => e.type === 'verre');
    }
    expect(verre).toBe(true);
    expect(st.palet.x).toBe(x0);
    expect(st.score).toEqual([0, 0]);
    for (let i = 0; i < 4; i++) pas(rink, st, 1 / 120);
    expect(st.phase).toBe('engagement');
    expect(st.palet.x).toBe(rink.cx);
  });

  it('loupé complet : les tirs de l’équipe du bonus partent normalement', () => {
    const st = partie();
    lance(st, 0, 'loupe');
    const s = st.controles[0]!;
    prendPalet(st, s);
    tir(st, rink, s, 0, 1);
    expect(st.phase).toBe('jeu');
    expect(st.pouvoirs![0].actif).toBe('loupe');
    expect(Math.hypot(st.palet.vx, st.palet.vy)).toBeGreaterThan(100);
  });
});
