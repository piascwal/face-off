import { changeJoueur, elan, passeJoueur, tir } from './actions';
import { BUT_DEMI } from './constants';
import { angleVersCoinLoin, butAttaque } from './shooting';
import type { InputIntent, MatchState, Rink, Skater } from './types';
import { angDiff } from './utils';

/** Aide à la visée : un tir à peu près vers la cage part vers un coin. */
export function assistance(rink: Rink, state: MatchState, s: Skater, a: number, oriente: boolean, exact: boolean): number {
  if (!state.assistTir) return a;
  const gx = butAttaque(rink, s.eq);
  const aCentre = Math.atan2(rink.cy - s.y, gx - s.x);
  const dA = angDiff(aCentre, a);
  if (Math.abs(dA) > 0.75) return a;
  let aCoin: number;
  if (!oriente || Math.abs(dA) < 0.06) {
    const gardien = state.gardiens[s.eq === 0 ? 1 : 0];
    aCoin = angleVersCoinLoin(rink, s.eq, s.x, s.y, gardien, exact ? 0 : 0.04);
  } else {
    const sy = dA > 0 === Math.cos(aCentre) > 0 ? 1 : -1;
    aCoin = Math.atan2(rink.cy + sy * (BUT_DEMI - 3.5) - s.y, gx - s.x);
  }
  return a + angDiff(a, aCoin) * 0.7;
}

/** L'angle réellement utilisé au tir ; « exact » coupe l'imprécision pour l'affichage. */
export function angleTirJoueur(
  rink: Rink,
  state: MatchState,
  s: Skater,
  ix: number,
  iy: number,
  viseeManuelle: number | null,
  exact: boolean,
): number {
  if (viseeManuelle !== null) {
    if (!state.assistTir) return viseeManuelle;
    // visée manuelle : on respecte le geste, avec juste un léger aimant vers le coin tout proche
    const gx = butAttaque(rink, s.eq);
    let best: number | null = null;
    let e = 0.18;
    for (const sy of [-1, 1]) {
      const a = Math.atan2(rink.cy + sy * (BUT_DEMI - 3.5) - s.y, gx - s.x);
      const d = Math.abs(angDiff(viseeManuelle, a));
      if (d < e) {
        e = d;
        best = a;
      }
    }
    return best === null ? viseeManuelle : viseeManuelle + angDiff(viseeManuelle, best) * 0.5;
  }
  const m = Math.hypot(ix, iy);
  const a = m > 0.35 ? Math.atan2(iy, ix) : s.face;
  return assistance(rink, state, s, a, m > 0.35, exact);
}

/**
 * Applique l'intention d'entrée d'un pas de simulation au patineur humain.
 * Fonction pure côté simulation : en réseau local, l'hôte applique ici
 * l'`InputIntent` reçu du client pour l'équipe adverse (voir src/net).
 */
export function appliqueEntreeJoueur(rink: Rink, state: MatchState, s: Skater, intent: InputIntent, dt: number): void {
  s.ex = intent.ix;
  s.ey = intent.iy;
  const actif = state.phase === 'jeu';
  if (intent.tirAppui) {
    if (actif && !s.tient) {
      s.pokeT = 0.3;
      state.evenements.push({ type: 'elan' });
    }
  }
  if (intent.tirTenu && s.tient && !s.arme && actif) {
    s.arme = true;
    s.charge = 0;
  }
  if (s.arme) {
    if (!s.tient) {
      s.arme = false;
      s.charge = 0;
    } else {
      s.charge = Math.min(1, s.charge + dt / 0.85);
    }
  }
  s.vise = s.arme ? angleTirJoueur(rink, state, s, intent.ix, intent.iy, intent.viseeManuelle, true) : null;
  if (intent.tirRelache) {
    if (s.arme && s.tient && actif) {
      tir(state, rink, s, angleTirJoueur(rink, state, s, intent.ix, intent.iy, intent.viseeManuelle, false), s.charge);
    }
    s.arme = false;
    s.vise = null;
  }
  if (intent.passeAppui && actif) {
    if (s.tient) passeJoueur(state, s, intent.ix, intent.iy, state.assistPasse);
    else changeJoueur(state, s.eq);
  }
  if (intent.elanAppui && actif) elan(state, s, intent.ix, intent.iy);
}
