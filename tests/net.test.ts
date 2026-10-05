import { describe, expect, it } from 'vitest';
import { calculeRink } from '../src/core/rink';
import { creePartie } from '../src/core/rules';
import { pas } from '../src/core/simulation';
import { INTENT_VIDE, type InputIntent } from '../src/core/types';
import { valideAnnonceFaceOff } from '../src/net/annuaire';
import { appliqueInstantane, decodeInstantane, encodeInstantane } from '../src/net/instantane';
import { bonjour, lisCtrl, lisEvenement } from '../src/net/protocole';
import { EmetteurEntrees, EntreeDistante, SILENCE_ENTREE_S } from '../src/net/entrees';

describe('annonces reçues', () => {
  it('valide le contenu des annonces reçues', () => {
    const ok = {
      nom: 'LYNX 12',
      equipe: 'toulouse',
      effectif: 1,
      duree: 1,
      enCours: true,
      format: '1v1',
      joueurs: 2,
      spect: 2,
      adverse: 'nice',
      score: [2, 1],
    };
    expect(valideAnnonceFaceOff(ok)).toMatchObject({
      enCours: true,
      format: '1v1',
      joueurs: 2,
      spect: 2,
      adverse: 'nice',
      score: [2, 1],
    });
    expect(valideAnnonceFaceOff({ ...ok, adverse: '' })?.adverse).toBe('');
    expect(valideAnnonceFaceOff({ ...ok, adverse: '../x' })).toBeNull();
    expect(valideAnnonceFaceOff({ ...ok, score: [1, -3] })).toBeNull();
    expect(valideAnnonceFaceOff({ ...ok, spect: 1.5 })).toBeNull();
    expect(valideAnnonceFaceOff({ ...ok, format: 'coop' })?.format).toBe('coop');
    expect(valideAnnonceFaceOff({ ...ok, format: 'oui' })).toBeNull();
    expect(valideAnnonceFaceOff({ ...ok, joueurs: 5 })).toBeNull();
    expect(valideAnnonceFaceOff({ ...ok, spect: 9 })).toBeNull();
    expect(valideAnnonceFaceOff({ ...ok, nom: '<script>' })).toBeNull();
    expect(valideAnnonceFaceOff({ ...ok, effectif: 50 })).toBeNull();
  });
});

