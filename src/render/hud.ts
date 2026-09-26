import type { GamePhase, MatchState } from '@core/types';
import { zonePause } from './hud-zones';
import { largeurTexte, texte } from './pixel-font';
import { px } from './primitives';
import { C } from './theme';
import type { EquipeVisuelle } from './team-visuals';

const ETOILE = ['00100', '11111', '01110', '01010'];

function etoile(g: CanvasRenderingContext2D, x: number, y: number): void {
  ETOILE.forEach((ligne, j) => {
    for (let i = 0; i < 5; i++) if (ligne[i] === '1') px(g, x + i, y + j, 1, 1, C.or);
  });
}

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
  const etoiles = state.bonus[0] !== 'aucun' || state.bonus[1] !== 'aucun';
  const lw = Math.max(150, 2 * (plusLong + 9 + 32 + (etoiles ? 8 : 0)));
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
  // petite étoile : cette équipe joue avec un handicap (partie Wi-Fi)
  if (state.bonus[0] !== 'aucun') etoile(g, x + 9 + largeurTexte(equipes[0].code) + 4, y + 7);
  if (state.bonus[1] !== 'aucun') etoile(g, x + lw - 9 - largeurTexte(equipes[1].code) - 9, y + 7);
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

/**
 * Jauge de puissance du tir, en bas à gauche de l'écran : visible seulement
 * pendant que le joueur piloté arme son tir (plutôt qu'au-dessus de sa tête,
 * où elle se mêlait aux repères des joueurs).
 */
export function dessineJaugeTir(g: CanvasRenderingContext2D, H: number, charge: number, temps: number): void {
  const x = 8;
  const y = H - 17;
  const w = 60;
  px(g, x - 1, y - 1, w + 26, 13, C.contour);
  px(g, x, y, w + 24, 11, '#161b36');
  texte(g, 'TIR', x + 3, y + 2, C.blanc, 1, 'g');
  const bx = x + 21;
  px(g, bx, y + 3, w, 5, '#2a2f4a');
  const c = charge > 0.85 ? (Math.floor(temps * 20) & 1 ? '#ffffff' : '#ff5a4e') : charge > 0.5 ? '#ffb13b' : '#ffe27a';
  px(g, bx, y + 3, Math.max(1, Math.round(w * Math.min(1, charge))), 5, c);
}
