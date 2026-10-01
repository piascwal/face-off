import { butAttaque } from './shooting';
import type { EtatPouvoirs, MatchState, PouvoirId, Rink, Skater, TeamId } from './types';

/**
 * Bonus (power-ups) : chaque équipe remplit sa jauge en enchaînant des passes
 * réussies. Au seuil (4 passes, toujours), un bonus est tiré au sort parmi
 * tous les bonus, pour les deux équipes de la même façon : personne n'est
 * avantagé pour tout le match par un tirage chanceux. L'équipe a ensuite
 * PRET_MAX_S secondes de jeu pour le déclencher, sinon il est perdu.
 */
/** Ordre fixe : l'index d'un bonus dans cette liste est ce qui voyage en Wi-Fi. */
export const POUVOIRS: PouvoirId[] = ['guide', 'vitesse', 'puissant', 'freeze', 'savon', 'inversion', 'ricochet', 'surnombre', 'gamelle', 'double'];

export interface DefPouvoir {
  nom: string;
  /** Durée (s, en temps de jeu) ; Infinity : jusqu'à ce que l'effet serve (prochain but). */
  duree: number;
  /** Un joueur devient doré (celui qu'on pilote, ou celui qui l'a déclenché pour l'ordinateur). */
  dore: boolean;
  /** Bonus déjà en jeu ; les autres ne sortent pas au tirage. */
  dispo: boolean;
}

export const DEF_POUVOIRS: Record<PouvoirId, DefPouvoir> = {
  guide: { nom: 'TIR GUIDE', duree: 10, dore: true, dispo: true },
  vitesse: { nom: 'SUPER VITESSE', duree: 6, dore: true, dispo: true },
  puissant: { nom: 'TIR SURPUISSANT', duree: 10, dore: true, dispo: true },
  freeze: { nom: 'FREEZE', duree: 3, dore: true, dispo: true },
  savon: { nom: 'MODE SAVON', duree: 8, dore: true, dispo: true },
  inversion: { nom: 'INVERSION', duree: 5, dore: true, dispo: true },
  ricochet: { nom: 'RICOCHET', duree: 8, dore: true, dispo: true },
  surnombre: { nom: 'SURNOMBRE', duree: 10, dore: false, dispo: false },
  gamelle: { nom: 'GAMELLE', duree: 10, dore: true, dispo: false },
  double: { nom: 'BUT X2', duree: Infinity, dore: false, dispo: true },
};

/**
 * Poids de chaque bonus au tirage (tous égaux pour l'instant). C'est ici
 * qu'on pourra plus tard donner plus souvent les bonus puissants à l'équipe
 * menée au score (voir `poidsPouvoirs`).
 */
export const POIDS_POUVOIRS: Record<PouvoirId, number> = {
  guide: 1,
  vitesse: 1,
  puissant: 1,
  freeze: 1,
  savon: 1,
  inversion: 1,
  ricochet: 1,
  surnombre: 1,
  gamelle: 1,
  double: 1,
};

/** Passes réussies d'affilée pour obtenir un bonus (toujours le même nombre). */
export const SEUIL_PASSES = 4;
/** Temps de jeu (s) pour déclencher un bonus prêt ; au-delà, il est perdu. */
export const PRET_MAX_S = 10;
/** Durée du tirage (icônes qui défilent dans la case du bonus), en s. */
export const TIRAGE_S = 1.2;
/** Fin d'un bonus : le joueur doré clignote pendant ces dernières secondes. */
export const ALERTE_FIN_S = 2;
/** Super vitesse : vitesse et accélération du joueur doré. */
export const VITESSE_FACTEUR = 1.4;
/** Tir guidé : virage maximal du palet vers le coin visé (rad/s) et bonus de qualité du tir. */
export const GUIDE_VIRAGE = 5;
export const GUIDE_BONUS = 0.3;
/** Ricochet : le palet repart des bandes plus vite qu'il n'y est arrivé (dans la limite de RICOCHET_VMAX px/s). */
export const RICOCHET_GAIN = 1.12;
export const RICOCHET_VMAX = 480;
/** Tir surpuissant : vitesse du palet, bonus de qualité, et adversaires renversés (s au sol, portée en px autour du corps). */
export const PUISSANT_VITESSE = 1.5;
export const PUISSANT_BONUS = 0.2;
export const PUISSANT_CHUTE = 2;
export const PUISSANT_PORTEE = 4;
/** En dessous de cette vitesse (px/s), le tir surpuissant est retombé : il ne renverse plus personne. */
export const PUISSANT_VMIN = 160;
/** L'ordinateur utilise de toute façon son bonus au bout de ce temps (s). */
export const IA_ATTENTE_MAX = 6;

