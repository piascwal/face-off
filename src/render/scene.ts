import { meilleurReceveur, menaceEchec } from '@core/actions';
import { BUT_DEMI } from '@core/constants';
import { ALERTE_FIN_S, DEF_POUVOIRS, demiCage, effetActif, estGele, estInverse, gardienEndormi, HEROS_FREEZE_S, joueurDore } from '@core/pouvoirs';
import { butAttaque } from '@core/shooting';
import { equipe } from '@core/state-helpers';
import type { MatchState, Rink, Skater, TeamId } from '@core/types';
import { dessineGardien, dessinePalet, dessineParticules, dessinePatineur, TracesGlace, type AspectBonus } from './entities-render';
import { BULLE_GROSSE_VIE, type Bulle, type SystemeEffets } from './effects';
import { anneau, ellipseOmbre, px } from './primitives';
import { dessineCage, dessineLampe } from './rink-render';
import type { BanqueSprites } from './sprites';
import { largeurTexte, texte } from './pixel-font';
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
  // le renfort du surnombre est toujours doré (et semi-transparent)
  const dore = (!!pv.actif && joueurDore(state, s.eq) === s) || s.renfort;
  if (!dore && !gele && !confus) return null;
  let or = dore;
  if (dore && pv.reste < ALERTE_FIN_S) {
    // phase cumulée d'un clignotement qui accélère de 3 à 13 Hz
    const u = ALERTE_FIN_S - pv.reste;
    or = Math.floor((3 * u + 2.5 * u * u) * 2) % 2 === 0;
  }
  return { or, vitesse: dore && effetActif(state, s.eq, 'vitesse'), gele, confus, fantome: s.renfort };
}

/**
 * Freeze : une onde de givre part du joueur doré et recouvre la patinoire,
 * qui reste bleutée tant que le bonus dure.
 */
