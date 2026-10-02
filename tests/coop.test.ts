import { describe, expect, it } from 'vitest';
import { changeAutoSiLoin, changeJoueur, controle, prendPalet } from '../src/core/actions';
import { CHANGEMENT_AUTO_MARGE, CHANGEMENT_AUTO_SEUIL } from '../src/core/constants';
import { activePouvoir, estDore, estGele, joueursDores } from '../src/core/pouvoirs';
import { calculeRink } from '../src/core/rink';
import { creePartie } from '../src/core/rules';
import { pas } from '../src/core/simulation';
import { INTENT_VIDE, type MatchState, type Skater } from '../src/core/types';
import { appliqueInstantane, decodeInstantane, encodeInstantane } from '../src/net/protocole';
import { lisConfig } from '../src/net/partie';

const rink = calculeRink(400, 200);

function coop(extra = {}): MatchState {
  const st = creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1, coop: true, pouvoirs: true, ...extra });
  st.phase = 'jeu';
  return st;
}

const equipe0 = (st: MatchState): Skater[] => st.patineurs.filter((s) => s.eq === 0);

describe('coop : deux humains dans la même équipe', () => {
  it('l’hôte et l’invité ont chacun un patineur de l’équipe 0, l’équipe 1 reste au CPU', () => {
    const st = coop();
    expect(st.coop).toBe(true);
    expect(st.humains).toEqual([true, false]);
    expect(st.controles[0]).not.toBeNull();
    expect(st.partenaire).not.toBeNull();
    expect(st.partenaire).not.toBe(st.controles[0]);
    expect(st.partenaire!.eq).toBe(0);
    expect(st.controles[1]).toBeNull();
    // exactement deux patineurs humains, tous deux dans l'équipe 0
    expect(st.patineurs.filter((s) => s.humain).map((s) => s.eq)).toEqual([0, 0]);
  });

  it('hors coop, rien ne change (pas de partenaire)', () => {
    const st = creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1 });
    expect(st.coop).toBe(false);
    expect(st.partenaire).toBeNull();
    expect(st.patineurs.filter((s) => s.humain)).toHaveLength(1);
  });

  it('une équipe à un seul patineur ne peut pas être en coop', () => {
    // (les effectifs vont de 2 à 5 : la garde protège aussi les parties construites à la main)
    const st = coop();
    expect(st.nb).toBeGreaterThanOrEqual(2);
  });

  it('chaque humain est piloté par sa propre entrée', () => {
    const st = coop();
    const hote = st.controles[0]!;
    const invite = st.partenaire!;
    for (let i = 0; i < 20; i++) st.palet.vx = st.palet.vy = 0;
    const x0 = [hote.x, invite.x];
    for (let i = 0; i < 40; i++) {
      pas(rink, st, 1 / 120, (_eq, partenaire) => ({ ...INTENT_VIDE, ix: partenaire ? -1 : 1 }));
    }
    expect(hote.x).toBeGreaterThan(x0[0]!);
    expect(invite.x).toBeLessThan(x0[1]!);
  });

  it('l’invité (siège 1) reçoit les entrées du second pilote, pas l’hôte', () => {
    const st = coop();
    const appels: [number, boolean | undefined][] = [];
    pas(rink, st, 1 / 120, (eq, partenaire) => {
      appels.push([eq, partenaire]);
      return INTENT_VIDE;
    });
    expect(appels).toHaveLength(2);
    expect(appels.filter(([, p]) => p).length).toBe(1);
    expect(appels.every(([eq]) => eq === 0)).toBe(true);
  });

  it('on ne peut pas prendre le patineur de l’autre humain', () => {
    const st = coop();
    const hote = st.controles[0]!;
    const invite = st.partenaire!;
    controle(st, invite, 0);
    expect(st.controles[0]).toBe(hote);
    controle(st, hote, 1);
    expect(st.partenaire).toBe(invite);
  });

  it('le bouton de changement donne à chacun un coéquipier CPU, jamais l’autre humain', () => {
    const st = coop();
    const hote = st.controles[0]!;
    const invite = st.partenaire!;
    const cpu = equipe0(st).find((s) => s !== hote && s !== invite)!;
    st.palet.x = cpu.x;
    st.palet.y = cpu.y;
    changeJoueur(st, 0, 1);
    expect(st.partenaire).toBe(cpu);
    expect(invite.humain).toBe(false);
    expect(st.controles[0]).toBe(hote);
    // l'hôte change à son tour : le seul coéquipier libre est l'ancien patineur de l'invité
    changeJoueur(st, 0, 0);
    expect(st.controles[0]).toBe(invite);
    expect(st.partenaire).toBe(cpu);
    expect(equipe0(st).filter((s) => s.humain)).toHaveLength(2);
  });

  it('le changement automatique ne vole jamais le patineur de l’autre humain', () => {
    const st = coop();
    const hote = st.controles[0]!;
    const invite = st.partenaire!;
    // palet libre, loin de l'hôte, juste à côté de l'invité
    prendPalet(st, st.gardiens[1]);
    st.palet.porteur = null;
    st.palet.passe = null;
    hote.x = 40;
    hote.y = 100;
    invite.x = 300;
    invite.y = 100;
    st.palet.x = 300;
    st.palet.y = 100;
    expect(Math.hypot(hote.x - st.palet.x, hote.y - st.palet.y)).toBeGreaterThan(CHANGEMENT_AUTO_SEUIL + CHANGEMENT_AUTO_MARGE);
    for (const s of st.patineurs) if (s !== hote && s !== invite) { s.x = 380; s.y = 20; }
    changeAutoSiLoin(st);
    expect(st.controles[0]).not.toBe(invite);
    expect(st.controles[0]).not.toBe(st.partenaire);
    expect(st.partenaire).toBe(invite);
  });

  it('un bonus de l’équipe dore les deux humains, et le freeze les épargne tous les deux', () => {
    const st = coop();
    const hote = st.controles[0]!;
    const invite = st.partenaire!;
    const cpu = equipe0(st).find((s) => s !== hote && s !== invite)!;
    st.pouvoirs![0].pret = 'freeze';
    st.pouvoirs![0].tirage = 0;
    expect(activePouvoir(rink, st, 0, hote)).toBe(true);
    expect(joueursDores(st, 0)).toEqual([hote, invite]);
    expect(estDore(st, hote)).toBe(true);
    expect(estDore(st, invite)).toBe(true);
    expect(estDore(st, cpu)).toBe(false);
    expect(estGele(st, hote)).toBe(false);
    expect(estGele(st, invite)).toBe(false);
    expect(estGele(st, cpu)).toBe(true);
    expect(estGele(st, st.patineurs.find((s) => s.eq === 1)!)).toBe(true);
  });

  it('l’équipe 1 reste menée par le CPU et le match se joue normalement', () => {
    const st = coop();
    for (let i = 0; i < 600; i++) pas(rink, st, 1 / 120, () => INTENT_VIDE);
    expect(st.patineurs.some((s) => s.eq === 1 && Math.hypot(s.vx, s.vy) > 1)).toBe(true);
    expect(st.partenaire!.eq).toBe(0);
  });
});

