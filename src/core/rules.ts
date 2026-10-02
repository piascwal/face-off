import { controle } from './actions';
import { ANNONCE_BUT_S, APPROCHE_COEQUIPIER, APPROCHE_MISE_AU_JEU, APPROCHE_S, DUREES, EFFECTIFS, NIVEAUX, niveauInterpole } from './constants';
import { nouveauGardien, nouveauPalet, nouveauPatineur } from './entities';
import { cassePasses, etatPouvoirsInitial, finPouvoir } from './pouvoirs';
import { PROFIL_NEUTRE, type TeamProfile } from './teams';
import { statsVides, type PouvoirId, type BonusEquipe, type GameMode, type LevelConfig, type MatchState, type Rink, type TeamId, type Vec2 } from './types';
import { angDiff, clamp, decalageRang } from './utils';

export interface OptionsPartie {
  mode: GameMode;
  /**
   * Index dans NIVEAUX (fractionnaire en coupe : niveau interpolé) ; ignoré en
   * mode démo (utilise toujours NORMAL). Règle le CPU.
   */
  niveauIdx: number;
  /** Index dans DUREES ; ignoré en mode démo. */
  dureeIdx: number;
  /** Index dans EFFECTIFS ; ignoré en mode démo (toujours 3 contre 3). */
  effectifIdx: number;
  /** Équipe pilotée par l'humain — ignorée en mode démo (profil neutre). */
  equipeJoueur?: TeamProfile;
  /** Équipe adverse — ignorée en mode démo (profil neutre). */
  equipeAdverse?: TeamProfile;
  /** Réglages avancés (menu) ; toujours activés en mode démo. */
  assistTir?: boolean;
  assistPasse?: boolean;
  changementAuto?: boolean;
  /** Équipes pilotées par un humain ; par défaut seule l'équipe 0 (solo contre le CPU). */
  humains?: [boolean, boolean];
  /**
   * Coop (partie Wi-Fi) : l'hôte et l'invité jouent ensemble l'équipe 0 contre
   * le CPU (qui garde le niveau `niveauIdx`) ; `humains` est alors ignoré.
   */
  coop?: boolean;
  /** Handicap de chaque équipe (partie Wi-Fi) ; aucun par défaut. */
  bonus?: [BonusEquipe, BonusEquipe];
  /** Durée de la phase « but » ; allongée quand le ralenti des buts est activé. */
  dureeBut?: number;
  /** Bonus (power-ups) en jeu ; jamais en démo. */
  pouvoirs?: boolean;
  /** Mode entraînement : le bonus choisi revient sans cesse, pas de chrono (implique les bonus). */
  entrainement?: PouvoirId;
}

/** Phase « but » sans ralenti : le bandeau, puis un court temps avant l'engagement. */
export const DUREE_BUT = ANNONCE_BUT_S + 0.2;

/**
 * Un profil d'équipe (vitesse/tir/défense/gardien) module le niveau de
 * difficulté choisi : la vitesse de patinage vient directement de l'équipe,
 * les autres axes (précision, agressivité défensive, réflexes du gardien)
 * scalent la valeur de base de la difficulté. Un profil neutre (1 partout)
 * redonne exactement le niveau de difficulté d'origine — c'est ce qu'utilise
 * le mode démo, qui ne connaît pas d'équipes jouables.
 */
function combineProfil(niveau: LevelConfig, equipe: TeamProfile): LevelConfig {
  return {
    nom: niveau.nom,
    vit: equipe.vit,
    reac: niveau.reac,
    err: clamp(niveau.err * (2 - equipe.tir), 0.01, 1),
    poke: niveau.poke * equipe.defense,
    check: niveau.check * equipe.defense,
    esquive: niveau.esquive,
    gk: niveau.gk * equipe.gardien,
    antic: Math.min(1, niveau.antic * equipe.gardien),
    portee: niveau.portee * equipe.tir,
  };
}

