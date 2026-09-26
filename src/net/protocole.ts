import type { GameEvent, GamePhase, InputIntent, MatchState, Rink, TeamId } from '@core/types';
import { angDiff } from '@core/utils';
import { lisAction, lisEtatPartie, type ActionLan, type EtatPartieLan } from './partie';
import { VERSION_PROTOCOLE } from './reseau-local';

/**
 * Protocole de jeu en réseau local — hôte autoritaire :
 * - l'hôte fait tourner la simulation (game-core, pas fixe 120 Hz) avec
 *   l'entrée du client pour l'équipe 1 ;
 * - il envoie ~60 instantanés binaires par seconde (canal `jeu`) et les
 *   évènements de jeu (sons, particules, annonces) sur le canal fiable ;
 * - le client affiche avec un léger retard adaptatif et interpole entre
 *   deux instantanés : mouvement fluide même si le Wi-Fi hoquette.
 * Tout ce qui arrive du réseau est validé (tailles, bornes, valeurs finies)
 * avant de toucher à l'état : un pair ne peut ni faire planter l'autre, ni
 * piloter autre chose que son propre joueur.
 */

export type { VarianteMaillot } from './partie';

export type MsgCtrl =
  | { t: 'bonjour'; v: number; nom: string; equipe: string }
  /** État de la partie (salle d'attente, choix, votes, pause), diffusé par l'hôte à chaque changement. */
  | { t: 'etat'; e: EtatPartieLan }
  /** Action du client sur ses propres choix (équipe, maillot, prêt, vote, pause). */
  | { t: 'action'; x: ActionLan }
  /** Un match commence avec l'état diffusé juste avant ; `s0` = numéro de son premier instantané. */
  | { t: 'debut'; s0: number }
  /** Évènements d'un pas, datés en temps de simulation (`k`) pour être joués en phase avec l'image. */
  | { t: 'ev'; k: number; l: unknown[] }
  | { t: 'ping'; k: number }
  | { t: 'pong'; k: number }
  | { t: 'quitte' }
  | { t: 'exclu' };

const NOM_SUR = /^[A-Z0-9 ]{1,14}$/;
const EQUIPE_SURE = /^[a-z]{2,16}$/;

/** Valide un message du canal de contrôle ; renvoie null s'il est mal formé. */
export function lisCtrl(o: unknown): MsgCtrl | null {
  if (!o || typeof o !== 'object') return null;
  const m = o as Record<string, unknown>;
  switch (m.t) {
    case 'bonjour':
      return typeof m.v === 'number' && typeof m.nom === 'string' && NOM_SUR.test(m.nom) && typeof m.equipe === 'string' && EQUIPE_SURE.test(m.equipe)
        ? { t: 'bonjour', v: m.v, nom: m.nom, equipe: m.equipe }
        : null;
    case 'etat': {
      const e = lisEtatPartie(m.e);
      return e ? { t: 'etat', e } : null;
    }
    case 'action': {
      const x = lisAction(m.x);
      return x ? { t: 'action', x } : null;
    }
    case 'debut':
      return typeof m.s0 === 'number' && Number.isInteger(m.s0) && m.s0 >= 0 ? { t: 'debut', s0: m.s0 } : null;
    case 'ev':
      return Array.isArray(m.l) && m.l.length <= 200 && typeof m.k === 'number' && Number.isFinite(m.k) ? { t: 'ev', k: m.k, l: m.l } : null;
    case 'ping':
    case 'pong':
      return typeof m.k === 'number' && Number.isFinite(m.k) ? { t: m.t, k: m.k } : null;
    case 'quitte':
    case 'exclu':
      return { t: m.t };
    default:
      return null;
  }
}

export function bonjour(nom: string, equipe: string): MsgCtrl {
  return { t: 'bonjour', v: VERSION_PROTOCOLE, nom, equipe };
}

// ------------------------------------------------------------ évènements --

