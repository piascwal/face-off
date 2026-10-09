/** Bonus : les effets qui agissent sur la partie (tir surpuissant, surnombre, tremblement, foule de supporters, loupé). */

import { nouveauPatineur } from './entities';
import type { MatchState, Rink, Skater, TeamId } from './types';
import {
  PUISSANT_VITESSE,
  PUISSANT_BONUS,
  PUISSANT_CHUTE,
  PUISSANT_PORTEE,
  TREMBLEMENT_CHUTE,
  ENVAHISSEMENT_N,
  SUPPORTER_VIT,
  SUPPORTER_RAYON,
  SUPPORTER_FREIN,
  SUPPORTER_PERTE,
  LOUPE_S,
  RANG_RENFORT,
} from './pouvoirs-def';
import { pouvoirActif, effetActif, finPouvoir } from './pouvoirs';

/**
 * Tir surpuissant : l'équipe tire avec le bonus en cours, qui est consommé.
 * Renvoie le multiplicateur de vitesse et le bonus de qualité du tir.
 */
export function tirPuissant(state: MatchState, s: Skater): { vitesse: number; bonus: number } {
  if (!effetActif(state, s.eq, 'puissant')) return { vitesse: 1, bonus: 0 };
  state.palet.puissant = true;
  // le super héros garde sa vitesse (et son freeze) : seul son tir est consommé
  if (pouvoirActif(state, s.eq, 'heros')) state.pouvoirs![s.eq].tirFait = true;
  else finPouvoir(state, s.eq);
  state.evenements.push({ type: 'onde', x: s.x, y: s.y, r: 26, c: '#ff8a2a' });
  state.evenements.push({ type: 'secousse', force: 3 });
  return { vitesse: PUISSANT_VITESSE, bonus: PUISSANT_BONUS };
}

/** Tir surpuissant en vol : les adversaires sur sa trajectoire sont renversés (le palet les traverse). */
export function renversePuissant(state: MatchState): void {
  const p = state.palet;
  if (!p.puissant || p.tireur === null) return;
  const v = Math.hypot(p.vx, p.vy) || 1;
  for (const s of state.patineurs) {
    if (s.eq === p.tireur || s.chuteT > 0) continue;
    if (Math.hypot(p.x - s.x, p.y - s.y) > s.r + PUISSANT_PORTEE) continue;
    s.tient = false;
    s.arme = false;
    s.charge = 0;
    s.elanT = 0;
    s.prepaEchecT = 0;
    s.sonne = PUISSANT_CHUTE;
    s.chuteT = PUISSANT_CHUTE;
    s.chuteD = PUISSANT_CHUTE;
    s.flashT = 0.12;
    s.face = Math.atan2(p.vy, p.vx);
    s.vx = (p.vx / v) * 150;
    s.vy = (p.vy / v) * 150;
    state.evenements.push({ type: 'onde', x: s.x, y: s.y - 4, r: 22, c: '#ffb020' });
    state.evenements.push({ type: 'etincelles', x: s.x, y: s.y - 6, n: 12, c: '#ff8a2a' });
    state.evenements.push({ type: 'charge' });
    state.evenements.push({ type: 'secousse', force: 2.5 });
    if (s.humain) state.evenements.push({ type: 'vibre', ms: 40 });
  }
}

/**
 * Surnombre : un coéquipier de plus saute sur la glace depuis le banc (bord
 * haut de la patinoire, à hauteur du palet), avec un flash d'apparition.
 */
export function ajouteRenfort(rink: Rink, state: MatchState, eq: TeamId): void {
  const s = nouveauPatineur(eq, RANG_RENFORT);
  s.renfort = true;
  s.st = { ...state.profils[eq].normal };
  s.vit = state.nivEq[eq].vit * s.st.vit;
  s.x = Math.max(rink.x + 30, Math.min(rink.x + rink.w - 30, state.palet.x));
  s.y = rink.y + 8;
  s.vy = 140;
  s.face = Math.PI / 2;
  state.patineurs.push(s);
  state.evenements.push({ type: 'onde', x: s.x, y: s.y, r: 24, c: '#ffd35c' });
  state.evenements.push({ type: 'etincelles', x: s.x, y: s.y - 6, n: 18, c: '#ffd35c' });
  state.evenements.push({ type: 'flash', force: 0.25 });
  state.evenements.push({ type: 'bulle', txt: 'RENFORT !', x: s.x, y: s.y + 4, c: '#ffd35c' });
}

