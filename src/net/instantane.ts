/**
 * Instantanés de la partie (hôte → appareils, ~60 par seconde) : encodage
 * binaire, décodage validé, et application interpolée à l'état local.
 */

import { nouveauPatineur } from '@core/entities';
import { POUVOIRS, RANG_RENFORT } from '@core/pouvoirs';
import type { EtatPouvoirs, GamePhase, MatchState, Rink, StatsMatch, TeamId } from '@core/types';
import { angDiff } from '@core/utils';
import { VERSION_PROTOCOLE } from './reseau-local';

// ------------------------------------------------------------ instantanés --

const TYPE_INSTANTANE = 1;

const PHASES: GamePhase[] = ['engagement', 'jeu', 'but', 'fin', 'loupe'];
const F_PATINEUR = 19;
const TAILLE_PATINEUR = F_PATINEUR * 4 + 1;
const TAILLE_GARDIEN = 5 * 4;
// … + statistiques (passes, mises en échec, meilleure combo, possession)
// … + bonus des deux équipes (passes, seuil, en main, en cours, tirage, temps restant, joueur doré, attente, tir du héros fait)
const TAILLE_POUVOIRS = 1 + 1 + 1 + 1 + 1 + 4 + 1 + 1 + 1;
const TAILLE_ENTETE = 1 + 1 + 4 + 4 + 16 + 1 + 4 + 4 + 1 + 8 + 12 + 2 + 2 + 1 + 4 + 4 + 2 + 8 + 2 * TAILLE_POUVOIRS;
const TAILLE_PALET = 4 * 4 + 1 + 1;
/** Supporters du bonus envahissement : leur nombre, puis x, y, vx, dessin, drapeaux. */
const TAILLE_SUPPORTER = 3 * 4 + 1 + 1;
export const SUPPORTERS_MAX = 12;
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
  ex: number;
  ey: number;
  esquiveT: number;
  prepaEchecT: number;
  chuteT: number;
  chuteD: number;
  flashT: number;
  tirT: number;
  vise: number | null;
  tient: boolean;
  arme: boolean;
  humain: boolean;
  /** Le patineur du second humain de son équipe (équipe à deux humains). */
  partenaire: boolean;
  /** Il vient de marquer : il célèbre pendant la phase « but » (voir `MatchState.buteur`). */
  buteur: boolean;
  /** Équipe, et renfort du bonus surnombre (joueur en plus, ajouté en fin de liste). */
  eq: TeamId;
  renfort: boolean;
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
  /** Bonus des deux équipes ; null quand les bonus sont désactivés. */
  pouvoirs: [EtatPouvoirs, EtatPouvoirs] | null;
  marqueur: TeamId | null;
  humains: [boolean, boolean];
  /** Équipes à deux humains (voir `MatchState.duo`). */
  duo: [boolean, boolean];
  score: [number, number];
  tirs: [number, number];
  lampe: [number, number];
  excite: number;
  combo: [number, number];
  controles: [number, number];
  stats: StatsMatch;
  patineurs: EtatPatineur[];
  gardiens: [EtatGardien, EtatGardien];
  palet: { x: number; y: number; vx: number; vy: number; porteur: number; lueur: number };
  supporters: { x: number; y: number; vx: number; img: number; eq: TeamId; sortie: boolean }[];
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
  const ns = Math.min(SUPPORTERS_MAX, state.supporters.length);
  const buf = new ArrayBuffer(TAILLE_ENTETE + n * TAILLE_PATINEUR + 2 * TAILLE_GARDIEN + TAILLE_PALET + 1 + ns * TAILLE_SUPPORTER);
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
      (state.pouvoirs ? 2 : 0) |
      (state.marqueur !== null ? 8 : 0) |
      (state.marqueur === 1 ? 16 : 0) |
      (state.humains[0] ? 32 : 0) |
      (state.humains[1] ? 64 : 0) |
      (state.duo[0] ? 4 : 0) |
      (state.duo[1] ? 128 : 0),
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
  const st = state.stats;
  u16(st.passes[0]);
  u16(st.passes[1]);
  u16(st.checks[0]);
  u16(st.checks[1]);
  u8(Math.min(255, st.comboMax[0]));
  u8(Math.min(255, st.comboMax[1]));
  f(st.possession[0]);
  f(st.possession[1]);
  for (const eq of [0, 1] as TeamId[]) {
    const pv = state.pouvoirs?.[eq];
    u8(Math.min(255, pv?.passes ?? 0));
    u8(Math.min(255, pv?.seuil ?? 0));
    u8(pv?.pret ? POUVOIRS.indexOf(pv.pret) + 1 : 0);
    u8(pv?.actif ? POUVOIRS.indexOf(pv.actif) + 1 : 0);
    u8(Math.min(255, Math.round((pv?.tirage ?? 0) * 100)));
    f(pv && Number.isFinite(pv.reste) ? pv.reste : -1);
    i8(pv?.dore ?? -1);
    u8(Math.min(255, Math.round((pv?.attente ?? 0) * 20)));
    u8(pv?.tirFait ? 1 : 0);
  }
  u8(n);
  for (let i = 0; i < n; i++) {
    const s = state.patineurs[i]!;
    for (const v of [s.x, s.y, s.vx, s.vy, s.face, s.charge, s.elanT, s.elanCd, s.sonne, s.anim, s.ex, s.ey, s.esquiveT, s.prepaEchecT, s.chuteT, s.chuteD, s.flashT, s.tirT]) f(v);
    f(s.vise ?? NaN);
    u8((s.tient ? 1 : 0) | (s.arme ? 2 : 0) | (s.humain ? 4 : 0) | (s.renfort ? 8 : 0) | (s.eq === 1 ? 16 : 0) | (s === state.partenaires[s.eq] ? 32 : 0) | (state.phase === 'but' && s === state.buteur ? 64 : 0));
  }
  for (const gk of state.gardiens) for (const v of [gk.a, gk.x, gk.y, gk.tient, gk.secoue]) f(v);
  const p = state.palet;
  f(p.x);
  f(p.y);
  f(p.vx);
  f(p.vy);
  i8(indexPorteur(state));
  u8(p.lueur);
  u8(ns);
  for (const s of state.supporters.slice(0, ns)) {
    f(s.x);
    f(s.y);
    f(s.vx);
    u8(s.img & 0xff);
    u8((s.eq === 1 ? 1 : 0) | (s.sortie ? 2 : 0));
  }
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
  const passes: [number, number] = [u16(), u16()];
  const checks: [number, number] = [u16(), u16()];
  const comboMax: [number, number] = [u8(), u8()];
  const possession: [number, number] = [f(), f()];
  const pouvoir = (): EtatPouvoirs => {
    const passes = u8();
    const seuil = u8();
    const pret = POUVOIRS[u8() - 1] ?? null;
    const actif = POUVOIRS[u8() - 1] ?? null;
    const tirage = u8() / 100;
    const r = f();
    const dore = i8();
    const attente = u8() / 20;
    const tirFait = u8() === 1;
    return { passes, seuil, tirage, pret, actif, reste: r < 0 ? Infinity : r, dore, attente, tirFait };
  };
  const pouvoirs: [EtatPouvoirs, EtatPouvoirs] = [pouvoir(), pouvoir()];
  const n = u8();
  if (!phase || n > PATINEURS_MAX || rink.w < 10 || rink.h < 10) return null;
  const fixe = TAILLE_ENTETE + n * TAILLE_PATINEUR + 2 * TAILLE_GARDIEN + TAILLE_PALET;
  if (buf.byteLength < fixe + 1) return null;
  const ns = d.getUint8(fixe);
  if (ns > SUPPORTERS_MAX || buf.byteLength !== fixe + 1 + ns * TAILLE_SUPPORTER) return null;
  const patineurs: EtatPatineur[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y, vx, vy, face, charge, elanT, elanCd, sonne, anim, ex, ey, esquiveT, prepaEchecT, chuteT, chuteD, flashT, tirT] = Array.from({ length: 18 }, f) as number[];
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
      ex: ex!,
      ey: ey!,
      esquiveT: esquiveT!,
      prepaEchecT: prepaEchecT!,
      chuteT: chuteT!,
      chuteD: chuteD!,
      flashT: flashT!,
      tirT: tirT!,
      vise,
      tient: (b & 1) !== 0,
      arme: (b & 2) !== 0,
      humain: (b & 4) !== 0,
      renfort: (b & 8) !== 0,
      partenaire: (b & 32) !== 0,
      buteur: (b & 64) !== 0,
      eq: b & 16 ? 1 : 0,
    });
  }
  const gardien = (): EtatGardien => ({ a: f(), x: f(), y: f(), tient: f(), secoue: f() });
  const gardiens: [EtatGardien, EtatGardien] = [gardien(), gardien()];
  const palet = { x: f(), y: f(), vx: f(), vy: f(), porteur: i8(), lueur: Math.min(3, u8()) };
  u8();
  const supporters: Instantane['supporters'] = [];
  for (let i = 0; i < ns; i++) {
    const x = f();
    const y = f();
    const vx = f();
    const img = u8();
    const b = u8();
    supporters.push({ x, y, vx, img, eq: b & 1 ? 1 : 0, sortie: (b & 2) !== 0 });
  }
  if (!sain) return null;
  return {
    seq,
    temps,
    rink,
    phase,
    phaseT,
    horloge,
    prolong: (fl & 1) !== 0,
    pouvoirs: fl & 2 ? pouvoirs : null,
    marqueur: fl & 8 ? (fl & 16 ? 1 : 0) : null,
    humains: [(fl & 32) !== 0, (fl & 64) !== 0],
    duo: [(fl & 4) !== 0, (fl & 128) !== 0],
    score,
    tirs,
    lampe,
    excite,
    combo,
    controles,
    stats: { passes, checks, comboMax, possession },
    patineurs,
    gardiens,
    palet,
    supporters,
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
  state.pouvoirs = b.pouvoirs ? [{ ...b.pouvoirs[0] }, { ...b.pouvoirs[1] }] : null;
  state.marqueur = b.marqueur;
  state.humains = [...b.humains];
  state.duo = [...b.duo];
  state.score = [...b.score];
  state.tirs = [...b.tirs];
  state.lampe = [...b.lampe];
  state.excite = b.excite;
  state.combo = [...b.combo];
  state.stats = { passes: [...b.stats.passes], checks: [...b.stats.checks], comboMax: [...b.stats.comboMax], possession: [...b.stats.possession] };

  // surnombre : le renfort arrive et repart en fin de liste ; on aligne la liste locale sur celle de l'hôte
  const L = state.patineurs;
  while (L.length > b.patineurs.length) L.pop();
  b.patineurs.forEach((sb, i) => {
    const s = L[i];
    if (!s || s.eq !== sb.eq || s.renfort !== sb.renfort) {
      const nv = nouveauPatineur(sb.eq, sb.renfort ? RANG_RENFORT : (s?.rang ?? 0));
      nv.renfort = sb.renfort;
      if (s) L[i] = nv;
      else L.push(nv);
    }
  });
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
    s.ex = sb.ex;
    s.ey = sb.ey;
    s.esquiveT = sb.esquiveT;
    s.prepaEchecT = sb.prepaEchecT;
    s.chuteT = sb.chuteT;
    s.chuteD = sb.chuteD;
    s.flashT = sb.flashT;
    s.tirT = sb.tirT;
    s.vise = sb.vise;
    s.tient = sb.tient;
    s.arme = sb.arme;
    s.humain = sb.humain;
  }
  state.buteur = null;
  if (b.phase === 'but') {
    const ib = b.patineurs.findIndex((sb, i) => sb.buteur && i < n);
    if (ib >= 0) state.buteur = state.patineurs[ib]!;
  }
  state.partenaires = [null, null];
  for (const eq of [0, 1] as TeamId[]) {
    if (!b.duo[eq]) continue;
    const ip = b.patineurs.findIndex((sb, i) => sb.partenaire && sb.eq === eq && i < n);
    if (ip >= 0) state.partenaires[eq] = state.patineurs[ip]!;
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
  p.lueur = pb.lueur;
  p.porteur = pb.porteur >= 0 && pb.porteur < n ? state.patineurs[pb.porteur]! : pb.porteur === 100 || pb.porteur === 101 ? state.gardiens[pb.porteur - 100]! : null;
  // supporters : interpolés quand ils sont les mêmes (même nombre) d'un instantané à l'autre
  const memes = a.supporters.length === b.supporters.length;
  state.supporters = b.supporters.map((sb, i) => {
    const sa = memes ? a.supporters[i]! : sb;
    const [x, y] = pos(sa.x, sb.x, sa.y, sb.y);
    return { x: X(x), y: Y(y), vx: sb.vx * kx, vy: 0, eq: sb.eq, img: sb.img, sortie: sb.sortie };
  });
}
