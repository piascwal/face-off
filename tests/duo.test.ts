import { describe, expect, it } from 'vitest';
import { changeJoueur, controle } from '../src/core/actions';
import { activePouvoir, joueurDore, majPouvoirs, siegeDe } from '../src/core/pouvoirs';
import { calculeRink } from '../src/core/rink';
import { creePartie } from '../src/core/rules';
import { pas } from '../src/core/simulation';
import { INTENT_VIDE, type MatchState, type Skater, type TeamId } from '../src/core/types';
import { appliqueInstantane, decodeInstantane, encodeInstantane } from '../src/net/instantane';

const rink = calculeRink(400, 200);

function quatre(duo: [boolean, boolean] = [true, true], extra = {}): MatchState {
  const st = creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 2, duo, pouvoirs: true, ...extra });
  st.phase = 'jeu';
  return st;
}

const equipe = (st: MatchState, eq: TeamId): Skater[] => st.patineurs.filter((s) => s.eq === eq);

describe('2 contre 2 : deux humains dans chaque équipe', () => {
  it('chaque équipe a deux patineurs humains distincts', () => {
    const st = quatre();
    expect(st.humains).toEqual([true, true]);
    expect(st.duo).toEqual([true, true]);
    for (const eq of [0, 1] as TeamId[]) {
      const [h, p] = [st.controles[eq], st.partenaires[eq]];
      expect(h && p && h !== p).toBe(true);
      expect(h!.eq).toBe(eq);
      expect(p!.eq).toBe(eq);
      expect(equipe(st, eq).filter((s) => s.humain)).toHaveLength(2);
    }
  });

  it('une équipe à un seul humain contre une équipe à deux : 1 contre 2', () => {
    const st = quatre([false, true], { humains: [true, true] });
    expect(st.partenaires[0]).toBeNull();
    expect(st.partenaires[1]).not.toBeNull();
    expect(equipe(st, 0).filter((s) => s.humain)).toHaveLength(1);
    expect(equipe(st, 1).filter((s) => s.humain)).toHaveLength(2);
  });

  it('un humain ne prend jamais le patineur de son coéquipier humain (dans les deux équipes)', () => {
    const st = quatre();
    for (const eq of [0, 1] as TeamId[]) {
      const p = st.partenaires[eq]!;
      controle(st, p, 0);
      expect(st.controles[eq]).not.toBe(p);
      const h = st.controles[eq]!;
      controle(st, h, 1);
      expect(st.partenaires[eq]).not.toBe(h);
    }
  });

  it('le changement de joueur (bouton passe) reste dans l’équipe et évite le coéquipier humain', () => {
    const st = quatre();
    const p1 = st.partenaires[1]!;
    st.palet.x = p1.x;
    st.palet.y = p1.y;
    changeJoueur(st, 1, 0);
    expect(st.controles[1]).not.toBe(p1);
    expect(st.controles[1]!.eq).toBe(1);
    expect(st.partenaires[1]).toBe(p1);
  });

  it('la simulation demande l’entrée de chaque humain avec son rang', () => {
    const st = quatre();
    const appels: string[] = [];
    pas(rink, st, 1 / 120, (eq, partenaire) => {
      appels.push(`${eq}${partenaire ? 'p' : 'h'}`);
      return INTENT_VIDE;
    });
    expect(appels.sort()).toEqual(['0h', '0p', '1h', '1p']);
  });

  it('l’or d’un bonus suit le porteur de l’équipe, sans toucher à l’autre équipe', () => {
    const st = quatre();
    const p1 = st.partenaires[1]!;
    const p = st.pouvoirs![1];
    p.pret = 'puissant';
    p.tirage = 0;
    expect(activePouvoir(rink, st, 1, p1)).toBe(true);
    expect(siegeDe(st, p1)).toBe(1);
    expect(joueurDore(st, 1)).toBe(p1);
    expect(joueurDore(st, 0)).toBeNull();
    // le palet passe à l'autre humain de l'équipe : l'or le suit
    const h1 = st.controles[1]!;
    st.palet.porteur = h1;
    majPouvoirs(rink, st, 1 / 120);
    expect(joueurDore(st, 1)).toBe(h1);
  });

  it('l’instantané porte les deux équipes à deux humains, le client retrouve les quatre pilotes', () => {
    const hote = quatre();
    const dec = decodeInstantane(encodeInstantane(hote, rink, 1))!;
    expect(dec.duo).toEqual([true, true]);
    expect(dec.patineurs.filter((p) => p.partenaire).map((p) => p.eq).sort()).toEqual([0, 1]);
    const client = quatre([false, false]);
    appliqueInstantane(client, dec, dec, 1, rink);
    expect(client.duo).toEqual([true, true]);
    for (const eq of [0, 1] as TeamId[]) {
      expect(client.controles[eq]).toBe(client.patineurs[hote.patineurs.indexOf(hote.controles[eq]!)]);
      expect(client.partenaires[eq]).toBe(client.patineurs[hote.patineurs.indexOf(hote.partenaires[eq]!)]);
    }
  });
});
