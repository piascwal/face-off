import { controle } from './actions';
import { DUREES, EFFECTIFS, NIVEAUX } from './constants';
import { nouveauGardien, nouveauPalet, nouveauPatineur } from './entities';
import type { GameMode, MatchState, Rink, TeamId } from './types';

export interface OptionsPartie {
  mode: GameMode;
  /** Index dans NIVEAUX ; ignoré en mode démo (utilise toujours NORMAL). */
  niveauIdx: number;
  /** Index dans DUREES ; ignoré en mode démo. */
  dureeIdx: number;
  /** Index dans EFFECTIFS ; ignoré en mode démo (toujours 3 contre 3). */
  effectifIdx: number;
}

export function creePartie(rink: Rink, opts: OptionsPartie): MatchState {
  const niv = opts.mode === 'demo' ? NIVEAUX[1]! : NIVEAUX[opts.niveauIdx]!;
  const nb = opts.mode === 'demo' ? 3 : EFFECTIFS[opts.effectifIdx]!;
  // vos coéquipiers jouent toujours au niveau normal ; le niveau choisi règle le CPU
  const nivEq: [typeof niv, typeof niv] = [opts.mode === 'match' ? NIVEAUX[1]! : niv, niv];

  const state: MatchState = {
    mode: opts.mode,
    niv,
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
      s.vit = opts.mode === 'match' && eq === 0 ? 1 : nivEq[eq].vit;
      state.patineurs.push(s);
    }
  }
  state.gardiens[0].vit = opts.mode === 'match' ? 2.0 : niv.gk;
  state.gardiens[0].antic = opts.mode === 'match' ? 0.3 : niv.antic;
  state.gardiens[1].vit = niv.gk;
  state.gardiens[1].antic = niv.antic;

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
