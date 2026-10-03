import { changeAutoSiLoin } from './actions';
import { pilotageIA } from './ai';
import { appliqueEntreeJoueur } from './humanControl';
import {
  bougePatineur,
  collisionsPatineurs,
  majGardien,
  majPalet,
  recuperations,
  segmentsCage,
  type SegmentCage,
} from './physics';
import { demiCage, estGele, estInverse, LOUPE_IMPACT, LOUPE_REBOND, LOUPE_S, majPouvoirs, majSupporters } from './pouvoirs';
import { animeApproche, engagement, finMatch, finTempsReglementaire } from './rules';
import { INTENT_VIDE, type InputIntent, type MatchState, type Rink, type TeamId } from './types';
import { alea } from './utils';

/**
 * Avance la simulation d'un pas fixe. `entreeJoueur(eq)` n'est appelé qu'une
 * fois par pas et par équipe humaine, pour le patineur qu'elle contrôle —
 * c'est exactement l'`InputIntent` qu'un client réseau envoie à l'hôte. En
 * équipe à deux humains, `partenaire` vaut true pour le second.
 */
export function pas(
  rink: Rink,
  state: MatchState,
  dt: number,
  entreeJoueur: (eq: TeamId, partenaire?: boolean) => InputIntent = () => INTENT_VIDE,
): void {
  // arrêt sur image (esquive) : tout se fige un court instant
  if (state.figeT > 0) {
    state.figeT = Math.max(0, state.figeT - dt);
    return;
  }
  state.temps += dt;
  state.lampe[0] = Math.max(0, state.lampe[0] - dt / 3);
  state.lampe[1] = Math.max(0, state.lampe[1] - dt / 3);
  state.excite = Math.max(0, state.excite - dt / 3.5);

  for (const s of state.patineurs) {
    if (s.humain) {
      const intent = entreeJoueur(s.eq, s === state.partenaires[s.eq]);
      // bonus « freeze » : le joueur pris dans la glace ne fait rien (l'entrée est quand même lue)
      if (estGele(state, s)) s.ex = s.ey = 0;
      else appliqueEntreeJoueur(rink, state, s, intent, dt);
    } else if (state.phase === 'jeu' && !estGele(state, s)) {
      pilotageIA(rink, state, s, dt);
    } else {
      s.ex = s.ey = 0;
    }
    // bonus « inversion » de l'adversaire : les déplacements partent à l'envers
    if (estInverse(state, s.eq)) {
      s.ex = -s.ex;
      s.ey = -s.ey;
    }
  }

  // pendant la célébration, le buteur fait un tour d'honneur
  if (state.phase === 'but') {
    for (const s of state.patineurs) {
      if (s.humain) continue;
      if (s === state.buteur && s.eq === state.marqueur) {
        const a = state.temps * 2.2;
        s.ex = Math.cos(a);
        s.ey = Math.sin(a);
      } else {
        s.ex = s.ey = 0;
      }
    }
  }

  majPouvoirs(rink, state, dt);

  // cages à la taille du moment (cage géante, mini cage)
  const demis: [number, number] = [demiCage(state, 0), demiCage(state, 1)];
  const segsAvecFace: SegmentCage[] = segmentsCage(rink, true, demis);
  const segsSansFace: SegmentCage[] = segmentsCage(rink, false, demis);

  for (const s of state.patineurs) bougePatineur(rink, state, s, dt, segsAvecFace);
  animeApproche(state, dt);
  majSupporters(rink, state, dt);
  collisionsPatineurs(state);
  for (const gk of state.gardiens) majGardien(rink, state, gk, dt);
  majPalet(rink, state, dt / 2, segsSansFace);
  majPalet(rink, state, dt / 2, segsSansFace);
  recuperations(state, dt);
  if (state.phase === 'jeu' && state.palet.porteur) state.stats.possession[state.palet.porteur.eq] += dt;
  if (state.changementAuto && state.phase === 'jeu') changeAutoSiLoin(state);

  if (state.phase === 'engagement') {
    state.phaseT -= dt;
    const p = state.palet;
    p.x = rink.cx;
    p.y = rink.cy;
    p.vx = p.vy = 0;
    if (state.phaseT <= 0) {
      state.phase = 'jeu';
      p.vx = alea(-25, 25);
      p.vy = alea(-25, 25);
      state.evenements.push({ type: 'sifflet', long: false });
    }
  } else if (state.phase === 'jeu') {
    if (state.mode === 'match' && !state.prolong && !state.entrainement) {
      state.horloge -= dt;
      if (state.horloge <= 0) {
        state.horloge = 0;
        const suite = finTempsReglementaire(state);
        if (suite === 'prolongation') {
          engagement(rink, state, 2.4);
          state.evenements.push({ type: 'annonce', txt: 'PROLONGATION', sous: 'LE PROCHAIN BUT GAGNE', c: '#ffd35c', duree: 2.4 });
        } else {
          finMatch(rink, state);
        }
      }
    }
  } else if (state.phase === 'loupe') {
    // loupé complet : le palet vole vers la caméra (le rendu s'en charge), l'écran se brise, puis engagement
    const avant = state.phaseT;
    state.phaseT -= dt;
    const p = state.palet;
    p.vx = p.vy = 0;
    // le palet claque contre le bord de l'écran avant de revenir
    const rebond = LOUPE_S - LOUPE_REBOND;
    if (avant > rebond && state.phaseT <= rebond) {
      state.evenements.push({ type: 'bande', force: 1 });
      state.evenements.push({ type: 'secousse', force: 2.5 });
    }
    const impact = LOUPE_S - LOUPE_IMPACT;
    if (avant > impact && state.phaseT <= impact) {
      state.evenements.push({ type: 'verre' });
      state.evenements.push({ type: 'secousse', force: 6 });
      if (state.humains[0] || state.humains[1]) state.evenements.push({ type: 'vibre', ms: [60, 30, 100] });
    }
    if (state.phaseT <= 0) {
      engagement(rink, state, 1.3);
      state.evenements.push({ type: 'annonce', txt: 'PRETS ?', sous: '', c: '#ffffff', duree: 1.25 });
    }
  } else if (state.phase === 'but') {
    state.phaseT -= dt;
    if (state.phaseT <= 0) {
      if (state.mode === 'match' && state.prolong) {
        finMatch(rink, state);
      } else {
        engagement(rink, state, 1.3);
        state.evenements.push({ type: 'annonce', txt: 'PRETS ?', sous: '', c: '#ffffff', duree: 1.25 });
      }
    }
  }
}
