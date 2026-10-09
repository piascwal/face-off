/**
 * Le mode STATS d'un panneau d'équipe : au lieu de l'écusson, le radar des
 * notes, un seul profil à la fois (le patineur normal ou le joueur star).
 * Chaque moitié d'écran (gauche, droite) a le sien : on peut donc comparer
 * deux équipes côte à côte, en solo comme en multijoueur. Tout est dessiné au
 * pixel, avec la police du jeu.
 */
import { STATS_PATINEUR, type NotesEquipe, type NotesPatineur, type StatPatineur } from '@core/stats';
import { texte } from './pixel-font';
import { ligne, px } from './primitives';
import { C } from './theme';

/** Le profil montré par un panneau en mode STATS : un patineur normal, ou le joueur star. */
export interface ModeStats {
  star: boolean;
}

/** L'état des deux panneaux (0 : gauche, 1 : droite) ; null : le panneau montre l'écusson. */
const modes: [ModeStats | null, ModeStats | null] = [null, null];
let dernierEcran = '';

export const modeStats = (cote: 0 | 1): ModeStats | null => modes[cote];
export const statsOuvertes = (): boolean => modes[0] !== null || modes[1] !== null;

/** Ouvre le radar du panneau (ou le referme). */
export function basculeStats(cote: 0 | 1): void {
  modes[cote] = modes[cote] ? null : { star: false };
}

/** Passe du patineur normal au joueur star (et inversement) dans ce panneau. */
export function basculeStar(cote: 0 | 1): void {
  const m = modes[cote];
  if (m) modes[cote] = { star: !m.star };
}

export function fermeStats(): void {
  modes[0] = modes[1] = null;
}

/** À appeler à chaque image : un changement d'écran referme les radars. */
export function suiviEcran(ecran: string): void {
  if (ecran !== dernierEcran) {
    dernierEcran = ecran;
    fermeStats();
  }
}

/** Les sept axes du radar (noms courts : le panneau est étroit). */
export const AXES_RADAR: readonly (readonly [StatPatineur, string])[] = [
  ['vit', 'VITE'],
  ['att', 'ATTA'],
  ['def', 'DEFE'],
  ['frappe', 'FRAP'],
  ['puiss', 'PUIS'],
  ['passe', 'PASS'],
  ['phys', 'PHYS'],
];

/** Les notes du radar commencent à 60 au centre : une note de 70 reste visible. */
const NOTE_CENTRE = 60;
const NOTE_MAX = 100;
export const COULEUR_PATINEUR = '#6fd0ff';
export const COULEUR_STAR = C.or;

/** Le point du radar d'un axe, à une distance `r` du centre (0 en haut, dans le sens des aiguilles d'une montre). */
function point(cx: number, cy: number, r: number, i: number, n: number): [number, number] {
  const a = (i / n) * Math.PI * 2;
  return [cx + Math.sin(a) * r, cy - Math.cos(a) * r];
}

/** Remplit un polygone, ligne de pixels par ligne de pixels. */
function remplitPolygone(g: CanvasRenderingContext2D, pts: [number, number][], couleur: string, alpha: number): void {
  const ys = pts.map((p) => p[1]);
  const y0 = Math.floor(Math.min(...ys));
  const y1 = Math.ceil(Math.max(...ys));
  g.globalAlpha = alpha;
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i]!;
      const [bx, by] = pts[(i + 1) % pts.length]!;
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.round(xs[k]!);
      px(g, xa, y, Math.round(xs[k + 1]!) - xa, 1, couleur);
    }
  }
  g.globalAlpha = 1;
}

/** Une étoile de 7 × 7 pixels. */
export function etoile(g: CanvasRenderingContext2D, x: number, y: number, couleur: string): void {
  const rows = ['0001000', '0001000', '1111111', '0111110', '0011100', '0110110', '1100011'];
  rows.forEach((r, j) => {
    for (let i = 0; i < 7; i++) if (r[i] === '1') px(g, x + i, y + j, 1, 1, couleur);
  });
}

/** Les notes d'un profil : celles de l'équipe, ou celles de son joueur star. */
export const notesDuProfil = (equipe: NotesEquipe, star: boolean): NotesPatineur => (star ? equipe.star : equipe);

/**
 * Dessine le radar centré en (cx, cy), de rayon R : anneaux à 70, 80, 90 et
 * 100, rayons, polygone des notes, puis nom et note de chaque axe.
 */
export function dessineRadar(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, notes: NotesPatineur, star: boolean): void {
  const couleur = star ? COULEUR_STAR : COULEUR_PATINEUR;
  const n = STATS_PATINEUR.length;
  const rayonNote = (note: number) => (R * (Math.max(note, NOTE_CENTRE) - NOTE_CENTRE)) / (NOTE_MAX - NOTE_CENTRE);
  for (const palier of [70, 80, 90, 100]) {
    const r = rayonNote(palier);
    const anneau = AXES_RADAR.map((_, i) => point(cx, cy, r, i, n));
    anneau.forEach((p, i) => {
      const q = anneau[(i + 1) % n]!;
      ligne(g, Math.round(p[0]), Math.round(p[1]), Math.round(q[0]), Math.round(q[1]), palier === 100 ? '#3a4590' : '#262d5c');
    });
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = point(cx, cy, R, i, n);
    ligne(g, Math.round(cx), Math.round(cy), Math.round(x), Math.round(y), '#262d5c');
  }
  const sommets = AXES_RADAR.map(([k], i) => point(cx, cy, rayonNote(notes[k]), i, n).map(Math.round) as [number, number]);
  remplitPolygone(g, sommets, couleur, 0.4);
  sommets.forEach((p, i) => {
    const q = sommets[(i + 1) % n]!;
    ligne(g, p[0], p[1], q[0], q[1], couleur);
  });
  for (const [x, y] of sommets) {
    px(g, x - 1, y - 1, 3, 3, C.contour);
    px(g, x - 1, y - 1, 2, 2, couleur);
  }
  // nom et note de chaque axe, sur une ligne, à l'extérieur du sommet
  AXES_RADAR.forEach(([k, nom], i) => {
    const [x, y] = point(cx, cy, R + 5, i, n);
    const cote = x > cx + 3 ? 'g' : x < cx - 3 ? 'd' : 'c';
    const yy = Math.round(y) - (i === 0 ? 8 : 3);
    const lbl = `${nom} `;
    const largeur = (lbl.length + String(notes[k]).length) * 6;
    const x0 = cote === 'g' ? Math.round(x) : cote === 'd' ? Math.round(x) - largeur : Math.round(x) - Math.round(largeur / 2);
    texte(g, lbl, x0, yy, C.gris, 1, 'g');
    texte(g, String(notes[k]), x0 + lbl.length * 6, yy, couleur, 1, 'g');
  });
}
