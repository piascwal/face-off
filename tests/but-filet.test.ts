import { describe, expect, it } from 'vitest';
import { BUT_DEMI, BUT_PROF } from '../src/core/constants';
import { calculeRink } from '../src/core/rink';
import { creePartie } from '../src/core/rules';
import { pas } from '../src/core/simulation';

const rink = calculeRink(400, 200);

describe('palet dans les filets', () => {
  it('un tir qui rentre reste au fond de la cage pendant toute la célébration', () => {
    const st = creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1 });
    st.phase = 'jeu';
    // les patineurs loin du but, le gardien écarté : le palet file droit dans la cage de droite
    for (const s of st.patineurs) {
      s.x = rink.cx;
      s.y = rink.cy + 60;
    }
    const gk = st.gardiens[1]!;
    gk.y = rink.cy + BUT_DEMI + 20;
    const p = st.palet;
    p.porteur = null;
    p.x = rink.butD - 12;
    p.y = rink.cy + 3;
    p.vx = 420;
    p.vy = 0;
    let dedans = 0;
    let dehors = 0;
    for (let i = 0; i < 180; i++) {
      pas(rink, st, 1 / 60);
      const phase: string = st.phase;
      if (phase !== 'but') continue;
      const inside = p.x > rink.butD && p.x < rink.butD + BUT_PROF + 1 && Math.abs(p.y - rink.cy) < BUT_DEMI;
      if (inside) dedans++;
      else dehors++;
    }
    expect(st.score[0]).toBe(1);
    expect(dedans).toBeGreaterThan(60);
    expect(dehors).toBe(0);
  });
});