export function etatPouvoirsInitial(): EtatPouvoirs {
  return { passes: 0, seuil: SEUIL_PASSES, tirage: 0, pret: null, actif: null, reste: 0, dore: -1, attente: 0 };
}

/** Poids du tirage pour l'équipe `eq` (même table pour les deux équipes pour l'instant). */
export function poidsPouvoirs(_state: MatchState, _eq: TeamId): Record<PouvoirId, number> {
  const p = { ...POIDS_POUVOIRS };
  for (const id of POUVOIRS) if (!DEF_POUVOIRS[id].dispo) p[id] = 0;
  return p;
}

/** Tirage pondéré ; `alea` ∈ [0, 1[. */
export function tirePouvoir(state: MatchState, eq: TeamId, alea = Math.random()): PouvoirId {
  const poids = poidsPouvoirs(state, eq);
  const total = POUVOIRS.reduce((t, id) => t + poids[id], 0);
  let r = alea * total;
  for (const id of POUVOIRS) {
    r -= poids[id];
    if (poids[id] > 0 && r < 0) return id;
  }
  return POUVOIRS.find((id) => poids[id] > 0) ?? 'vitesse';
}

export const pouvoirActif = (state: MatchState, eq: TeamId, id: PouvoirId): boolean => state.pouvoirs?.[eq].actif === id;

/** Le bonus de l'équipe est-il prêt à être déclenché (tirage terminé) ? */
export const pouvoirPret = (state: MatchState, eq: TeamId): boolean => {
  const p = state.pouvoirs?.[eq];
  return !!p && p.pret !== null && p.tirage <= 0 && p.actif === null;
};

/** Le joueur doré de l'équipe : celui qu'elle pilote, ou celui qui a déclenché le bonus pour l'ordinateur. */
export function joueurDore(state: MatchState, eq: TeamId): Skater | null {
  const p = state.pouvoirs?.[eq];
  if (!p?.actif || !DEF_POUVOIRS[p.actif].dore) return null;
  if (state.humains[eq]) return state.controles[eq];
  return state.patineurs.find((s) => s.eq === eq && s.rang === p.dore) ?? null;
}

export const estDore = (state: MatchState, s: Skater): boolean => state.pouvoirs !== null && joueurDore(state, s.eq) === s;

/** Une passe réussie de plus pour l'équipe : au seuil, un bonus est tiré. */
export function comptePasse(state: MatchState, eq: TeamId, qui: Skater): void {
  const p = state.pouvoirs?.[eq];
  // bonus déjà en main ou en cours : les passes ne remplissent plus la jauge
  if (!p || p.pret !== null || p.actif !== null) return;
  p.passes++;
  if (p.passes < p.seuil) return;
  p.passes = 0;
  p.pret = tirePouvoir(state, eq);
  p.tirage = TIRAGE_S;
  p.attente = 0;
  state.evenements.push({ type: 'pouvoir', eq, quoi: 'tirage', id: POUVOIRS.indexOf(p.pret) });
  state.evenements.push({ type: 'bulle', txt: 'BONUS !', x: qui.x, y: qui.y - 20, c: '#ffd35c' });
}

/** La série de passes de l'équipe s'arrête (interception, arrêt du gardien, but). */
export function cassePasses(state: MatchState, eq: TeamId): void {
  const p = state.pouvoirs?.[eq];
  if (p) p.passes = 0;
}

