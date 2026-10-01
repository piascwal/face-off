import { nouveauPatineur } from './entities';
import { BUT_DEMI } from './constants';
import type { EtatPouvoirs, MatchState, PouvoirId, Rink, Skater, TeamId } from './types';

/**
 * Bonus (power-ups) : chaque équipe remplit sa jauge en enchaînant des passes
 * réussies. Au seuil (4 passes, toujours), un bonus est tiré au sort parmi
 * tous les bonus, pour les deux équipes de la même façon : personne n'est
 * avantagé pour tout le match par un tirage chanceux. Le bonus se déclenche
 * tout seul à la fin du tirage, pour un temps limité ; un but met fin à tous
 * les bonus.
 */
/** Ordre fixe : l'index d'un bonus dans cette liste est ce qui voyage en Wi-Fi. */
export const POUVOIRS: PouvoirId[] = [
  'vitesse',
  'puissant',
  'freeze',
  'savon',
  'inversion',
  'surnombre',
  'double',
  'heros',
  'tremblement',
  'givre',
  'geante',
  'minicage',
  'endormi',
  'blackout',
];

export interface DefPouvoir {
  nom: string;
  /** Durée maximale (s, en temps de jeu) ; un but y met fin plus tôt. */
  duree: number;
  /** Un joueur devient doré (celui qu'on pilote, ou celui qui l'a déclenché pour l'ordinateur). */
  dore: boolean;
  /** Bonus déjà en jeu ; les autres ne sortent pas au tirage. */
  dispo: boolean;
}

export const DEF_POUVOIRS: Record<PouvoirId, DefPouvoir> = {
  vitesse: { nom: 'SUPER VITESSE', duree: 6, dore: true, dispo: true },
  puissant: { nom: 'TIR SURPUISSANT', duree: 10, dore: true, dispo: true },
  freeze: { nom: 'FREEZE', duree: 3, dore: true, dispo: true },
  savon: { nom: 'FULL ESQUIVE', duree: 8, dore: true, dispo: true },
  inversion: { nom: 'INVERSION', duree: 5, dore: true, dispo: true },
  surnombre: { nom: 'SURNOMBRE', duree: 10, dore: false, dispo: true },
  double: { nom: 'BUT X2', duree: 10, dore: false, dispo: true },
  heros: { nom: 'SUPER HEROS', duree: 8, dore: true, dispo: true },
  tremblement: { nom: 'TREMBLEMENT', duree: 2.5, dore: false, dispo: true },
  givre: { nom: 'GIVRE', duree: 7, dore: false, dispo: true },
  geante: { nom: 'CAGE GEANTE', duree: 10, dore: false, dispo: true },
  minicage: { nom: 'MINI CAGE', duree: 10, dore: false, dispo: true },
  endormi: { nom: 'GARDIEN ENDORMI', duree: 6, dore: false, dispo: true },
  blackout: { nom: 'BLACKOUT', duree: 8, dore: true, dispo: true },
};

/**
 * Poids de chaque bonus au tirage (le super héros, qui cumule trois bonus,
 * sort deux fois moins souvent que les autres). C'est ici
 * qu'on pourra plus tard donner plus souvent les bonus puissants à l'équipe
 * menée au score (voir `poidsPouvoirs`).
 */
export const POIDS_POUVOIRS: Record<PouvoirId, number> = {
  vitesse: 1,
  puissant: 1,
  freeze: 1,
  savon: 1,
  inversion: 1,
  surnombre: 1,
  double: 1,
  heros: 0.5,
  tremblement: 1,
  givre: 1,
  geante: 1,
  minicage: 1,
  endormi: 1,
  blackout: 1,
};