function givre(g: CanvasRenderingContext2D, rink: Rink, state: MatchState): void {
  for (const eq of [0, 1] as TeamId[]) {
    const pv = state.pouvoirs?.[eq];
    if (!pv?.actif || !effetActif(state, eq, 'freeze')) continue;
    // le freeze du super héros ne dure que ses premières secondes
    const age = DEF_POUVOIRS[pv.actif].duree - pv.reste;
    const reste = pv.actif === 'heros' ? HEROS_FREEZE_S - age : pv.reste;
    const fin = Math.min(1, reste / 0.4);
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

/** Gardien endormi : des « Z » qui montent en se balançant au-dessus de sa tête. */
function sommeil(g: CanvasRenderingContext2D, state: MatchState): void {
  for (const gk of state.gardiens) {
    if (!gardienEndormi(state, gk.eq)) continue;
    for (let i = 0; i < 3; i++) {
      const u = (state.temps * 0.7 + i / 3) % 1;
      const x = gk.x + (gk.eq === 0 ? 4 : -4) + Math.sin(u * 6 + i) * 3 + u * 8 * (gk.eq === 0 ? 1 : -1);
      const y = gk.y - 22 - u * 18;
      g.globalAlpha = Math.min(1, (1 - u) * 2.5);
      texte(g, 'Z', x, y, '#bfe4ff', u > 0.5 ? 2 : 1, 'c');
    }
    g.globalAlpha = 1;
  }
}

/** Calque du blackout (noir percé par les projecteurs), gardé d'une image à l'autre. */
let calqueNoir: HTMLCanvasElement | null = null;

/**
 * Blackout : les lumières de l'aréna s'éteignent (en deux clignotements),
 * un projecteur suit le joueur doré. L'équipe qui l'a déclenché y voit encore
 * assez ; l'adversaire est dans le noir, avec juste une petite lueur autour du
 * joueur qu'il pilote. Un spectateur voit entre les deux.
 */
function blackout(g: CanvasRenderingContext2D, rink: Rink, state: MatchState, eqLocal: TeamId | null): void {
  for (const eq of [0, 1] as TeamId[]) {
    const pv = state.pouvoirs?.[eq];
    if (pv?.actif !== 'blackout') continue;
    const age = DEF_POUVOIRS.blackout.duree - pv.reste;
    // les lumières vacillent avant de s'éteindre, puis reviennent à la fin
    if (age < 0.35 && Math.floor(age * 12) % 2 === 1) continue;
    const force = Math.min(1, age / 0.35, pv.reste / 0.6);
    const noir = eqLocal === null ? 0.72 : eqLocal === eq ? 0.5 : 0.9;
    const W = Math.ceil(rink.x * 2 + rink.w);
    const H = Math.ceil(rink.y * 2 + rink.h);
    calqueNoir ??= document.createElement('canvas');
    const c = calqueNoir;
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const k = c.getContext('2d')!;
    k.globalCompositeOperation = 'source-over';
    k.clearRect(0, 0, W, H);
    k.fillStyle = '#04050c';
    k.fillRect(0, 0, W, H);
    // trous : paliers nets (comme des pixels) du plus large au plus serré
    k.globalCompositeOperation = 'destination-out';
    const trou = (x: number, y: number, rayons: number[]) =>
      rayons.forEach((r, i) => {
        k.globalAlpha = (i + 1) / rayons.length;
        k.beginPath();
        k.arc(x, y, r, 0, Math.PI * 2);
        k.fill();
      });
    const spot = joueurDore(state, eq);
    if (spot) trou(spot.x, spot.y - 8, [30, 25, 21]);
    const moi = eqLocal !== null && eqLocal !== eq ? state.controles[eqLocal] : null;
    if (moi) trou(moi.x, moi.y - 8, [14, 10]);
    k.globalAlpha = 1;
    g.globalAlpha = noir * force;
    g.drawImage(c, 0, 0);
    g.globalAlpha = 1;
    if (spot) {
      // le faisceau du projecteur sur la glace
      g.globalAlpha = 0.18 * force;
      g.fillStyle = '#fff3b0';
      g.beginPath();
      g.ellipse(spot.x, spot.y + 2, 18, 7, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
  }
}

/** Bonus « but x2 » : un « 2X » clignote au-dessus de la cage que l'équipe attaque. */
function marqueursDouble(g: CanvasRenderingContext2D, rink: Rink, state: MatchState): void {
  for (const eq of [0, 1] as TeamId[]) {
    if (state.pouvoirs?.[eq].actif !== 'double') continue;
    const x = butAttaque(rink, eq);
    const y = rink.cy - demiCage(state, eq === 0 ? 1 : 0) - 18 + Math.round(Math.sin(state.temps * 4) * 2);
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
  for (const eq of [0, 1] as TeamId[]) {
    const m = demiCage(state, eq);
    dessineCage(g, rink, eq, m);
    // cage géante ou mini cage : l'ouverture brille en or, pour qu'on la repère
    if (m !== BUT_DEMI) {
      const gx = eq === 0 ? rink.butG : rink.butD;
      g.globalAlpha = 0.45 + 0.4 * Math.sin(state.temps * 8);
      px(g, gx - 1, rink.cy - m, 3, 2 * m + 1, C.or);
      g.globalAlpha = 1;
    }
  }

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
  sommeil(g, state);
  blackout(g, rink, state, eqLocal);
  for (const o of effets.ondes) {
    const u = 1 - o.vie / o.max;
    g.globalAlpha = 1 - u;
    anneau(g, o.x, o.y, 3 + o.r * u, o.c, 1, 2);
    g.globalAlpha = 1;
  }
  dessineParticules(g, effets.particules);
  for (const b of effets.bulles) {
    g.globalAlpha = Math.min(1, b.vie * 3);
    if (b.gros) bulleBonus(g, b);
    else texte(g, b.txt, b.x, b.y, b.c);
    g.globalAlpha = 1;
  }
}

/**
 * Le « BONUS » doré de la 4e passe : il jaillit en très grand puis se pose
 * (taille 3, puis 2), sur fond d'or qui scintille, avec un reflet blanc qui
 * le traverse.
 */
function bulleBonus(g: CanvasRenderingContext2D, b: Bulle): void {
  const age = BULLE_GROSSE_VIE - b.vie;
  const e = age < 0.12 ? 3 : 2;
  const y = Math.round(b.y - (e === 3 ? 6 : 4));
  // scintillement : deux ors alternent au début, puis l'or clair reste
  const c = age < 0.5 && Math.floor(age * 14) % 2 ? '#ffb020' : '#ffd35c';
  texte(g, b.txt, b.x + 1, y + 1, '#a86a00', e, 'c', C.contour);
  texte(g, b.txt, b.x, y, c, e, 'c', C.contour);
  // reflet : une bande blanche qui balaie le mot une fois
  const u = (age - 0.15) / 0.35;
  if (u > 0 && u < 1) {
    const w = largeurTexte(b.txt, e);
    const rx = Math.round(b.x - w / 2 + u * w);
    g.save();
    g.globalAlpha *= 0.75;
    g.fillStyle = '#ffffff';
    g.fillRect(rx, y, 2, 7 * e);
    g.restore();
  }
}