const TYPES_EVENEMENTS = new Set<GameEvent['type']>([
  'frappe',
  'touche',
  'bande',
  'poteau',
  'jambiere',
  'charge',
  'elan',
  'raclement',
  'clic',
  'sifflet',
  'klaxon',
  'ovation',
  'but',
  'arret',
  'vole',
  'check',
  'etincelles',
  'neige',
  'confettis',
  'secousse',
  'flash',
  'vibre',
  'bulle',
  'annonce',
]);

/** Prépare les évènements d'un pas pour l'envoi (les références d'objets ne voyagent pas). */
export function evenementsPourEnvoi(evs: GameEvent[]): unknown[] {
  return evs.map((e) => (e.type === 'but' ? { type: 'but', eq: e.eq, buteur: null } : e));
}

/**
 * Reconstruit un évènement reçu : type connu, uniquement des valeurs
 * primitives bornées, puis coordonnées ramenées dans la patinoire locale.
 */
export function lisEvenement(o: unknown, versLocal: (x: number, y: number) => [number, number], echelle: [number, number]): GameEvent | null {
  if (!o || typeof o !== 'object') return null;
  const src = o as Record<string, unknown>;
  if (typeof src.type !== 'string' || !TYPES_EVENEMENTS.has(src.type as GameEvent['type'])) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k.length > 12) return null;
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || Math.abs(v) > 1e5) return null;
      out[k] = v;
    } else if (typeof v === 'string') {
      if (v.length > 40) return null;
      out[k] = v;
    } else if (typeof v === 'boolean' || v === null) {
      out[k] = v;
    } else if (Array.isArray(v)) {
      if (v.length > 8 || !v.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 5000)) return null;
      out[k] = [...v];
    } else return null;
  }
  if (typeof out.x === 'number' && typeof out.y === 'number') {
    const [x, y] = versLocal(out.x, out.y);
    out.x = x;
    out.y = y;
  }
  if (typeof out.vx === 'number') out.vx *= echelle[0];
  if (typeof out.vy === 'number') out.vy *= echelle[1];
  return out as unknown as GameEvent;
}

// ------------------------------------------------------------ instantanés --

const TYPE_INSTANTANE = 1;
const TYPE_ENTREE = 2;
const PHASES: GamePhase[] = ['engagement', 'jeu', 'but', 'fin'];
const F_PATINEUR = 14;
const TAILLE_PATINEUR = F_PATINEUR * 4 + 1;
const TAILLE_GARDIEN = 5 * 4;
const TAILLE_ENTETE = 1 + 1 + 4 + 4 + 16 + 1 + 4 + 4 + 1 + 8 + 12 + 2 + 2 + 1;
const TAILLE_PALET = 4 * 4 + 1;
export const PATINEURS_MAX = 12;

export interface EtatPatineur {
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  charge: number;
  elanT: number;
  elanCd: number;
  sonne: number;
  anim: number;
  pokeT: number;
  ex: number;
  ey: number;
  vise: number | null;
  tient: boolean;
  arme: boolean;
  humain: boolean;
}

export interface EtatGardien {
  a: number;
  x: number;
  y: number;
  tient: number;
  secoue: number;
}

export interface Instantane {
  seq: number;
  temps: number;
  rink: { x: number; y: number; w: number; h: number };
  phase: GamePhase;
  phaseT: number;
  horloge: number;
  prolong: boolean;
  tirSpecialPret: [boolean, boolean];
  marqueur: TeamId | null;
  humains: [boolean, boolean];
  score: [number, number];
  tirs: [number, number];
  lampe: [number, number];
  excite: number;
  combo: [number, number];
  controles: [number, number];
  patineurs: EtatPatineur[];
  gardiens: [EtatGardien, EtatGardien];
  palet: { x: number; y: number; vx: number; vy: number; porteur: number };
}

/** Porteur du palet : -1 personne, 0..n-1 un patineur, 100/101 un gardien. */
function indexPorteur(state: MatchState): number {
  const p = state.palet.porteur;
  if (!p) return -1;
  const i = state.patineurs.indexOf(p as never);
  if (i >= 0) return i;
  return 100 + p.eq;
}