/** Déclenche le bonus prêt de l'équipe ; `qui` : le joueur qui le déclenche (doré pour l'ordinateur). */
export function activePouvoir(state: MatchState, eq: TeamId, qui: Skater | null): boolean {
  const p = state.pouvoirs?.[eq];
  if (!p || !pouvoirPret(state, eq) || state.phase !== 'jeu') return false;
  const id = p.pret!;
  p.actif = id;
  p.pret = null;
  p.reste = DEF_POUVOIRS[id].duree;
  p.dore = qui?.rang ?? -1;
  p.passes = 0;
  state.evenements.push({ type: 'pouvoir', eq, quoi: 'active', id: POUVOIRS.indexOf(id) });
  if (qui) {
    state.evenements.push({ type: 'bulle', txt: `${DEF_POUVOIRS[id].nom} !`, x: qui.x, y: qui.y - 24, c: '#ffd35c' });
    state.evenements.push({ type: 'etincelles', x: qui.x, y: qui.y - 6, n: 14, c: '#ffd35c' });
  }
  if (state.humains[eq]) state.evenements.push({ type: 'vibre', ms: 30 });
  return true;
}

/** Fin de l'effet en cours de l'équipe (temps écoulé, ou effet utilisé). */
export function finPouvoir(state: MatchState, eq: TeamId): void {
  const p = state.pouvoirs?.[eq];
  if (!p?.actif) return;
  state.evenements.push({ type: 'pouvoir', eq, quoi: 'fin', id: POUVOIRS.indexOf(p.actif) });
  p.actif = null;
  p.reste = 0;
  p.dore = -1;
}

/** Chaque pas : tirage en cours, durée des effets (seulement pendant le jeu), et lueur du palet. */
export function majPouvoirs(state: MatchState, dt: number): void {
  const pv = state.pouvoirs;
  const pal = state.palet;
  if (!pv) {
    pal.lueur = 0;
    return;
  }
  for (const eq of [0, 1] as TeamId[]) {
    const p = pv[eq];
    if (p.tirage > 0) {
      p.tirage = Math.max(0, p.tirage - dt);
      if (p.tirage === 0 && p.pret) state.evenements.push({ type: 'pouvoir', eq, quoi: 'pret', id: POUVOIRS.indexOf(p.pret) });
    }
    if (p.pret && p.tirage <= 0 && state.phase === 'jeu') {
      p.attente += dt;
      // pas déclenché à temps : le bonus est perdu
      if (p.attente >= PRET_MAX_S) {
        state.evenements.push({ type: 'pouvoir', eq, quoi: 'perdu', id: POUVOIRS.indexOf(p.pret) });
        const qui = state.controles[eq] ?? pal;
        state.evenements.push({ type: 'bulle', txt: 'BONUS PERDU', x: qui.x, y: qui.y - 22, c: '#ff6b6b' });
        p.pret = null;
        p.attente = 0;
      }
    }
    if (p.actif && state.phase === 'jeu' && Number.isFinite(p.reste)) {
      p.reste -= dt;
      if (p.reste <= 0) {
        finPouvoir(state, eq);
      }
    }
  }
  if (pal.puissant && (pal.porteur || pal.tireur === null || Math.hypot(pal.vx, pal.vy) < PUISSANT_VMIN)) pal.puissant = false;
  const eqPalet = pal.dernier?.eq;
  pal.lueur = pal.puissant ? 3 : pal.guide ? 1 : eqPalet !== undefined && !pal.porteur && pv[eqPalet].actif === 'ricochet' ? 2 : 0;
}

/** Tir guidé : l'équipe tire avec le bonus en cours, qui est consommé. Renvoie le bonus de qualité. */
export function tirGuide(rink: Rink, state: MatchState, s: Skater, ang: number): number {
  if (!pouvoirActif(state, s.eq, 'guide')) return 0;
  const p = state.palet;
  // le coin visé : celui vers lequel le tir part, ou le plus loin du gardien
  const gx = butAttaque(rink, s.eq);
  const yVise = s.y + Math.tan(ang) * (gx - s.x);
  const cote = Number.isFinite(yVise) ? Math.sign(yVise - rink.cy) || 1 : 1;
  p.guide = { y: rink.cy + cote * 11 };
  finPouvoir(state, s.eq);
  state.evenements.push({ type: 'etincelles', x: p.x, y: p.y, n: 10, c: '#fff3b0' });
  return GUIDE_BONUS;
}

