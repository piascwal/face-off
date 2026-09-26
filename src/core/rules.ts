import { controle } from './actions';
import { DUREES, EFFECTIFS, NIVEAUX } from './constants';
import { nouveauGardien, nouveauPalet, nouveauPatineur } from './entities';
import { PROFIL_NEUTRE, type TeamProfile } from './teams';
import type { GameMode, LevelConfig, MatchState, Rink, TeamId } from './types';
import { clamp, decalageRang } from './utils';

export interface OptionsPartie {
  mode: GameMode;
  /** Index dans NIVEAUX ; ignoré en mode démo (utilise toujours NORMAL). Règle le CPU. */
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
}

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
    gk: niveau.gk * equipe.gardien,
    antic: Math.min(1, niveau.antic * equipe.gardien),
    portee: niveau.portee * equipe.tir,
  };
}

export function creePartie(rink: Rink, opts: OptionsPartie): MatchState {
  const niveauAdverse = opts.mode === 'demo' ? NIVEAUX[1]! : NIVEAUX[opts.niveauIdx]!;
  const nb = opts.mode === 'demo' ? 3 : EFFECTIFS[opts.effectifIdx]!;
  const profilJoueur = opts.equipeJoueur ?? PROFIL_NEUTRE;
  const profilAdverse = opts.equipeAdverse ?? PROFIL_NEUTRE;
  // vos coéquipiers jouent toujours calés sur le niveau normal ; le niveau
  // choisi dans le menu ne règle que le CPU. Les deux sont ensuite modulés
  // par le profil de l'équipe choisie.
  const nivEq: [LevelConfig, LevelConfig] = [combineProfil(NIVEAUX[1]!, profilJoueur), combineProfil(niveauAdverse, profilAdverse)];

  const state: MatchState = {
    mode: opts.mode,
    niv: niveauAdverse,
    nivEq,
    nb,
    patineurs: [],
    humains: opts.mode === 'demo' ? [false, false] : (opts.humains ?? [true, false]),
    controles: [null, null],
    gardiens: [nouveauGardien(0), nouveauGardien(1)],
    palet: nouveauPalet(),
    score: [0, 0],
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
    tirSpecialPret: [false, false],
    evenements: [],
    assistTir: opts.mode === 'demo' ? true : (opts.assistTir ?? true),
    assistPasse: opts.mode === 'demo' ? true : (opts.assistPasse ?? true),
    changementAuto: opts.mode === 'demo' ? true : (opts.changementAuto ?? true),
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
  state.tirSpecialPret = [false, false];
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
  }
  state.phase = 'engagement';
  state.phaseT = duree;
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
