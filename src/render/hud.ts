import type { GamePhase, MatchState } from '@core/types';
import { zonePause } from './hud-zones';
import { largeurTexte, texte } from './pixel-font';
import { px } from './primitives';
import { C } from './theme';
import type { EquipeVisuelle } from './team-visuals';

const format = (t: number): string => {
  const tc = Math.ceil(t);
  return `${Math.floor(tc / 60)}:${String(tc % 60).padStart(2, '0')}`;
};

export function dessineTableau(
  g: CanvasRenderingContext2D,
  W: number,
  state: MatchState,
  ecranUI: string,
  equipes: [EquipeVisuelle, EquipeVisuelle],
): void {
  const cx = Math.round(W / 2);
  // assez large pour les noms longs (TOULOUSE, GRENOBLE) sans toucher le score
  const plusLong = Math.max(largeurTexte(equipes[0].code), largeurTexte(equipes[1].code));
  const lw = Math.max(150, 2 * (plusLong + 9 + 32));
  const x = cx - lw / 2;
  const y = 2;
  px(g, x - 1, y - 1, lw + 2, 21, C.contour);
  px(g, x, y, lw, 19, '#161b36');
  px(g, x, y, lw, 1, '#2a3160');
  px(g, x, y + 18, lw, 1, '#0f1328');
  px(g, x + 3, y + 3, 3, 13, equipes[0].maillot);
  px(g, x + lw - 6, y + 3, 3, 13, equipes[1].maillot);
  texte(g, equipes[0].code, x + 9, y + 6, equipes[0].clair, 1, 'g');
  texte(g, equipes[1].code, x + lw - 9, y + 6, equipes[1].clair, 1, 'd');
  texte(g, state.score[0], cx - 22, y + 3, C.blanc, 2, 'c');
  texte(g, state.score[1], cx + 22, y + 3, C.blanc, 2, 'c');

  let h: string;
  if (state.mode !== 'match') h = 'DEMO';
  else if (state.prolong) h = 'PROL';
  else h = format(state.horloge);
  const presse: GamePhase | boolean = state.mode === 'match' && !state.prolong && state.horloge < 10 && state.phase === 'jeu';
  px(g, cx - 13, y + 4, 26, 11, '#05060f');
  texte(g, h, cx, y + 6, presse && Math.floor(state.temps * 4) & 1 ? '#ff5a4e' : C.or, 1, 'c', null);

  if (ecranUI === 'jeu') {
    const zp = zonePause(W);
    px(g, zp.x - 1, zp.y - 1, zp.w + 2, zp.h + 2, C.contour);
    px(g, zp.x, zp.y, zp.w, zp.h, '#161b36');
    px(g, zp.x + 5, zp.y + 3, 2, 8, C.blanc);
    px(g, zp.x + 9, zp.y + 3, 2, 8, C.blanc);
  }
}