describe('protocole de jeu', () => {
  const rinkHote = calculeRink(400, 200);

  function partie() {
    const state = creePartie(rinkHote, {
      mode: 'match',
      niveauIdx: 1,
      dureeIdx: 1,
      effectifIdx: 1,
      humains: [true, true],
    });
    for (let i = 0; i < 400; i++)
      pas(rinkHote, state, 1 / 120, (eq) => ({ ...INTENT_VIDE, ix: eq === 0 ? 1 : -1 }));
    return state;
  }

  it('fait l’aller-retour d’un instantané vers une patinoire de taille différente', () => {
    const hote = partie();
    expect(hote.controles[0]?.eq).toBe(0);
    expect(hote.controles[1]?.eq).toBe(1);
    const inst = decodeInstantane(encodeInstantane(hote, rinkHote, 7))!;
    expect(inst.seq).toBe(7);
    expect(inst.patineurs).toHaveLength(hote.patineurs.length);

    const rinkClient = calculeRink(600, 300);
    const client = creePartie(rinkClient, {
      mode: 'match',
      niveauIdx: 1,
      dureeIdx: 1,
      effectifIdx: 1,
      humains: [true, true],
    });
    appliqueInstantane(client, inst, inst, 1, rinkClient);
    const k = rinkClient.w / rinkHote.w;
    const s0 = hote.patineurs[0]!;
    expect(client.patineurs[0]!.x).toBeCloseTo(rinkClient.x + (s0.x - rinkHote.x) * k, 3);
    expect(client.phase).toBe(hote.phase);
    expect(client.controles[1]).toBe(client.patineurs[hote.patineurs.indexOf(hote.controles[1]!)]);
  });

  it('rejette un instantané tronqué ou corrompu', () => {
    const buf = encodeInstantane(partie(), rinkHote, 1);
    expect(decodeInstantane(buf.slice(0, buf.byteLength - 3))).toBeNull();
    const d = new DataView(buf);
    d.setFloat32(10, NaN); // coordonnée de patinoire
    expect(decodeInstantane(buf)).toBeNull();
  });

  it('transmet chaque appui une seule fois, même avec pertes, doublons et désordre', () => {
    const em = new EmetteurEntrees();
    const hote = new EntreeDistante();
    const i = (p: Partial<InputIntent>): InputIntent => ({ ...INTENT_VIDE, ...p });
    const p0 = em.encode(i({ ix: 0.5 }));
    const p1 = em.encode(i({ tirAppui: true, tirTenu: true })); // perdu
    const p2 = em.encode(i({ tirTenu: true, passeAppui: true }));
    const p3 = em.encode(i({ tirRelache: true }));
    expect(hote.recoit(p0, 0)).toBe(true);
    expect(hote.recoit(p2, 0.01)).toBe(true);
    expect(hote.recoit(p1, 0.02)).toBe(false); // plus ancien : ignoré
    expect(hote.recoit(p2, 0.02)).toBe(false); // doublon
    const a = hote.prochain(0.02);
    expect(a.tirAppui).toBe(true);
    expect(a.tirTenu).toBe(true);
    expect(a.passeAppui).toBe(true);
    const b = hote.prochain(0.03);
    expect(b.tirAppui || b.passeAppui).toBe(false);
    expect(b.tirTenu).toBe(true);
    hote.recoit(p3, 0.04);
    const c = hote.prochain(0.04);
    expect(c.tirRelache).toBe(true);
    expect(c.tirTenu).toBe(false);
    expect(hote.prochain(0.05).tirRelache).toBe(false);
  });

  it('borne les directions et coupe le joueur distant silencieux', () => {
    const hote = new EntreeDistante();
    const em = new EmetteurEntrees();
    hote.recoit(em.encode({ ...INTENT_VIDE, ix: 50, iy: 50 }), 0);
    const e = hote.prochain(0);
    expect(Math.hypot(e.ix, e.iy)).toBeLessThanOrEqual(1.0001);
    expect(hote.prochain(SILENCE_ENTREE_S + 0.1).ix).toBe(0);
  });

  it('valide les messages de contrôle et les évènements', () => {
    expect(lisCtrl({ t: 'action', x: { a: 'equipe', equipe: 'nice' } })).toEqual({
      t: 'action',
      x: { a: 'equipe', equipe: 'nice' },
    });
    expect(lisCtrl({ t: 'action', x: { a: 'equipe', equipe: '../../x' } })).toBeNull();
    // « lancer » est réservé à l'hôte : jamais accepté venant du réseau
    expect(lisCtrl({ t: 'action', x: { a: 'lancer' } })).toBeNull();
    expect(lisCtrl({ t: 'inconnu' })).toBeNull();
    expect(lisCtrl({ t: 'debut', s0: 12 })).toEqual({ t: 'debut', s0: 12 });
    // spectateurs : présentation et réactions
    const b = bonjour('LYNX 12', 'nice', '0123456789abcdef', true);
    expect(lisCtrl(JSON.parse(JSON.stringify(b)))).toEqual(b);
    expect(lisCtrl({ ...b, spect: undefined })).toBeNull();
    // jeton de reconnexion : 32 caractères hexadécimaux
    expect((b as { jeton: string }).jeton).toMatch(/^[0-9a-f]{32}$/);
    expect(lisCtrl({ ...b, jeton: 'abc' })).toBeNull();
    expect(lisCtrl({ ...b, jeton: undefined })).toBeNull();
    expect(lisCtrl({ t: 'reaction', r: 'logo1', de: '' })).toEqual({ t: 'reaction', r: 'logo1', de: '' });
    expect(lisCtrl({ t: 'reaction', r: 'gyro', de: 'OURS 22' })).toEqual({
      t: 'reaction',
      r: 'gyro',
      de: 'OURS 22',
    });
    expect(lisCtrl({ t: 'reaction', r: 'bombe', de: '' })).toBeNull();
    expect(lisCtrl({ t: 'reaction', r: 'feu', de: '<b>' })).toBeNull();
    const id = (x: number, y: number): [number, number] => [x + 10, y];
    expect(lisEvenement({ type: 'etincelles', x: 1, y: 2, n: 3 }, id, [1, 1])).toEqual({
      type: 'etincelles',
      x: 11,
      y: 2,
      n: 3,
    });
    expect(lisEvenement({ type: 'eval', x: 1 }, id, [1, 1])).toBeNull();
    expect(
      lisEvenement({ type: 'bulle', txt: 'x', x: 1, y: 2, c: '#fff', o: { a: 1 } }, id, [1, 1]),
    ).toBeNull();
  });
});
