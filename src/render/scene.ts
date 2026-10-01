import { meilleurReceveur, menaceEchec } from '@core/actions';
import { BUT_DEMI } from '@core/constants';
import { ALERTE_FIN_S, DEF_POUVOIRS, estGele, estInverse, joueurDore } from '@core/pouvoirs';
import { butAttaque } from '@core/shooting';
import { equipe } from '@core/state-helpers';
import type { MatchState, Rink, Skater, TeamId } from '@core/types';
import { dessineGardien, dessinePalet, dessineParticules, dessinePatineur, TracesGlace, type AspectBonus } from './entities-render';
import type { SystemeEffets } from './effects';
import { anneau, ellipseOmbre, px } from './primitives';
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

/**
 * Aspect du joueur doré d'un bonus en cours : il clignote entre doré et
 * normal pendant les dernières secondes, de plus en plus vite.
 */
function aspectBonus(state: MatchState, s: Skater): AspectBonus | null {
  if (!state.pouvoirs) return null;
  const gele = estGele(state, s);
  const confus = estInverse(state, s.eq);
  const pv = state.pouvoirs[s.eq];
  const dore = !!pv.actif && joueurDore(state, s.eq) === s;
  if (!dore && !gele && !confus) return null;
  let or = dore;
  if (dore && pv.reste < ALERTE_FIN_S) {
    // phase cumulée d'un clignotement qui accélère de 3 à 13 Hz
    const u = ALERTE_FIN_S - pv.reste;
    or = Math.floor((3 * u + 2.5 * u * u) * 2) % 2 === 0;
  }
  return { or, vitesse: dore && pv.actif === 'vitesse', gele, confus };
}

/**
 * Freeze : une onde de givre part du joueur doré et recouvre la patinoire,
 * qui reste bleutée tant que le bonus dure.
 */
function givre(g: CanvasRenderingContext2D, rink: Rink, state: MatchState): void {
  for (const eq of [0, 1] as TeamId[]) {
    const pv = state.pouvoirs?.[eq];
    if (pv?.actif !== 'freeze') continue;
    const age = DEF_POUVOIRS.freeze.duree - pv.reste;
    const fin = Math.min(1, pv.reste / 0.4);
    const centre = joueurDore(state, eq) ?? { x: rink.cx, y: rink.cy };
    const rayon = Math.min(1, age / 0.5) * Math.hypot(rink.w, rink.h);
    g.save();
    g.beginPath();
    g.rect(rink.x, rink.y, rink.w, rink.h);
    g.clip();
    g.globalAlpha = 0.22 * fin;
    g.fillStyle = '#bfefff';
    g.beginPath();
    g.arc(centre.x, centre.y, rayon, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // le front de l'onde, pendant qu'elle se propage
    if (age < 0.5) {
      g.globalAlpha = 1 - age / 0.5;
      anneau(g, centre.x, centre.y, rayon, '#f2fcff', 1, 2);
      g.globalAlpha = 1;
    }
    // cristaux qui scintillent sur la glace
    g.globalAlpha = 0.8 * fin;
    for (let i = 0; i < 24; i++) {
      const x = rink.x + ((i * 97.3) % rink.w);
      const y = rink.y + ((i * 53.7) % rink.h);
      if (Math.hypot(x - centre.x, y - centre.y) > rayon) continue;
      if (Math.floor(state.temps * 6 + i) % 3 === 0) px(g, x, y, 1, 1, '#ffffff');
    }
    g.globalAlpha = 1;
  }
}

/** Bonus « but x2 » : un « 2X » clignote au-dessus de la cage que l'équipe attaque. */
function marqueursDouble(g: CanvasRenderingContext2D, rink: Rink, state: MatchState): void {
  for (const eq of [0, 1] as TeamId[]) {
    if (state.pouvoirs?.[eq].actif !== 'double') continue;
    const x = butAttaque(rink, eq);
    const y = rink.cy - BUT_DEMI - 18 + Math.round(Math.sin(state.temps * 4) * 2);
    texte(g, '2X', x, y, Math.floor(state.temps * 4) % 2 ? C.or : C.blanc, 2, 'c');
  }
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
  /**
   * Équipe pilotée sur cet écran (1 pour le client d'une partie en réseau
   * local) ; null pour un spectateur, qui ne pilote personne.
   */
  eqLocal: TeamId | null = 0,
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
  // un joueur au sol : ombre allongée sous tout son corps
  for (const s of state.patineurs) ellipseOmbre(g, s.x, s.y + 3.5, s.chuteT > 0 ? 17 : 10, s.chuteT > 0 ? 3 : 1.8, 0.28);

  // en match, on repère ses coéquipiers et le receveur que viserait une passe
  if (state.mode === 'match' && ecranUI === 'jeu' && eqLocal !== null) {
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

  for (const gk of state.gardiens) ellipseOmbre(g, gk.x, gk.y + 3.5, 14, 2, 0.28);
  givre(g, rink, state);

  const liste: { y: number; f: () => void }[] = [
    ...state.patineurs.map((s) => ({
      y: s.y,
      f: () => {
        const pilote = eqLocal !== null && s === state.controles[eqLocal];
        dessinePatineur(g, sprites, s, state.temps, pilote, equipes, aspectBonus(state, s), pilote && menaceEchec(state, s) !== null);
      },
    })),
    ...state.gardiens.map((gk) => ({ y: gk.y, f: () => dessineGardien(g, sprites, gk, state.temps, equipes) })),
    { y: p.y - 2, f: () => dessinePalet(g, p, state.temps) },
  ];
  liste.sort((a, b) => a.y - b.y);
  for (const e of liste) e.f();

  marqueursDouble(g, rink, state);
  for (const o of effets.ondes) {
    const u = 1 - o.vie / o.max;
    g.globalAlpha = 1 - u;
    anneau(g, o.x, o.y, 3 + o.r * u, o.c, 1, 2);
    g.globalAlpha = 1;
  }
  dessineParticules(g, effets.particules);
  for (const b of effets.bulles) {
    g.globalAlpha = Math.min(1, b.vie * 3);
    texte(g, b.txt, b.x, b.y, b.c);
    g.globalAlpha = 1;
  }
}