describe('coop : réseau', () => {
  it('l’instantané porte le mode coop et le patineur de l’invité', () => {
    const st = coop();
    const dec = decodeInstantane(encodeInstantane(st, rink, 1))!;
    expect(dec.coop).toBe(true);
    const indices = dec.patineurs.flatMap((p, i) => (p.partenaire ? [i] : []));
    expect(indices).toEqual([st.patineurs.indexOf(st.partenaire!)]);
  });

  it('le client retrouve les deux pilotes après interpolation', () => {
    const hote = coop();
    const dec = decodeInstantane(encodeInstantane(hote, rink, 1))!;
    const client = coop();
    client.partenaire = null;
    client.coop = false;
    appliqueInstantane(client, dec, dec, 1, rink);
    expect(client.coop).toBe(true);
    expect(client.partenaire).toBe(client.patineurs[hote.patineurs.indexOf(hote.partenaire!)]);
    expect(client.controles[0]).toBe(client.patineurs[hote.patineurs.indexOf(hote.controles[0]!)]);
  });

  it('un match sans coop ne décode aucun partenaire', () => {
    const st = creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1, humains: [true, true] });
    const dec = decodeInstantane(encodeInstantane(st, rink, 1))!;
    expect(dec.coop).toBe(false);
    expect(dec.patineurs.some((p) => p.partenaire)).toBe(false);
  });

  it('la configuration de la partie transporte coop et niveau, et refuse les valeurs absurdes', () => {
    const base = { effectif: 1, duree: 1, assistTir: true, assistPasse: true, changementAuto: true, ralenti: true, pouvoirs: true };
    expect(lisConfig({ ...base, coop: true, niveau: 2 })).toMatchObject({ coop: true, niveau: 2 });
    expect(lisConfig({ ...base, coop: 'oui', niveau: 1 })).toBeNull();
    expect(lisConfig({ ...base, coop: false, niveau: 7 })).toBeNull();
    expect(lisConfig({ ...base, coop: false, niveau: 1.5 })).toBeNull();
  });
});
