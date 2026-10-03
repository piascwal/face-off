import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculeRink } from '../src/core/rink';
import { creePartie } from '../src/core/rules';
import { pas } from '../src/core/simulation';
import { INTENT_VIDE, type MatchState } from '../src/core/types';
import { appliqueAction, arrive, nouvellePartie, patineurPilote, type ConfigLan, type FormatLan } from '../src/net/partie';

const rink = calculeRink(400, 200);
const CONFIG: ConfigLan = { effectif: 1, duree: 1, assistTir: true, assistPasse: true, changementAuto: true, ralenti: true, pouvoirs: true, format: '1v1', niveau: 1 };
const A = '0123456789abcdef';
const B = 'fedcba9876543210';
const C = '1111111111111111';

/** Une partie Wi-Fi dont les sièges demandés sont pris (l'hôte A est au siège 0). */
function partie(format: FormatLan, sieges: Record<string, 1 | 2 | 3>) {
  const e = nouvellePartie({ ...CONFIG, format }, 'LYNX 12', 'toulouse', A);
  for (const [app, s] of Object.entries(sieges)) {
    arrive(e, 'ORQUE 7', app);
    appliqueAction(e, app, { a: 'siege', siege: s });
  }
  return e;
}

const match = (extra = {}): MatchState => creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1, ...extra });

describe('patineur piloté (commandes, jauge de tir, trait de visée)', () => {
  it('hors Wi-Fi (solo, coupe, entraînement), c’est le patineur contrôlé de l’équipe 0', () => {
    const st = match();
    expect(st.controles[0]).not.toBeNull();
    expect(patineurPilote(st, null, null)).toBe(st.controles[0]);
    // il suit le changement de joueur
    const autre = st.patineurs.find((s) => s.eq === 0 && s !== st.controles[0])!;
    st.controles[0]!.humain = false;
    autre.humain = true;
    st.controles[0] = autre;
    expect(patineurPilote(st, null, null)).toBe(autre);
  });

  it('un spectateur ne pilote personne', () => {
    const e = partie('1v1', { [B]: 2 });
    expect(patineurPilote(match({ humains: [true, true] }), e, null)).toBeNull();
  });

  it('en 1 contre 1, l’hôte pilote l’équipe 0 et l’invité l’équipe 1', () => {
    const e = partie('1v1', { [B]: 2 });
    const st = match({ humains: [true, true] });
    expect(patineurPilote(st, e, 0)).toBe(st.controles[0]);
    expect(patineurPilote(st, e, 2)).toBe(st.controles[1]);
  });

  it('à deux dans une équipe, le second siège pilote le partenaire', () => {
    const e = partie('2v2', { [B]: 1, [C]: 3 });
    const st = match({ humains: [true, true], duo: [true, false] });
    expect(patineurPilote(st, e, 0)).toBe(st.controles[0]);
    expect(patineurPilote(st, e, 1)).toBe(st.partenaires[0]);
    // seul de son équipe au second siège : il est le premier humain du simulateur
    expect(patineurPilote(st, e, 3)).toBe(st.controles[1]);
  });
});

describe('le solo n’est pas touché par les équipes à deux humains', () => {
  it('pas de duo ni de partenaire, un seul humain qui reçoit les entrées', () => {
    const st = match();
    expect(st.duo).toEqual([false, false]);
    expect(st.partenaires).toEqual([null, null]);
    expect(st.humains).toEqual([true, false]);
    st.phase = 'jeu';
    const appels: string[] = [];
    pas(rink, st, 1 / 120, (eq, partenaire) => {
      appels.push(`${eq}${partenaire ? 'p' : ''}`);
      return INTENT_VIDE;
    });
    expect(appels).toEqual(['0']);
  });

  it('le mode démo n’a aucun humain', () => {
    const st = creePartie(rink, { mode: 'demo', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1 });
    expect(st.humains).toEqual([false, false]);
    expect(st.controles).toEqual([null, null]);
  });
});

describe('préférences : l’ancien réglage coop devient un format', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function charge(stocke: Record<string, unknown>) {
    const memoire = new Map([['face-off-v1', JSON.stringify(stocke)]]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => memoire.get(k) ?? null, setItem: (k: string, v: string) => memoire.set(k, v) });
    const { chargePreferences } = await import('../src/app/preferences');
    return chargePreferences();
  }

  it('coop activé → format coop ; sinon 1 contre 1 ; un format valide est gardé', async () => {
    expect((await charge({ coopWifi: true })).formatWifi).toBe('coop');
    expect((await charge({ coopWifi: false })).formatWifi).toBe('1v1');
    expect((await charge({})).formatWifi).toBe('1v1');
    expect((await charge({ formatWifi: '2v2' })).formatWifi).toBe('2v2');
    expect((await charge({ formatWifi: '9v9' })).formatWifi).toBe('1v1');
    expect('coopWifi' in (await charge({ coopWifi: true }))).toBe(false);
  });
});
