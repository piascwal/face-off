/**
 * Bonus (power-ups) : chaque équipe remplit sa jauge en enchaînant des passes
 * réussies. Au seuil (4 passes, toujours), un bonus est tiré au sort parmi
 * tous les bonus, pour les deux équipes de la même façon : personne n'est
 * avantagé pour tout le match par un tirage chanceux. Le bonus se déclenche
 * tout seul à la fin du tirage, pour un temps limité ; un but met fin à tous
 * les bonus.
 */

import { BUT_DEMI } from './constants';
import type { EtatPouvoirs, MatchState, PouvoirId, Rink, Skater, TeamId } from './types';
import {
  POUVOIRS,
  DEF_POUVOIRS,
  POIDS_POUVOIRS,
  SEUIL_PASSES,
  TIRAGE_S,
  PUISSANT_VMIN,
  HEROS_FREEZE_S,
  CAGE_GEANTE,
  MINI_CAGE,
  ENTRAINEMENT_RETOUR_S,
} from './pouvoirs-def';
import { ajouteRenfort, retireRenfort, tremblement, envahissement } from './pouvoirs-effets';

export function etatPouvoirsInitial(): EtatPouvoirs {
  return { passes: 0, seuil: SEUIL_PASSES, tirage: 0, pret: null, actif: null, reste: 0, dore: -1, attente: 0, tirFait: false };
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

/**
 * Le bouton qu'un bonus en cours de l'équipe fait utiliser (il passe en or
 * pour guider le joueur) : 'tir' pour le tir surpuissant, sinon null.
 */
export function boutonBonus(state: MatchState, eq: TeamId, pilote?: Skater | null): 'tir' | null {
  // en coop, seul le joueur doré (celui qui a le palet) a le bouton doré
  if (pilote !== undefined && (!pilote || !estDore(state, pilote))) return null;
  return effetActif(state, eq, 'puissant') ? 'tir' : null;
}

export const pouvoirActif = (state: MatchState, eq: TeamId, id: PouvoirId): boolean => state.pouvoirs?.[eq].actif === id;

/** Super passe en cours pour l'équipe `eq` : ses passes arrivent toujours au coéquipier. */
export const superPasse = (state: MatchState, eq: TeamId): boolean => state.pouvoirs?.[eq].actif === 'superpasse';

/**
 * Un effet joue-t-il pour l'équipe ? Le bonus du même nom, ou le super
 * héros, qui cumule super vitesse, tir surpuissant (une fois) et freeze
 * (pendant ses HEROS_FREEZE_S premières secondes).
 */
export function effetActif(state: MatchState, eq: TeamId, effet: 'vitesse' | 'puissant' | 'freeze'): boolean {
  const p = state.pouvoirs?.[eq];
  if (!p?.actif) return false;
  if (p.actif === effet) return true;
  if (p.actif !== 'heros') return false;
  if (effet === 'puissant') return !p.tirFait;
  if (effet === 'freeze') return DEF_POUVOIRS.heros.duree - p.reste < HEROS_FREEZE_S;
  return true;
}

/** Demi-largeur de l'ouverture de la cage défendue par `eq` (cage géante adverse, mini cage). */
export function demiCage(state: MatchState, eq: TeamId): number {
  const pv = state.pouvoirs;
  if (!pv) return BUT_DEMI;
  if (pv[eq === 0 ? 1 : 0].actif === 'geante') return BUT_DEMI * CAGE_GEANTE;
  if (pv[eq].actif === 'minicage') return Math.round(BUT_DEMI * MINI_CAGE);
  return BUT_DEMI;
}

/** Le gardien de l'équipe `eq` dort-il (gardien endormi adverse) ? */
export const gardienEndormi = (state: MatchState, eq: TeamId): boolean => pouvoirActif(state, eq === 0 ? 1 : 0, 'endormi');

/** L'équipe `eq` est-elle dans le noir (blackout adverse) ? */
export const dansLeNoir = (state: MatchState, eq: TeamId): boolean => pouvoirActif(state, eq === 0 ? 1 : 0, 'blackout');

/** Le bonus de l'équipe a-t-il fini son tirage (il part dès que le jeu tourne) ? */
export const pouvoirPret = (state: MatchState, eq: TeamId): boolean => {
  const p = state.pouvoirs?.[eq];
  return !!p && p.pret !== null && p.tirage <= 0 && p.actif === null;
};

/** Le siège d'un patineur humain dans son équipe : 0 le premier humain, 1 le second, -1 s'il n'est piloté par personne. */
export function siegeDe(state: MatchState, s: Skater): -1 | 0 | 1 {
  if (state.partenaires[s.eq] === s) return 1;
  return state.controles[s.eq] === s ? 0 : -1;
}

/**
 * Le joueur doré de l'équipe : celui qu'elle pilote, ou celui qui a déclenché
 * le bonus pour l'ordinateur. Avec deux humains, c'est celui des deux qui a
 * le palet (`dore` garde son siège, 0 ou 1) : l'or passe de l'un à l'autre
 * avec le palet, et l'autre humain n'a aucun avantage.
 */
export function joueurDore(state: MatchState, eq: TeamId): Skater | null {
  const p = state.pouvoirs?.[eq];
  if (!p?.actif || !DEF_POUVOIRS[p.actif].dore) return null;
  if (state.humains[eq]) return state.duo[eq] && p.dore === 1 ? state.partenaires[eq] : state.controles[eq];
  return state.patineurs.find((s) => s.eq === eq && s.rang === p.dore) ?? null;
}

export const estDore = (state: MatchState, s: Skater): boolean => state.pouvoirs !== null && joueurDore(state, s.eq) === s;

/**
 * Une passe réussie de plus pour l'équipe : au seuil, un bonus est tiré
 * (renvoie true : le « BONUS » doré remplace alors la bulle de combo).
 */
export function comptePasse(state: MatchState, eq: TeamId, qui: Skater): boolean {
  const p = state.pouvoirs?.[eq];
  // bonus déjà en main ou en cours : les passes ne remplissent plus la jauge ;
  // en entraînement, pas de jauge (le bonus choisi revient tout seul)
  if (!p || p.pret !== null || p.actif !== null || state.entrainement) return false;
  p.passes++;
  if (p.passes < p.seuil) return false;
  p.passes = 0;
  p.pret = tirePouvoir(state, eq);
  p.tirage = TIRAGE_S;
  p.attente = 0;
  state.evenements.push({ type: 'pouvoir', eq, quoi: 'tirage', id: POUVOIRS.indexOf(p.pret) });
  state.evenements.push({ type: 'bulle', txt: 'BONUS', x: qui.x, y: qui.y - 30, c: '#ffd35c', gros: true });
  return true;
}

/** La série de passes de l'équipe s'arrête (interception, arrêt du gardien, but). */
export function cassePasses(state: MatchState, eq: TeamId): void {
  const p = state.pouvoirs?.[eq];
  if (p) p.passes = 0;
}

/**
 * Déclenche le bonus prêt de l'équipe (fin du tirage) ; `qui` : le joueur
 * qui devient doré (celui qu'on pilote, ou le plus proche du palet pour l'ordinateur).
 */
export function activePouvoir(rink: Rink, state: MatchState, eq: TeamId, qui: Skater | null): boolean {
  const p = state.pouvoirs?.[eq];
  if (!p || !pouvoirPret(state, eq) || state.phase !== 'jeu') return false;
  const id = p.pret!;
  p.actif = id;
  p.pret = null;
  p.reste = DEF_POUVOIRS[id].duree;
  p.dore = state.duo[eq] ? (qui && siegeDe(state, qui) === 1 ? 1 : 0) : (qui?.rang ?? -1);
  p.passes = 0;
  p.tirFait = false;
  state.evenements.push({ type: 'pouvoir', eq, quoi: 'active', id: POUVOIRS.indexOf(id) });
  if (id === 'surnombre') ajouteRenfort(rink, state, eq);
  if (id === 'tremblement') tremblement(state);
  if (id === 'envahissement') envahissement(rink, state, eq);
  if (id === 'geante' || id === 'minicage') {
    const cible: TeamId = id === 'geante' ? (eq === 0 ? 1 : 0) : eq;
    state.evenements.push({ type: 'onde', x: cible === 0 ? rink.butG : rink.butD, y: rink.cy, r: 30, c: '#ffd35c' });
  }
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
  if (p.actif === 'surnombre') retireRenfort(state, eq);
  // les supporters repartent vers les tribunes
  if (p.actif === 'envahissement') for (const s of state.supporters) if (s.eq === eq) s.sortie = true;
  p.actif = null;
  p.reste = 0;
  p.dore = -1;
}

/** Chaque pas : tirage en cours, déclenchement à sa fin, durée des effets (seulement pendant le jeu), et lueur du palet. */
export function majPouvoirs(rink: Rink, state: MatchState, dt: number): void {
  const pv = state.pouvoirs;
  const pal = state.palet;
  if (!pv) {
    pal.lueur = 0;
    return;
  }
  for (const eq of [0, 1] as TeamId[]) {
    const p = pv[eq];
    if (p.tirage > 0) p.tirage = Math.max(0, p.tirage - dt);
    // deux humains : l'or suit celui des deux qui a le palet
    if (p.actif && state.duo[eq] && pal.porteur && 'face' in pal.porteur) {
      const siege = siegeDe(state, pal.porteur);
      if (siege >= 0) p.dore = siege;
    }
    if (p.actif && state.phase === 'jeu') {
      p.reste -= dt;
      if (p.reste <= 0) finPouvoir(state, eq);
    }
    // entraînement : le bonus choisi revient peu après chaque usage
    if (state.entrainement && state.humains[eq] && !p.pret && !p.actif) {
      p.attente += dt;
      if (p.attente >= ENTRAINEMENT_RETOUR_S) {
        p.pret = state.entrainement;
        p.tirage = 0;
        p.attente = 0;
      }
    }
    // tirage terminé : le bonus part tout seul, dès que le jeu tourne (avec toute sa durée)
    if (pouvoirPret(state, eq) && state.phase === 'jeu') activePouvoir(rink, state, eq, quiDore(state, eq));
  }
  if (pal.puissant && (pal.porteur || pal.tireur === null || Math.hypot(pal.vx, pal.vy) < PUISSANT_VMIN)) pal.puissant = false;
  // lueur 3 : tir surpuissant ; 2 : passe guidée de la super passe
  pal.lueur = pal.puissant ? 3 : pal.passe && !pal.porteur && superPasse(state, pal.passe.vers.eq) ? 2 : 0;
}

export function estGele(state: MatchState, s: Skater): boolean {
  const pv = state.pouvoirs;
  if (!pv) return false;
  for (const eq of [0, 1] as TeamId[]) if (effetActif(state, eq, 'freeze') && joueurDore(state, eq) !== s) return true;
  return false;
}

/** Inversion : les déplacements des joueurs de l'équipe `eq` sont-ils inversés (bonus adverse en cours) ? */
export const estInverse = (state: MatchState, eq: TeamId): boolean => pouvoirActif(state, eq === 0 ? 1 : 0, 'inversion');

/** Le joueur qui devient doré : celui qu'on pilote, sinon le porteur du palet, sinon le plus proche du palet. */
function quiDore(state: MatchState, eq: TeamId): Skater | null {
  const porteur = state.palet.porteur;
  if (state.duo[eq] && state.partenaires[eq] && porteur === state.partenaires[eq]) return state.partenaires[eq];
  if (state.humains[eq] && state.controles[eq]) return state.controles[eq];
  if (porteur && 'face' in porteur && porteur.eq === eq) return porteur;
  return plusProcheDuPalet(state, eq);
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

// les définitions et les effets font partie de l'interface des bonus
export * from './pouvoirs-def';
export * from './pouvoirs-effets';