export function encodeInstantane(state: MatchState, rink: Rink, seq: number): ArrayBuffer {
  const n = Math.min(PATINEURS_MAX, state.patineurs.length);
  const buf = new ArrayBuffer(TAILLE_ENTETE + n * TAILLE_PATINEUR + 2 * TAILLE_GARDIEN + TAILLE_PALET);
  const d = new DataView(buf);
  let o = 0;
  const u8 = (v: number) => d.setUint8(o++, v);
  const i8 = (v: number) => d.setInt8(o++, v);
  const u16 = (v: number) => {
    d.setUint16(o, Math.min(65535, v));
    o += 2;
  };
  const u32 = (v: number) => {
    d.setUint32(o, v >>> 0);
    o += 4;
  };
  const f = (v: number) => {
    d.setFloat32(o, v);
    o += 4;
  };
  u8(TYPE_INSTANTANE);
  u8(VERSION_PROTOCOLE);
  u32(seq);
  f(state.temps);
  f(rink.x);
  f(rink.y);
  f(rink.w);
  f(rink.h);
  u8(PHASES.indexOf(state.phase));
  f(state.phaseT);
  f(state.horloge);
  u8(
    (state.prolong ? 1 : 0) |
      (state.tirSpecialPret[0] ? 2 : 0) |
      (state.tirSpecialPret[1] ? 4 : 0) |
      (state.marqueur !== null ? 8 : 0) |
      (state.marqueur === 1 ? 16 : 0) |
      (state.humains[0] ? 32 : 0) |
      (state.humains[1] ? 64 : 0),
  );
  u16(state.score[0]);
  u16(state.score[1]);
  u16(state.tirs[0]);
  u16(state.tirs[1]);
  f(state.lampe[0]);
  f(state.lampe[1]);
  f(state.excite);
  u8(Math.min(255, state.combo[0]));
  u8(Math.min(255, state.combo[1]));
  i8(state.controles[0] ? state.patineurs.indexOf(state.controles[0]) : -1);
  i8(state.controles[1] ? state.patineurs.indexOf(state.controles[1]) : -1);
  u8(n);
  for (let i = 0; i < n; i++) {
    const s = state.patineurs[i]!;
    for (const v of [s.x, s.y, s.vx, s.vy, s.face, s.charge, s.elanT, s.elanCd, s.sonne, s.anim, s.pokeT, s.ex, s.ey]) f(v);
    f(s.vise ?? NaN);
    u8((s.tient ? 1 : 0) | (s.arme ? 2 : 0) | (s.humain ? 4 : 0));
  }
  for (const gk of state.gardiens) for (const v of [gk.a, gk.x, gk.y, gk.tient, gk.secoue]) f(v);
  const p = state.palet;
  f(p.x);
  f(p.y);
  f(p.vx);
  f(p.vy);
  i8(indexPorteur(state));
  return buf;
}