export function creePartie(rink: Rink, opts: OptionsPartie): MatchState {
  const niveauAdverse = opts.mode === 'demo' ? NIVEAUX[1]! : niveauInterpole(opts.niveauIdx);
  const nb = opts.mode === 'demo' ? 3 : EFFECTIFS[opts.effectifIdx]!;
  const profilJoueur = opts.equipeJoueur ?? PROFIL_NEUTRE;
  const profilAdverse = opts.equipeAdverse ?? PROFIL_NEUTRE;
  // vos coéquipiers jouent toujours calés sur le niveau normal ; le niveau
  // choisi dans le menu ne règle que le CPU. Les deux sont ensuite modulés
  // par le profil de l'équipe choisie.
  const nivEq: [LevelConfig, LevelConfig] = [combineProfil(NIVEAUX[1]!, profilJoueur), combineProfil(niveauAdverse, profilAdverse)];
  const bonus: [BonusEquipe, BonusEquipe] = opts.mode === 'demo' ? ['aucun', 'aucun'] : (opts.bonus ?? ['aucun', 'aucun']);
  for (const eq of [0, 1] as TeamId[]) {
    const n = nivEq[eq];
    if (bonus[eq] === 'gardien') {
      n.gk *= 1.2;
      n.antic = Math.min(1, n.antic * 1.2);
    } else if (bonus[eq] === 'vitesse') {
      n.vit *= 1.1;
    }
  }

  const coop = opts.mode === 'match' && !!opts.coop && nb >= 2;
  const state: MatchState = {
    mode: opts.mode,
    niv: niveauAdverse,
    nivEq,
    nb,
    patineurs: [],
    humains: opts.mode === 'demo' ? [false, false] : coop ? [true, false] : (opts.humains ?? [true, false]),
    controles: [null, null],
    coop,
    partenaire: null,
    gardiens: [nouveauGardien(0), nouveauGardien(1)],
    palet: nouveauPalet(),
    // « 1 but d'avance » : l'équipe aidée commence le match en menant
    score: [bonus[0] === 'but' ? 1 : 0, bonus[1] === 'but' ? 1 : 0],
    tirs: [0, 0],
    arrets: [0, 0],
    horloge: opts.mode === 'demo' ? 0 : DUREES[opts.dureeIdx]!,
    prolong: false,
    phase: 'engagement',
    phaseT: 1.6,
    temps: 0,
    lampe: [0, 0],
    excite: 0,
    marqueur: null,
    buteur: null,
    combo: [0, 0],
    pouvoirs: opts.mode === 'match' && (opts.pouvoirs || opts.entrainement) ? [etatPouvoirsInitial(), etatPouvoirsInitial()] : null,
    entrainement: opts.mode === 'match' ? (opts.entrainement ?? null) : null,
    reception: null,
    figeT: 0,
    supporters: [],
    evenements: [],
    assistTir: opts.mode === 'demo' ? true : (opts.assistTir ?? true),
    assistPasse: opts.mode === 'demo' ? true : (opts.assistPasse ?? true),
    changementAuto: opts.mode === 'demo' ? true : (opts.changementAuto ?? true),
    bonus,
    stats: statsVides(),
    dureeBut: opts.dureeBut ?? DUREE_BUT,
  };

  for (const eq of [0, 1] as TeamId[]) {
    for (let i = 0; i < nb; i++) {
      const s = nouveauPatineur(eq, i);
      s.vit = nivEq[eq].vit;
      state.patineurs.push(s);
    }
  }
  state.gardiens[0].vit = nivEq[0].gk;
  state.gardiens[0].antic = nivEq[0].antic;
  state.gardiens[1].vit = nivEq[1].gk;
  state.gardiens[1].antic = nivEq[1].antic;

  engagement(rink, state, 1.6);
  return state;
}

export function engagement(rink: Rink, state: MatchState, duree: number): void {
  const p = state.palet;
  p.x = rink.cx;
  p.y = rink.cy;
  p.vx = p.vy = 0;
  p.porteur = null;
  p.passe = null;
  p.qualite = 0;
  p.trace.length = 0;
  state.combo = [0, 0];
  cassePasses(state, 0);
  cassePasses(state, 1);
  p.puissant = false;
  state.reception = null;
  p.passes = 0;
  p.uneTouche = false;
  const oy = Math.round(rink.h * 0.22);
  for (const s of state.patineurs) {
    const cote = s.eq === 0 ? -1 : 1;
    if (s.rang === 0) {
      s.x = rink.cx + cote * 20;
      s.y = rink.cy + cote * -2;
    } else {
      s.x = rink.cx + cote * 44;
      // rang 1 d'un côté, rang 2 de l'autre, rang 3/4 plus loin — s'étend
      // proprement au-delà de 3 joueurs par équipe (voir decalageRang).
      s.y = clamp(rink.cy + decalageRang(s.rang, oy), rink.y + 12, rink.y + rink.h - 12);
    }
    s.vx = s.vy = 0;
    s.tient = false;
    s.arme = false;
    s.charge = 0;
    s.sonne = 0;
    s.elanT = 0;
    s.prepaEchecT = 0;
    s.chuteT = 0;
    s.chuteD = 0;
    s.tirT = 0;
    s.flashT = 0;
    s.face = s.eq === 0 ? 0 : Math.PI;
    s.recupCd = 0;
    s.vise = null;
  }
  for (const gk of state.gardiens) {
    gk.a = 0;
    gk.tient = 0;
    gk.cd = 0;
  }
  if (state.mode === 'match') {
    for (const eq of [0, 1] as TeamId[]) {
      const premier = state.patineurs.find((s) => s.eq === eq && s.rang === 0);
      if (state.humains[eq] && premier) controle(state, premier);
    }
    // coop : le second humain démarre avec le coéquipier de rang 1
    const second = state.patineurs.find((s) => s.eq === 0 && s.rang === 1);
    if (state.coop && second) controle(state, second, 1);
  }
  // les cages déformées par un bonus (géante, mini) ont duré le temps du but : retour à la normale
  for (const eq of [0, 1] as TeamId[]) {
    const actif = state.pouvoirs?.[eq].actif;
    if (actif === 'geante' || actif === 'minicage') finPouvoir(state, eq);
  }
  preparerApproche(rink, state, duree);
  state.phase = 'engagement';
  state.phaseT = duree;
}

