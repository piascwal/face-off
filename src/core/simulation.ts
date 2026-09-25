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
import { engagement, finMatch, finTempsReglementaire } from './rules';
import { INTENT_VIDE, type InputIntent, type MatchState, type Rink } from './types';
import { alea } from './utils';

/**
 * Avance la simulation d'un pas fixe. `entreeJoueur` n'est appelé que pour le
 * patineur actuellement contrôlé par l'humain — c'est exactement l'`InputIntent`
 * qu'un futur client enverrait à un serveur autoritaire à chaque tick.
 */
export function pas(rink: Rink, state: MatchState, dt: number, entreeJoueur: () => InputIntent = () => INTENT_VIDE): void {
  state.temps += dt;
  state.lampe[0] = Math.max(0, state.lampe[0] - dt / 3);
  state.lampe[1] = Math.max(0, state.lampe[1] - dt / 3);
  state.excite = Math.max(0, state.excite - dt / 3.5);

  for (const s of state.patineurs) {
    if (s.humain) {
      appliqueEntreeJoueur(rink, state, s, entreeJoueur(), dt);
    } else if (state.phase === 'jeu') {
      pilotageIA(rink, state, s, dt);
    } else {
      s.ex = s.ey = 0;
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

  const segsAvecFace: SegmentCage[] = segmentsCage(rink, true);
  const segsSansFace: SegmentCage[] = segmentsCage(rink, false);

  for (const s of state.patineurs) bougePatineur(rink, state, s, dt, segsAvecFace);
  collisionsPatineurs(state);
  for (const gk of state.gardiens) majGardien(rink, state, gk, dt);
  majPalet(rink, state, dt / 2, segsSansFace);
  majPalet(rink, state, dt / 2, segsSansFace);
  recuperations(state, dt);

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
    if (state.mode === 'match' && !state.prolong) {
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
  } else if (state.phase === 'but') {
    state.phaseT -= dt;
    if (state.phaseT <= 0) {
      if (state.mode === 'match' && state.prolong) {
        finMatch(rink, state);
      } else {
        engagement(rink, state, 1.3);
        state.evenements.push({ type: 'annonce', txt: 'PRETS ?', sous: '', c: '#ffffff', duree: 1.1 });
      }
    }
  }
}
