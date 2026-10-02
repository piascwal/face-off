import { LOUPE_IMPACT, LOUPE_REBOND, LOUPE_S } from '@core/pouvoirs';
import type { MatchState } from '@core/types';
import { texte } from './pixel-font';
import { C } from './theme';

/**
 * Bonus « loupé complet » : le tir adverse s'envole. Le palet part de la
 * crosse en cloche (son ombre reste sur la glace), claque contre le bord de
 * l'écran le plus proche, puis revient droit sur la caméra en grossissant et
 * brise la vitre, qui se fissure en étoile ; des éclats tombent, « LOUPÉ ! »
 * s'affiche, puis l'image s'efface sur l'engagement. Tout se déduit de la
 * phase `loupe`, de son temps restant et de la position du palet : chaque
 * écran (Wi-Fi, spectateur) joue la même scène.
 */
export function dessineLoupe(g: CanvasRenderingContext2D, W: number, H: number, state: MatchState): void {
  if (state.phase !== 'loupe') return;
  const age = LOUPE_S - state.phaseT;
  const p = state.palet;
  const cx = W / 2;
  const cy = H / 2;
  // le bord de l'écran visé : celui (haut ou bas) le plus proche du tireur, un peu vers le centre
  const bx = p.x + (cx - p.x) * 0.35;
  const by = p.y < cy ? 6 : H - 6;
  if (age < LOUPE_REBOND) {
    // aller : une cloche, l'ombre glisse sur la glace sous le palet
    const u = age / LOUPE_REBOND;
    const sx = p.x + (bx - p.x) * u;
    const sy = p.y + (by - p.y) * u;
    const h = Math.sin(u * Math.PI * 0.85) * 26 + u * 6;
    ombre(g, sx, sy, 4 + h * 0.05, 1 - u * 0.4);
    for (let i = 3; i >= 1; i--) {
      const v = Math.max(0, u - i * 0.07);
      const hv = Math.sin(v * Math.PI * 0.85) * 26 + v * 6;
      g.globalAlpha = 0.15 * (4 - i);
      palet(g, p.x + (bx - p.x) * v, p.y + (by - p.y) * v - hv, 4 + hv * 0.08, age * 2);
    }
    g.globalAlpha = 1;
    palet(g, sx, sy - h, 4 + h * 0.08, age * 2);
    return;
  }
  if (age < LOUPE_IMPACT) {
    const t0 = age - LOUPE_REBOND;
    // le choc contre le bord : une étoile blanche
    if (t0 < 0.12) {
      g.globalAlpha = 1 - t0 / 0.12;
      etoile(g, bx, by, 10 + t0 * 120);
      g.globalAlpha = 1;
    }
    // retour : il revient vers le centre et grossit très vite, son ombre reste en bas et s'efface
    const u = t0 / (LOUPE_IMPACT - LOUPE_REBOND);
    const k = u * u;
    const depart = by;
    const x = bx + (cx - bx) * k;
    const y = depart + (cy - depart) * k;
    const r = 6 + 56 * k * k;
    ombre(g, bx + (cx - bx) * u * 0.5, by + (by < cy ? 40 : -40) + (cy - by) * u * 0.4, 5 + r * 0.25, 0.5 * (1 - u));
    for (let i = 3; i >= 1; i--) {
      const ku = Math.max(0, u - i * 0.05) ** 2;
      g.globalAlpha = 0.16 * (4 - i);
      palet(g, bx + (cx - bx) * ku, depart + (cy - depart) * ku, 6 + 56 * ku * ku, age * 3);
    }
    g.globalAlpha = 1;
    palet(g, x, y, r, age * 3);
    return;
  }
  const t = age - LOUPE_IMPACT;
  const fin = Math.min(1, state.phaseT / 0.35);
  // éclair blanc de l'impact
  if (t < 0.12) {
    g.fillStyle = `rgba(255,255,255,${0.8 * (1 - t / 0.12)})`;
    g.fillRect(0, 0, W, H);
  }
  g.globalAlpha = fin;
  // voile sombre derrière la vitre brisée
  g.fillStyle = 'rgba(5,6,15,0.25)';
  g.fillRect(0, 0, W, H);
  fissures(g, cx, cy, W, H);
  // le palet reste un instant collé dans la vitre, puis glisse vers le bas
  const chute = Math.max(0, t - 0.25);
  palet(g, cx, cy + chute * chute * 260, 62, 0);
  eclats(g, cx, cy, t);
  const pop = t < 0.1 ? 3 : 2;
  texte(g, 'LOUPE !', cx, cy - 72, Math.floor(t * 8) % 2 ? C.blanc : '#ff5a4e', pop, 'c');
  g.globalAlpha = 1;
}