/** Passes réussies d'affilée pour obtenir un bonus (toujours le même nombre). */
export const SEUIL_PASSES = 4;
/** Durée du tirage (icônes qui défilent dans la case du bonus), en s. */
export const TIRAGE_S = 1.2;
/** Fin d'un bonus : le joueur doré clignote pendant ces dernières secondes. */
export const ALERTE_FIN_S = 2;
/** Super vitesse : vitesse et accélération du joueur doré. */
export const VITESSE_FACTEUR = 1.4;
/** Tir surpuissant : vitesse du palet, bonus de qualité, et adversaires renversés (s au sol, portée en px autour du corps). */
export const PUISSANT_VITESSE = 1.5;
export const PUISSANT_BONUS = 0.2;
export const PUISSANT_CHUTE = 2;
export const PUISSANT_PORTEE = 4;
/** En dessous de cette vitesse (px/s), le tir surpuissant est retombé : il ne renverse plus personne. */
export const PUISSANT_VMIN = 160;
/** Super héros : les adversaires restent gelés pendant ses premières secondes. */
export const HEROS_FREEZE_S = 3;
/** Tremblement : temps au sol (s) de tous les joueurs sauf le porteur du palet, et de la secousse de l'écran. */
export const TREMBLEMENT_CHUTE = 1.6;
/** Cage géante (cage adverse) et mini cage (sa propre cage) : facteur sur la largeur de l'ouverture. */
export const CAGE_GEANTE = 2;
export const MINI_CAGE = 0.45;
/** Gardien endormi : il ne bouge plus, n'attrape plus rien, et son corps ne couvre plus que cette part. */
export const ENDORMI_RAYON = 0.6;
/** Blackout : l'équipe dans le noir intercepte moins bien (rayon) et vole moins de palets (taux). */
export const BLACKOUT_INTERCEPTION = 0.5;
export const BLACKOUT_VOL = 0.3;
/** Surnombre : rang donné au renfort (hors des rangs de l'effectif, pour le reconnaître). */
export const RANG_RENFORT = 9;
/** Mode entraînement : délai (s) avant que le bonus choisi revienne, après usage. */
export const ENTRAINEMENT_RETOUR_S = 0.8;

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
export function boutonBonus(state: MatchState, eq: TeamId): 'tir' | null {
  return effetActif(state, eq, 'puissant') ? 'tir' : null;
}

export const pouvoirActif = (state: MatchState, eq: TeamId, id: PouvoirId): boolean => state.pouvoirs?.[eq].actif === id;

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

/** Le joueur doré de l'équipe : celui qu'elle pilote, ou celui qui a déclenché le bonus pour l'ordinateur. */
export function joueurDore(state: MatchState, eq: TeamId): Skater | null {
  const p = state.pouvoirs?.[eq];
  if (!p?.actif || !DEF_POUVOIRS[p.actif].dore) return null;
  if (state.humains[eq]) return state.controles[eq];
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
  p.dore = qui?.rang ?? -1;
  p.passes = 0;
  p.tirFait = false;
  state.evenements.push({ type: 'pouvoir', eq, quoi: 'active', id: POUVOIRS.indexOf(id) });
  if (id === 'surnombre') ajouteRenfort(rink, state, eq);
  if (id === 'tremblement') tremblement(state);
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
  pal.lueur = pal.puissant ? 3 : 0;
}

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
function ajouteRenfort(rink: Rink, state: MatchState, eq: TeamId): void {
  const s = nouveauPatineur(eq, RANG_RENFORT);
  s.renfort = true;
  s.vit = state.nivEq[eq].vit;
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
function retireRenfort(state: MatchState, eq: TeamId): void {
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
  if (state.controles[eq] === r) {
    // la main revient au coéquipier le plus proche du palet
    let best: Skater | null = null;
    for (const s of state.patineurs) {
      if (s.eq === eq && (!best || Math.hypot(s.x - p.x, s.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y))) best = s;
    }
    state.controles[eq] = best;
    if (best) best.humain = true;
  }
  state.evenements.push({ type: 'onde', x: r.x, y: r.y, r: 20, c: '#ffd35c' });
  state.evenements.push({ type: 'etincelles', x: r.x, y: r.y - 6, n: 12, c: '#ffd35c' });
}

/**
 * Tremblement : tout le monde tombe (la chute de l'esquive), coéquipiers
 * compris, sauf le porteur du palet ; les gardiens vacillent, l'écran tremble.
 */
function tremblement(state: MatchState): void {
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

/** Freeze : le joueur est-il pris dans la glace (tout le monde sauf le joueur doré de l'équipe qui l'a déclenché) ? */
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
  if (state.humains[eq] && state.controles[eq]) return state.controles[eq];
  const porteur = state.palet.porteur;
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