/** Tir guidé en vol : le palet s'incurve vers le coin visé (sans changer de vitesse). */
export function guidePalet(rink: Rink, state: MatchState, dt: number): void {
  const p = state.palet;
  if (!p.guide) return;
  if (p.porteur || p.tireur === null) {
    p.guide = null;
    return;
  }
  const gx = butAttaque(rink, p.tireur);
  const v = Math.hypot(p.vx, p.vy);
  if (v < 40) return;
  const dx = gx - p.x;
  const dy = p.guide.y - p.y;
  // on ne ramène pas un palet qui file déjà dans l'autre sens
  if (dx * p.vx < 0) return;
  const a = Math.atan2(p.vy, p.vx);
  let d = Math.atan2(dy, dx) - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const na = a + Math.max(-GUIDE_VIRAGE * dt, Math.min(GUIDE_VIRAGE * dt, d));
  p.vx = Math.cos(na) * v;
  p.vy = Math.sin(na) * v;
}

/**
 * Tir surpuissant : l'équipe tire avec le bonus en cours, qui est consommé.
 * Renvoie le multiplicateur de vitesse et le bonus de qualité du tir.
 */
export function tirPuissant(state: MatchState, s: Skater): { vitesse: number; bonus: number } {
  if (!pouvoirActif(state, s.eq, 'puissant')) return { vitesse: 1, bonus: 0 };
  state.palet.puissant = true;
  finPouvoir(state, s.eq);
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

/** Freeze : le joueur est-il pris dans la glace (tout le monde sauf le joueur doré de l'équipe qui l'a déclenché) ? */
export function estGele(state: MatchState, s: Skater): boolean {
  const pv = state.pouvoirs;
  if (!pv) return false;
  for (const eq of [0, 1] as TeamId[]) if (pv[eq].actif === 'freeze' && joueurDore(state, eq) !== s) return true;
  return false;
}

/** Inversion : les déplacements des joueurs de l'équipe `eq` sont-ils inversés (bonus adverse en cours) ? */
export const estInverse = (state: MatchState, eq: TeamId): boolean => pouvoirActif(state, eq === 0 ? 1 : 0, 'inversion');

/** Ricochet : le palet a-t-il été joué par une équipe dont le bonus Ricochet est en cours ? */
export function ricochet(state: MatchState): boolean {
  const eq = state.palet.dernier?.eq;
  return eq !== undefined && pouvoirActif(state, eq, 'ricochet');
}

/**
 * L'ordinateur déclenche son bonus au bon moment : quand il a le palet (près
 * du but adverse pour le tir guidé), ou au plus tard après IA_ATTENTE_MAX.
 */
export function iaPouvoirs(rink: Rink, state: MatchState): void {
  if (!state.pouvoirs || state.phase !== 'jeu') return;
  for (const eq of [0, 1] as TeamId[]) {
    if (state.humains[eq] || !pouvoirPret(state, eq)) continue;
    const p = state.pouvoirs[eq];
    const porteur = state.palet.porteur;
    const nous = porteur && 'face' in porteur && porteur.eq === eq ? porteur : null;
    let go = p.attente > IA_ATTENTE_MAX;
    switch (p.pret) {
      case 'double':
        go ||= p.attente > 1;
        break;
      case 'guide':
      case 'puissant':
        go ||= !!nous && Math.abs(nous.x - butAttaque(rink, eq)) < rink.w * 0.4;
        break;
      default:
        go ||= !!nous && p.attente > 0.5;
    }
    if (!go) continue;
    const qui = nous ?? plusProcheDuPalet(state, eq);
    activePouvoir(state, eq, qui);
  }
}

function plusProcheDuPalet(state: MatchState, eq: TeamId): Skater | null {
  let best: Skater | null = null;
  let dmin = Infinity;
  for (const s of state.patineurs) {
    if (s.eq !== eq) continue;
    const d = Math.hypot(s.x - state.palet.x, s.y - state.palet.y);
    if (d < dmin) {
      dmin = d;
      best = s;
    }
  }
  return best;
}