/**
 * Engagement : chaque joueur est reculé de son point de départ (le joueur de la
 * mise au jeu plus loin que ses coéquipiers) et skate vers sa position ; voir
 * `animeApproche`, qui l'y amène pendant les premières secondes de l'engagement.
 */
function preparerApproche(rink: Rink, state: MatchState, duree: number): void {
  const depart: Vec2[] = [];
  const cible: Vec2[] = [];
  for (const s of state.patineurs) {
    const cote = s.eq === 0 ? -1 : 1;
    const c = { x: s.x, y: s.y };
    let d: Vec2;
    if (s.rang === 0) {
      // face à face : chacun arrive du fond de son côté, en biais
      d = { x: c.x + cote * APPROCHE_MISE_AU_JEU, y: c.y + (s.eq === 0 ? 1 : -1) * 16 };
    } else {
      const bas = c.y >= rink.cy ? 1 : -1;
      d = { x: c.x + cote * APPROCHE_COEQUIPIER, y: clamp(c.y + bas * 22, rink.y + 12, rink.y + rink.h - 12) };
    }
    depart.push(d);
    cible.push(c);
    s.x = d.x;
    s.y = d.y;
    const a = Math.atan2(c.y - d.y, c.x - d.x);
    s.face = a;
  }
  state.approche = { t: 0, duree: Math.min(APPROCHE_S, duree * 0.65), depart, cible };
}

/**
 * Un pas de l'approche : le joueur glisse vers sa position en freinant (courbe
 * douce, vitesse maximale au départ), regarde où il va, puis se tourne face à
 * l'adversaire à l'arrivée. Le palet, lui, reste au centre.
 */
export function animeApproche(state: MatchState, dt: number): void {
  const ap = state.approche;
  if (!ap || state.phase !== 'engagement') return;
  const avant = ap.t;
  ap.t = Math.min(ap.duree, ap.t + dt);
  const u = ap.t / ap.duree;
  const e = 1 - (1 - u) * (1 - u);
  const freine = avant / ap.duree < 0.6 && u >= 0.6;
  state.patineurs.forEach((s, i) => {
    const d = ap.depart[i];
    const c = ap.cible[i];
    if (!d || !c) return;
    const x = d.x + (c.x - d.x) * e;
    const y = d.y + (c.y - d.y) * e;
    s.vx = (x - s.x) / dt;
    s.vy = (y - s.y) / dt;
    s.x = x;
    s.y = y;
    const sp = Math.hypot(s.vx, s.vy);
    s.anim += sp * dt;
    const but = s.eq === 0 ? 0 : Math.PI;
    if (u < 1 && sp > 8) {
      // il regarde où il va, puis se tourne vers le point de mise au jeu sur la fin
      const cap = u > 0.7 ? but : Math.atan2(s.vy, s.vx);
      s.face += clamp(angDiff(s.face, cap), -13 * dt, 13 * dt);
    } else if (u >= 1) {
      s.vx = s.vy = 0;
      s.face += clamp(angDiff(s.face, but), -13 * dt, 13 * dt);
    }
    // le joueur de la mise au jeu freine en gerbe de glace
    if (freine && s.rang === 0) {
      state.evenements.push({ type: 'neige', x: s.x, y: s.y + 3, n: 4, vx: -s.vx * 0.4, vy: -s.vy * 0.4 });
      state.evenements.push({ type: 'raclement' });
    }
  });
  if (ap.t >= ap.duree) state.approche = null;
}

/** Fin du temps réglementaire : renvoie s'il faut jouer une prolongation ou finir le match. */
export function finTempsReglementaire(state: MatchState): 'prolongation' | 'fin' {
  state.evenements.push({ type: 'sifflet', long: true });
  if (state.score[0] === state.score[1]) {
    state.prolong = true;
    return 'prolongation';
  }
  return 'fin';
}

/** Termine le match ; renvoie si l'équipe 0 l'a emporté. Les confettis saluent un vainqueur humain. */
export function finMatch(rink: Rink, state: MatchState): boolean {
  state.phase = 'fin';
  const gagnant: TeamId = state.score[0] > state.score[1] ? 0 : 1;
  if (state.score[0] !== state.score[1] && state.humains[gagnant]) {
    state.evenements.push({ type: 'ovation', niveau: 1 });
    state.evenements.push({ type: 'confettis', x: rink.cx, y: rink.cy - 20, eq: gagnant });
  }
  return gagnant === 0 && state.score[0] !== state.score[1];
}
