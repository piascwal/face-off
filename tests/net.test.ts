import { describe, expect, it } from 'vitest';
import { calculeRink } from '../src/core/rink';
import { creePartie } from '../src/core/rules';
import { pas } from '../src/core/simulation';
import { INTENT_VIDE, type InputIntent } from '../src/core/types';
import { valideAnnonce, valideSignal } from '../src/net/annuaire';
import { correspond, encodeLongueur, LecteurMqtt, lisPublish, MQTT_PUBLISH, paquetPublish } from '../src/net/mqtt';
import {
  appliqueInstantane,
  decodeInstantane,
  EmetteurEntrees,
  encodeInstantane,
  EntreeDistante,
  lisCtrl,
  lisEvenement,
  SILENCE_ENTREE_S,
} from '../src/net/protocole';
import { adresseSrflx, chiffre, cleReseau, dechiffre, salonPour } from '../src/net/reseau-local';

describe('MQTT minimal', () => {
  it('encode la longueur restante sur 1 à 4 octets', () => {
    expect(encodeLongueur(0)).toEqual([0]);
    expect(encodeLongueur(127)).toEqual([127]);
    expect(encodeLongueur(128)).toEqual([0x80, 1]);
    expect(encodeLongueur(16383)).toEqual([0xff, 0x7f]);
    expect(encodeLongueur(16384)).toEqual([0x80, 0x80, 1]);
  });

  it('recolle des paquets coupés arbitrairement entre trames', () => {
    const charge = new Uint8Array(300).map((_, i) => i & 0xff);
    const a = paquetPublish('faceoff/v1/abc/parties/1234', charge, true);
    const b = paquetPublish('x/y', new Uint8Array([1, 2, 3]), false);
    const flux = new Uint8Array(a.length + b.length);
    flux.set(a);
    flux.set(b, a.length);
    const l = new LecteurMqtt();
    const recus = [...l.pousse(flux.slice(0, 5)), ...l.pousse(flux.slice(5, 200)), ...l.pousse(flux.slice(200))];
    expect(recus).toHaveLength(2);
    expect(recus[0]!.type).toBe(MQTT_PUBLISH);
    const m = lisPublish(recus[0]!);
    expect(m.topic).toBe('faceoff/v1/abc/parties/1234');
    expect(m.retain).toBe(true);
    expect([...m.payload]).toEqual([...charge]);
    expect(lisPublish(recus[1]!).payload).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('applique les jokers de filtre', () => {
    expect(correspond('a/+/c', 'a/b/c')).toBe(true);
    expect(correspond('a/+/c', 'a/b/d')).toBe(false);
    expect(correspond('a/#', 'a/b/c')).toBe(true);
    expect(correspond('a/+', 'a/b/c')).toBe(false);
  });
});

describe('empreinte du réseau local', () => {
  it('lit l’adresse publique des seuls candidats srflx', () => {
    expect(adresseSrflx('candidate:842163049 1 udp 1677729535 203.0.113.7 51234 typ srflx raddr 192.168.1.20 rport 51234')).toBe(
      '203.0.113.7',
    );
    expect(adresseSrflx('candidate:1 1 udp 2122260223 abcd.local 51234 typ host')).toBeNull();
  });

  it('regroupe l’IPv4 publique telle quelle et l’IPv6 par préfixe /64', () => {
    expect(cleReseau('203.0.113.7')).toBe('ip4:203.0.113.7');
    expect(cleReseau('2a01:e0a:1f:2c40:1111:2222:3333:4444')).toBe(cleReseau('2a01:e0a:1f:2c40::9'));
    expect(cleReseau('2a01:e0a:1f:2c40::9')).toBe('ip6:2a01:e0a:1f:2c40');
    expect(cleReseau('abcd.local')).toBeNull();
  });

  it('chiffre les messages : illisibles depuis un autre réseau ou un autre topic', async () => {
    const ici = await salonPour('ip4:203.0.113.7');
    const ailleurs = await salonPour('ip4:198.51.100.9');
    expect(ici.base).not.toContain('203');
    expect(ici.base).not.toBe(ailleurs.base);
    const topic = `${ici.base}/parties/0123456789abcdef`;
    const c = await chiffre(ici, topic, { nom: 'LYNX 12' });
    expect(await dechiffre(ici, topic, c)).toEqual({ nom: 'LYNX 12' });
    expect(await dechiffre(ailleurs, topic, c)).toBeNull();
    expect(await dechiffre(ici, `${ici.base}/parties/fedcba9876543210`, c)).toBeNull();
    c[20] ^= 1;
    expect(await dechiffre(ici, topic, c)).toBeNull();
  });

  it('valide annonces et signaux reçus', () => {
    const ok = { id: '0123456789abcdef', nom: 'LYNX 12', equipe: 'toulouse', effectif: 1, duree: 1, v: 1, t: 1 };
    expect(valideAnnonce(ok, '0123456789abcdef', 0)).not.toBeNull();
    expect(valideAnnonce(ok, 'fedcba9876543210', 0)).toBeNull();
    expect(valideAnnonce({ ...ok, nom: '<script>' }, ok.id, 0)).toBeNull();
    expect(valideAnnonce({ ...ok, effectif: 50 }, ok.id, 0)).toBeNull();
    expect(valideSignal({ type: 'offre', sdp: 'x'.repeat(20_000), nom: 'A' })).toBeNull();
    expect(valideSignal({ type: 'refus', raison: 'complet' })).toEqual({ type: 'refus', raison: 'complet' });
  });
});

describe('protocole de jeu', () => {
  const rinkHote = calculeRink(400, 200);

  function partie() {
    const state = creePartie(rinkHote, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1, humains: [true, true] });
    for (let i = 0; i < 400; i++) pas(rinkHote, state, 1 / 120, (eq) => ({ ...INTENT_VIDE, ix: eq === 0 ? 1 : -1 }));
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
    const client = creePartie(rinkClient, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1, humains: [true, true] });
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
    expect(lisCtrl({ t: 'equipe', equipe: 'nice' })).toEqual({ t: 'equipe', equipe: 'nice' });
    expect(lisCtrl({ t: 'equipe', equipe: '../../x' })).toBeNull();
    expect(lisCtrl({ t: 'inconnu' })).toBeNull();
    expect(lisCtrl({ t: 'salon', hote: { nom: 'A', equipe: 'nice' }, invite: null, effectif: 1, duree: 1 })).not.toBeNull();
    const id = (x: number, y: number): [number, number] => [x + 10, y];
    expect(lisEvenement({ type: 'etincelles', x: 1, y: 2, n: 3 }, id, [1, 1])).toEqual({ type: 'etincelles', x: 11, y: 2, n: 3 });
    expect(lisEvenement({ type: 'eval', x: 1 }, id, [1, 1])).toBeNull();
    expect(lisEvenement({ type: 'bulle', txt: 'x', x: 1, y: 2, c: '#fff', o: { a: 1 } }, id, [1, 1])).toBeNull();
  });
});
