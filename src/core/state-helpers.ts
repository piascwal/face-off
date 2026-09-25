import type { MatchState, Skater, TeamId } from './types';

export const equipe = (state: MatchState, eq: TeamId): Skater[] => state.patineurs.filter((m) => m.eq === eq);

export function plusProche<T extends { x: number; y: number }>(liste: T[], x: number, y: number): T | null {
  let best: T | null = null;
  let dmin = 1e9;
  for (const m of liste) {
    const d = Math.hypot(m.x - x, m.y - y);
    if (d < dmin) {
      dmin = d;
      best = m;
    }
  }
  return best;
}
