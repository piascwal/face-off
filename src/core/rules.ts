import { controle } from './actions';
import { DUREES, EFFECTIFS, NIVEAUX } from './constants';
import { nouveauGardien, nouveauPalet, nouveauPatineur } from './entities';
import { PROFIL_NEUTRE, type TeamProfile } from './teams';
import type { GameMode, LevelConfig, MatchState, Rink, TeamId } from './types';
import { clamp } from './utils';

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
    controle: null,
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
    evenements: [],
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
  const oy = Math.round(rink.h * 0.27);
  for (const s of state.patineurs) {
    const cote = s.eq === 0 ? -1 : 1;
    if (s.rang === 0) {
      s.x = rink.cx + cote * 20;
      s.y = rink.cy + cote * -2;
    } else {
      s.x = rink.cx + cote * 44;
      s.y = rink.cy + (s.rang === 1 ? -oy : oy);
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
  if (state.mode === 'match') controle(state, state.patineurs[0]!);
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

/** Termine le match ; renvoie si l'équipe du joueur (0) l'a emporté. */
export function finMatch(rink: Rink, state: MatchState): boolean {
  state.phase = 'fin';
  const gagne = state.score[0] > state.score[1];
  if (gagne) {
    state.evenements.push({ type: 'ovation', niveau: 1 });
    state.evenements.push({ type: 'confettis', x: rink.cx, y: rink.cy - 20, eq: 0 });
  }
  return gagne;
}