/** L'ombre du palet en l'air, sur la glace. */
function ombre(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number): void {
  if (a <= 0) return;
  g.fillStyle = `rgba(10,16,40,${0.35 * a})`;
  g.beginPath();
  g.ellipse(x, y + 2, r, r * 0.4, 0, 0, Math.PI * 2);
  g.fill();
}

/** Étoile de choc (le palet contre le bord de l'écran). */
function etoile(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.moveTo(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3);
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.stroke();
}

/**
 * Un palet vu en trois quarts : la face du dessus (disque noir, reflet), et
 * sa tranche bien épaisse dessous ; il tournoie un peu en volant.
 */
function palet(g: CanvasRenderingContext2D, x: number, y: number, r: number, tour: number): void {
  const ry = r * (0.62 + 0.12 * Math.sin(tour * 9));
  const epais = r * 0.42;
  // la tranche : un cylindre entre la face du dessus et celle du dessous
  g.fillStyle = '#05060c';
  g.beginPath();
  g.ellipse(x, y + epais, r, ry, 0, 0, Math.PI);
  g.lineTo(x - r, y);
  g.ellipse(x, y, r, ry, 0, Math.PI, 0, true);
  g.closePath();
  g.fill();
  // stries de la tranche
  g.strokeStyle = 'rgba(70,76,96,0.8)';
  g.lineWidth = Math.max(1, r * 0.04);
  g.beginPath();
  g.ellipse(x, y + epais * 0.5, r * 0.995, ry, 0, 0.15, Math.PI - 0.15);
  g.stroke();
  // la face du dessus
  g.fillStyle = '#2a2e3e';
  g.beginPath();
  g.ellipse(x, y, r, ry, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#11131c';
  g.beginPath();
  g.ellipse(x, y, r * 0.86, ry * 0.86, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(200,210,235,0.35)';
  g.beginPath();
  g.ellipse(x - r * 0.3, y - ry * 0.4, r * 0.35, ry * 0.18, -0.2, 0, Math.PI * 2);
  g.fill();
}

/** Petit générateur pseudo-aléatoire : la même vitre brisée à chaque fois. */
function hasard(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fissures en étoile depuis l'impact, et des cercles brisés autour. */
function fissures(g: CanvasRenderingContext2D, cx: number, cy: number, W: number, H: number): void {
  const r = hasard(11);
  const n = 14;
  const portee = Math.hypot(W, H);
  g.lineCap = 'square';
  const rayons: { a: number; pts: [number, number][] }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.35;
    const pts: [number, number][] = [[cx, cy]];
    let d = 0;
    let ang = a;
    while (d < portee) {
      d += 14 + r() * 26;
      ang += (r() - 0.5) * 0.35;
      pts.push([cx + Math.cos(ang) * d, cy + Math.sin(ang) * d]);
    }
    rayons.push({ a, pts });
  }
  const trait = (pts: [number, number][], couleur: string, epais: number) => {
    g.strokeStyle = couleur;
    g.lineWidth = epais;
    g.beginPath();
    g.moveTo(pts[0]![0], pts[0]![1]);
    for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
    g.stroke();
  };
  for (const { pts } of rayons) trait(pts, 'rgba(10,14,30,0.55)', 2.2);
  for (const { pts } of rayons) trait(pts, 'rgba(235,245,255,0.95)', 1);
  // anneaux : segments entre rayons voisins, à quelques distances de l'impact
  for (const k of [1, 2, 4]) {
    for (let i = 0; i < n; i++) {
      if (r() < 0.25) continue;
      const a = rayons[i]!.pts[Math.min(k, rayons[i]!.pts.length - 1)]!;
      const b = rayons[(i + 1) % n]!.pts[Math.min(k, rayons[(i + 1) % n]!.pts.length - 1)]!;
      trait([a, b], 'rgba(235,245,255,0.8)', 1);
    }
  }
  // l'étoile blanche au point d'impact
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.arc(cx, cy, 6, 0, Math.PI * 2);
  g.fill();
}

/** Éclats de verre qui tombent en tournoyant depuis l'impact. */
function eclats(g: CanvasRenderingContext2D, cx: number, cy: number, t: number): void {
  const r = hasard(5);
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2;
    const v = 40 + r() * 90;
    const x = cx + Math.cos(a) * v * t;
    const y = cy + Math.sin(a) * v * t + 140 * t * t;
    const s = 2 + r() * 4;
    const rot = t * (4 + r() * 6);
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = i % 3 ? 'rgba(220,240,255,0.85)' : 'rgba(150,200,235,0.85)';
    g.beginPath();
    g.moveTo(-s, -s * 0.6);
    g.lineTo(s, -s * 0.2);
    g.lineTo(-s * 0.2, s);
    g.closePath();
    g.fill();
    g.restore();
  }
}