/** Fin du surnombre : le renfort repart (il lâche le palet, la main passe à un coéquipier). */
export function retireRenfort(state: MatchState, eq: TeamId): void {
  const r = state.patineurs.find((s) => s.eq === eq && s.renfort);
  if (!r) return;
  const p = state.palet;
  if (p.porteur === r) {
    p.porteur = null;
    p.vx = r.vx;
    p.vy = r.vy;
  }
  if (p.passe?.vers === r) p.passe = null;
  if (state.reception?.qui === r) state.reception = null;
  state.patineurs.splice(state.patineurs.indexOf(r), 1);
  // la main revient au coéquipier le plus proche du palet (jamais celui de l'autre humain, en coop)
  const reprend = (): Skater | null => {
    let best: Skater | null = null;
    for (const s of state.patineurs) {
      if (s.eq !== eq || s.humain) continue;
      if (!best || Math.hypot(s.x - p.x, s.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y)) best = s;
    }
    if (best) best.humain = true;
    return best;
  };
  if (state.controles[eq] === r) state.controles[eq] = reprend();
  if (state.partenaires[eq] === r) state.partenaires[eq] = reprend();
  state.evenements.push({ type: 'onde', x: r.x, y: r.y, r: 20, c: '#ffd35c' });
  state.evenements.push({ type: 'etincelles', x: r.x, y: r.y - 6, n: 12, c: '#ffd35c' });
}

/**
 * Tremblement : tout le monde tombe (la chute de l'esquive), coéquipiers
 * compris, sauf le porteur du palet ; les gardiens vacillent, l'écran tremble.
 */
export function tremblement(state: MatchState): void {
  const porteur = state.palet.porteur;
  for (const s of state.patineurs) {
    if (s === porteur) continue;
    s.arme = false;
    s.charge = 0;
    s.elanT = 0;
    s.prepaEchecT = 0;
    s.esquiveT = 0;
    s.sonne = TREMBLEMENT_CHUTE;
    s.chuteT = TREMBLEMENT_CHUTE;
    s.chuteD = TREMBLEMENT_CHUTE;
    s.vx *= 0.3;
    s.vy *= 0.3;
    state.evenements.push({ type: 'neige', x: s.x, y: s.y + 3, n: 4 });
  }
  for (const gk of state.gardiens) gk.secoue = 1;
  state.evenements.push({ type: 'secousse', force: 7 });
  state.evenements.push({ type: 'flash', force: 0.2 });
  state.evenements.push({ type: 'vibre', ms: [80, 40, 80, 40, 120] });
}

/**
 * Envahissement : des supporters de l'équipe sautent des tribunes (en haut
 * et en bas de la patinoire) et foncent sur les adversaires.
 */
export function envahissement(rink: Rink, state: MatchState, eq: TeamId): void {
  // les cinq dessins se suivent à partir d'un point de départ au hasard : tous les supporters servent à tour de rôle
  const debut = Math.floor(Math.random() * 256);
  for (let i = 0; i < ENVAHISSEMENT_N; i++) {
    const haut = i % 2 === 0;
    const x = rink.x + rink.w * (0.18 + (0.64 * i) / (ENVAHISSEMENT_N - 1));
    const y = haut ? rink.y + 4 : rink.y + rink.h - 4;
    state.supporters.push({ x, y, vx: 0, vy: haut ? 80 : -80, eq, img: debut + i, sortie: false });
    state.evenements.push({ type: 'neige', x, y, n: 5 });
  }
  state.evenements.push({ type: 'ovation', niveau: 1 });
  state.evenements.push({ type: 'secousse', force: 2 });
}

/**
 * Les supporters, à chaque pas : en jeu, chacun file sur un adversaire (les
 * deux premiers sur le porteur du palet s'il est adverse) ; au contact, il
 * l'accroche (gros freinage) et peut lui faire lâcher le palet. À la fin du
 * bonus, ils repartent vers la bande la plus proche et disparaissent.
 */
