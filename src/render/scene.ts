import { meilleurReceveur } from '@core/actions';
import { equipe } from '@core/state-helpers';
import type { MatchState, Rink, TeamId } from '@core/types';
import { dessineGardien, dessinePalet, dessineParticules, dessinePatineur, TracesGlace } from './entities-render';
import type { SystemeEffets } from './effects';
import { ellipseOmbre, px } from './primitives';
import { dessineCage, dessineLampe } from './rink-render';
import type { BanqueSprites } from './sprites';
import { texte } from './pixel-font';
import { C } from './theme';
import type { EquipeVisuelle } from './team-visuals';

export interface DecorPatinoire {
  glace: HTMLCanvasElement;
  foule: [HTMLCanvasElement, HTMLCanvasElement];
  traces: TracesGlace;
}

export function dessineScene(
  g: CanvasRenderingContext2D,
  rink: Rink,
  state: MatchState,
  decor: DecorPatinoire,
  sprites: BanqueSprites,
  effets: SystemeEffets,
  ecranUI: string,
  equipes: [EquipeVisuelle, EquipeVisuelle],
  /** Équipe pilotée sur cet écran (1 pour le client d'une partie en réseau local). */
  eqLocal: TeamId = 0,
): void {
  const p = state.palet;
  p.trace.push({ x: p.x, y: p.y });
  if (p.trace.length > 7) p.trace.shift();

  const bond = state.excite > 0.05 ? Math.floor(state.temps * 9) & 1 : Math.floor(state.temps * 0.7) % 5 === 0 ? 1 : 0;
  g.drawImage(decor.foule[bond], 0, 0);
  g.drawImage(decor.glace, 0, 0);
  decor.traces.dessine(g, state.patineurs, state.temps);
  dessineLampe(g, rink, 0, state.lampe[0], state.temps);
  dessineLampe(g, rink, 1, state.lampe[1], state.temps);
  dessineCage(g, rink, 0);
  dessineCage(g, rink, 1);

  // ombres puis entités triées par profondeur
  for (const s of state.patineurs) ellipseOmbre(g, s.x, s.y + 3, 7, 1.5, 0.28);

  // en match, on repère ses coéquipiers et le receveur que viserait une passe
  if (state.mode === 'match' && ecranUI === 'jeu') {
    const c = state.controles[eqLocal];
    let rec = null;
    if (c && c.tient && state.phase === 'jeu') {
      const m = Math.hypot(c.ex, c.ey);
      const r =
        meilleurReceveur(state, c, eqLocal, c.x, c.y, m > 0.3 ? Math.atan2(c.ey, c.ex) : null) ??
        meilleurReceveur(state, c, eqLocal, c.x, c.y, null);
      rec = r?.m ?? null;
    }
    for (const s of equipe(state, eqLocal)) {
      if (s === c) continue;
      if (s === rec) {
        const cl = Math.floor(state.temps * 6) & 1 ? C.or : C.blanc;
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2 + state.temps * 3;
          if (k % 2 === 0) px(g, s.x + Math.cos(a) * 8, s.y + 3 + Math.sin(a) * 3, 1, 1, cl);
        }
      } else if (!s.tient) {
        px(g, s.x - 1, s.y + 5, 3, 1, equipes[eqLocal].maillot);
      }
    }
  }

  for (const gk of state.gardiens) ellipseOmbre(g, gk.x, gk.y + 3, 9, 1.5, 0.28);

  const liste: { y: number; f: () => void }[] = [
    ...state.patineurs.map((s) => ({
      y: s.y,
      f: () => dessinePatineur(g, sprites, s, state.temps, s === state.controles[eqLocal], equipes, state.tirSpecialPret[s.eq]),
    })),
    ...state.gardiens.map((gk) => ({ y: gk.y, f: () => dessineGardien(g, sprites, gk, state.temps, equipes) })),
    { y: p.y - 2, f: () => dessinePalet(g, p) },
  ];
  liste.sort((a, b) => a.y - b.y);
  for (const e of liste) e.f();

  dessineParticules(g, effets.particules);
  for (const b of effets.bulles) {
    g.globalAlpha = Math.min(1, b.vie * 3);
    texte(g, b.txt, b.x, b.y, b.c);
    g.globalAlpha = 1;
  }
}