/** Décode un instantané ; null si la taille, la version ou une valeur est incohérente. */
export function decodeInstantane(buf: ArrayBuffer): Instantane | null {
  if (buf.byteLength < TAILLE_ENTETE) return null;
  const d = new DataView(buf);
  let o = 0;
  let sain = true;
  const u8 = () => d.getUint8(o++);
  const i8 = () => d.getInt8(o++);
  const u16 = () => {
    const v = d.getUint16(o);
    o += 2;
    return v;
  };
  const u32 = () => {
    const v = d.getUint32(o);
    o += 4;
    return v;
  };
  const f = () => {
    const v = d.getFloat32(o);
    o += 4;
    if (!Number.isFinite(v) || Math.abs(v) > 1e6) sain = false;
    return v;
  };
  const fNul = () => {
    const v = d.getFloat32(o);
    o += 4;
    return Number.isFinite(v) ? v : null;
  };
  if (u8() !== TYPE_INSTANTANE || u8() !== VERSION_PROTOCOLE) return null;
  const seq = u32();
  const temps = f();
  const rink = { x: f(), y: f(), w: f(), h: f() };
  const phase = PHASES[u8()];
  const phaseT = f();
  const horloge = f();
  const fl = u8();
  const score: [number, number] = [u16(), u16()];
  const tirs: [number, number] = [u16(), u16()];
  const lampe: [number, number] = [f(), f()];
  const excite = f();
  const combo: [number, number] = [u8(), u8()];
  const controles: [number, number] = [i8(), i8()];
  const n = u8();
  if (!phase || n > PATINEURS_MAX || rink.w < 10 || rink.h < 10) return null;
  if (buf.byteLength !== TAILLE_ENTETE + n * TAILLE_PATINEUR + 2 * TAILLE_GARDIEN + TAILLE_PALET) return null;
  const patineurs: EtatPatineur[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y, vx, vy, face, charge, elanT, elanCd, sonne, anim, pokeT, ex, ey] = Array.from({ length: 13 }, f) as number[];
    const vise = fNul();
    const b = u8();
    patineurs.push({
      x: x!,
      y: y!,
      vx: vx!,
      vy: vy!,
      face: face!,
      charge: charge!,
      elanT: elanT!,
      elanCd: elanCd!,
      sonne: sonne!,
      anim: anim!,
      pokeT: pokeT!,
      ex: ex!,
      ey: ey!,
      vise,
      tient: (b & 1) !== 0,
      arme: (b & 2) !== 0,
      humain: (b & 4) !== 0,
    });
  }
  const gardien = (): EtatGardien => ({ a: f(), x: f(), y: f(), tient: f(), secoue: f() });
  const gardiens: [EtatGardien, EtatGardien] = [gardien(), gardien()];
  const palet = { x: f(), y: f(), vx: f(), vy: f(), porteur: i8() };
  if (!sain) return null;
  return {
    seq,
    temps,
    rink,
    phase,
    phaseT,
    horloge,
    prolong: (fl & 1) !== 0,
    tirSpecialPret: [(fl & 2) !== 0, (fl & 4) !== 0],
    marqueur: fl & 8 ? (fl & 16 ? 1 : 0) : null,
    humains: [(fl & 32) !== 0, (fl & 64) !== 0],
    score,
    tirs,
    lampe,
    excite,
    combo,
    controles,
    patineurs,
    gardiens,
    palet,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Écrit dans `state` (côté client) l'état interpolé entre deux instantanés
 * `a` et `b` (`t` ∈ [0,1]), converti de la patinoire de l'hôte vers la
 * patinoire locale (les deux écrans n'ont pas forcément la même taille).
 */
export function appliqueInstantane(state: MatchState, a: Instantane, b: Instantane, t: number, local: Rink): void {
  const r = b.rink;
  const kx = local.w / r.w;
  const ky = local.h / r.h;
  const X = (x: number) => local.x + (x - r.x) * kx;
  const Y = (y: number) => local.y + (y - r.y) * ky;
  // un saut (remise en jeu après un but) ne s'interpole pas : on se cale sur `b`
  const pos = (xa: number, xb: number, ya: number, yb: number): [number, number] =>
    Math.hypot(xb - xa, yb - ya) > 40 ? [xb, yb] : [lerp(xa, xb, t), lerp(ya, yb, t)];

  state.temps = lerp(a.temps, b.temps, t);
  state.phase = b.phase;
  state.phaseT = b.phaseT;
  state.horloge = b.horloge;
  state.prolong = b.prolong;
  state.tirSpecialPret = [...b.tirSpecialPret];
  state.marqueur = b.marqueur;
  state.humains = [...b.humains];
  state.score = [...b.score];
  state.tirs = [...b.tirs];
  state.lampe = [...b.lampe];
  state.excite = b.excite;
  state.combo = [...b.combo];

  const n = Math.min(state.patineurs.length, b.patineurs.length);
  for (let i = 0; i < n; i++) {
    const s = state.patineurs[i]!;
    const sb = b.patineurs[i]!;
    const sa = a.patineurs[i] ?? sb;
    const [x, y] = pos(sa.x, sb.x, sa.y, sb.y);
    s.x = X(x);
    s.y = Y(y);
    s.vx = sb.vx * kx;
    s.vy = sb.vy * ky;
    s.face = sa.face + angDiff(sa.face, sb.face) * t;
    s.charge = sb.charge;
    s.elanT = sb.elanT;
    s.elanCd = sb.elanCd;
    s.sonne = sb.sonne;
    s.anim = lerp(sa.anim, sb.anim, t);
    s.pokeT = sb.pokeT;
    s.ex = sb.ex;
    s.ey = sb.ey;
    s.vise = sb.vise;
    s.tient = sb.tient;
    s.arme = sb.arme;
    s.humain = sb.humain;
  }
  for (const eq of [0, 1] as TeamId[]) {
    const ga = a.gardiens[eq];
    const gb = b.gardiens[eq];
    const gk = state.gardiens[eq];
    const [x, y] = pos(ga.x, gb.x, ga.y, gb.y);
    gk.x = X(x);
    gk.y = Y(y);
    gk.a = lerp(ga.a, gb.a, t);
    gk.tient = gb.tient;
    gk.secoue = gb.secoue;
    const ic = b.controles[eq];
    state.controles[eq] = ic >= 0 && ic < n ? state.patineurs[ic]! : null;
  }
  const pa = a.palet;
  const pb = b.palet;
  const p = state.palet;
  const [px, py] = pos(pa.x, pb.x, pa.y, pb.y);
  p.x = X(px);
  p.y = Y(py);
  p.vx = pb.vx * kx;
  p.vy = pb.vy * ky;
  p.porteur = pb.porteur >= 0 && pb.porteur < n ? state.patineurs[pb.porteur]! : pb.porteur === 100 || pb.porteur === 101 ? state.gardiens[pb.porteur - 100]! : null;
}

// ---------------------------------------------------------------- entrées --

const TAILLE_ENTREE = 1 + 4 + 12 + 1 + 8;

/**
 * Côté client : encode l'intention de chaque image. Les appuis ponctuels
 * (tir, passe, élan) sont transmis comme des *compteurs* cumulés, pas comme
 * des booléens : si un paquet se perd, le suivant porte le même compteur et
 * l'hôte voit quand même l'appui — ni perdu, ni rejoué deux fois.
 */
export class EmetteurEntrees {
  private seq = 0;
  private nAppui = 0;
  private nRelache = 0;
  private nPasse = 0;
  private nElan = 0;
  private tenu = false;

  encode(intent: InputIntent): ArrayBuffer {
    if (intent.tirAppui && !this.tenu) {
      this.nAppui = (this.nAppui + 1) & 0xffff;
      this.tenu = true;
    }
    if (intent.tirRelache && this.tenu) {
      this.nRelache = (this.nRelache + 1) & 0xffff;
      this.tenu = false;
    }
    if (intent.passeAppui) this.nPasse = (this.nPasse + 1) & 0xffff;
    if (intent.elanAppui) this.nElan = (this.nElan + 1) & 0xffff;
    const buf = new ArrayBuffer(TAILLE_ENTREE);
    const d = new DataView(buf);
    d.setUint8(0, TYPE_ENTREE);
    d.setUint32(1, ++this.seq);
    d.setFloat32(5, intent.ix);
    d.setFloat32(9, intent.iy);
    d.setFloat32(13, intent.viseeManuelle ?? NaN);
    d.setUint8(17, this.tenu ? 1 : 0);
    d.setUint16(18, this.nAppui);
    d.setUint16(20, this.nRelache);
    d.setUint16(22, this.nPasse);
    d.setUint16(24, this.nElan);
    return buf;
  }
}

const EN_ATTENTE_MAX = 4;
/** Sans nouvelle du client depuis ce délai, son joueur s'arrête (onglet en arrière-plan, Wi-Fi coupé...). */
export const SILENCE_ENTREE_S = 0.5;

/** Côté hôte : reconstruit, pas après pas, l'`InputIntent` du joueur distant. */
export class EntreeDistante {
  private seq = 0;
  private compteurs: [number, number, number, number] | null = null;
  private attente = { appui: 0, relache: 0, passe: 0, elan: 0 };
  private tenuEmis = false;
  private ix = 0;
  private iy = 0;
  private visee: number | null = null;
  private recuA = -Infinity;

  /** Renvoie false si le paquet est invalide ou périmé (déjà dépassé par un plus récent). */
  recoit(buf: ArrayBuffer, maintenant: number): boolean {
    if (buf.byteLength !== TAILLE_ENTREE) return false;
    const d = new DataView(buf);
    if (d.getUint8(0) !== TYPE_ENTREE) return false;
    const seq = d.getUint32(1);
    if (seq <= this.seq) return false;
    let ix = d.getFloat32(5);
    let iy = d.getFloat32(9);
    const visee = d.getFloat32(13);
    if (!Number.isFinite(ix) || !Number.isFinite(iy)) return false;
    ix = Math.max(-1, Math.min(1, ix));
    iy = Math.max(-1, Math.min(1, iy));
    const m = Math.hypot(ix, iy);
    if (m > 1) {
      ix /= m;
      iy /= m;
    }
    this.seq = seq;
    this.ix = ix;
    this.iy = iy;
    this.visee = Number.isFinite(visee) && Math.abs(visee) <= Math.PI + 0.01 ? visee : null;
    this.recuA = maintenant;
    const c: [number, number, number, number] = [d.getUint16(18), d.getUint16(20), d.getUint16(22), d.getUint16(24)];
    if (this.compteurs) {
      const delta = (i: number) => Math.min(EN_ATTENTE_MAX, (c[i]! - this.compteurs![i]! + 0x10000) & 0xffff);
      this.attente.appui = Math.min(EN_ATTENTE_MAX, this.attente.appui + delta(0));
      this.attente.relache = Math.min(EN_ATTENTE_MAX, this.attente.relache + delta(1));
      this.attente.passe = Math.min(EN_ATTENTE_MAX, this.attente.passe + delta(2));
      this.attente.elan = Math.min(EN_ATTENTE_MAX, this.attente.elan + delta(3));
    }
    this.compteurs = c;
    return true;
  }

  /** Intention à appliquer pour le prochain pas de simulation (au plus un appui de chaque sorte). */
  prochain(maintenant: number): InputIntent {
    const muet = maintenant - this.recuA > SILENCE_ENTREE_S;
    let tirAppui = false;
    let tirRelache = false;
    // appui et relâché alternent toujours : un relâché n'est rejoué qu'après son appui
    if (!this.tenuEmis && this.attente.appui > 0) {
      this.attente.appui--;
      tirAppui = true;
      this.tenuEmis = true;
    } else if (this.tenuEmis && this.attente.relache > 0) {
      this.attente.relache--;
      tirRelache = true;
      this.tenuEmis = false;
    }
    const passeAppui = this.attente.passe > 0;
    if (passeAppui) this.attente.passe--;
    const elanAppui = this.attente.elan > 0;
    if (elanAppui) this.attente.elan--;
    return {
      ix: muet ? 0 : this.ix,
      iy: muet ? 0 : this.iy,
      tirAppui,
      tirTenu: this.tenuEmis,
      tirRelache,
      passeAppui,
      elanAppui,
      viseeManuelle: this.visee,
    };
  }
}

/**
 * Convertit une direction ou un angle saisi sur la patinoire locale vers la
 * patinoire de l'hôte (si les rapports largeur/hauteur diffèrent un peu).
 */
export function directionVersHote(ix: number, iy: number, kx: number, ky: number): [number, number] {
  const m = Math.hypot(ix, iy);
  if (m === 0) return [0, 0];
  const x = ix * kx;
  const y = iy * ky;
  const m2 = Math.hypot(x, y) || 1;
  return [(x / m2) * m, (y / m2) * m];
}

export function angleVersHote(a: number, kx: number, ky: number): number {
  return Math.atan2(Math.sin(a) * ky, Math.cos(a) * kx);
}