export function majSupporters(rink: Rink, state: MatchState, dt: number): void {
  const L = state.supporters;
  if (!L.length) return;
  const p = state.palet;
  for (let i = 0; i < L.length; i++) {
    const s = L[i]!;
    let tx: number;
    let ty: number;
    if (s.sortie) {
      tx = s.x;
      ty = s.y < rink.cy ? rink.y - 30 : rink.y + rink.h + 30;
    } else {
      const adversaires = state.patineurs.filter((o) => o.eq !== s.eq);
      const porteur = p.porteur && 'face' in p.porteur && p.porteur.eq !== s.eq ? p.porteur : null;
      const cible = porteur && i < 2 ? porteur : adversaires[i % Math.max(1, adversaires.length)];
      tx = cible?.x ?? rink.cx;
      ty = cible?.y ?? rink.cy;
    }
    const dx = tx - s.x;
    const dy = ty - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const vit = s.sortie ? SUPPORTER_VIT * 1.2 : SUPPORTER_VIT;
    const k = Math.min(1, 5 * dt);
    s.vx += ((dx / d) * vit - s.vx) * k;
    s.vy += ((dy / d) * vit - s.vy) * k;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (!s.sortie) {
      s.x = Math.max(rink.x + 6, Math.min(rink.x + rink.w - 6, s.x));
      s.y = Math.max(rink.y + 4, Math.min(rink.y + rink.h - 4, s.y));
    }
  }
  // ils ne s'empilent pas les uns sur les autres
  for (let i = 0; i < L.length; i++) {
    for (let j = i + 1; j < L.length; j++) {
      const a = L[i]!;
      const b = L[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < 9) {
        const r = (9 - d) / 2;
        a.x -= (dx / d) * r;
        a.y -= (dy / d) * r;
        b.x += (dx / d) * r;
        b.y += (dy / d) * r;
      }
    }
  }
  // au contact : l'adversaire est accroché, et le porteur peut lâcher le palet
  if (state.phase === 'jeu') {
    for (const s of L) {
      if (s.sortie) continue;
      for (const o of state.patineurs) {
        if (o.eq === s.eq || o.chuteT > 0) continue;
        if (Math.hypot(o.x - s.x, o.y - s.y) > SUPPORTER_RAYON) continue;
        const f = Math.exp(-SUPPORTER_FREIN * dt);
        o.vx *= f;
        o.vy *= f;
        if (o.tient && p.porteur === o && Math.random() < SUPPORTER_PERTE * dt) {
          p.porteur = null;
          o.tient = false;
          o.arme = false;
          o.charge = 0;
          o.recupCd = 0.5;
          p.vx = s.vx * 0.6 + (Math.random() - 0.5) * 60;
          p.vy = s.vy * 0.6 + (Math.random() - 0.5) * 60;
          state.evenements.push({ type: 'bulle', txt: 'OUPS !', x: o.x, y: o.y - 20, c: '#ffd35c' });
        }
      }
    }
  }
  state.supporters = L.filter((s) => !s.sortie || (s.y > rink.y - 24 && s.y < rink.y + rink.h + 24));
}

/**
 * Loupé complet : un adversaire tire pendant le bonus. Son tir est forcément
 * raté : le palet part vers la caméra et brise l'écran (phase `loupe`), puis
 * engagement au centre ; le bonus est consommé. Renvoie true si c'est le cas.
 */
export function tirLoupe(state: MatchState, s: Skater, x: number, y: number): boolean {
  const adv: TeamId = s.eq === 0 ? 1 : 0;
  if (!pouvoirActif(state, adv, 'loupe') || state.phase !== 'jeu') return false;
  const p = state.palet;
  p.porteur = null;
  p.x = x;
  p.y = y;
  p.vx = p.vy = 0;
  p.tireur = null;
  p.passe = null;
  p.puissant = false;
  s.tient = false;
  s.arme = false;
  s.charge = 0;
  state.phase = 'loupe';
  state.phaseT = LOUPE_S;
  finPouvoir(state, adv);
  state.evenements.push({ type: 'frappe', puissance: 1 });
  return true;
}

/** Freeze : le joueur est-il pris dans la glace (tout le monde sauf le joueur doré de l'équipe qui l'a déclenché) ? */
