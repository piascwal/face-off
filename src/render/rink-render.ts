import { BUT_DEMI, BUT_PROF } from '@core/constants';
import { distBande } from '@core/rink';
import type { Rink, TeamId } from '@core/types';
import { disque } from './primitives';
import { C, EQUIPES } from './theme';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const TEINTES_GLACE = ['#93b8d6', '#afd0e9', '#c9e4f5', '#e1f2fc', '#f4fbff', '#ffffff'].map(hex);

function marquage(rink: Rink, x: number, y: number): string | null {
  const { cx, cy } = rink;
  const fx = x + 0.5;
  const fy = y + 0.5;
  // zones de but (demi-disques devant chaque cage)
  for (const [gx, dir] of [
    [rink.butG, 1],
    [rink.butD, -1],
  ] as const) {
    const dx = (fx - gx) * dir;
    const dy = fy - cy;
    if (dx >= 0) {
      const rr = Math.hypot(dx, dy);
      if (rr < 17 && rr >= 16) return C.rouge;
      if (rr < 16) return C.zone;
    }
  }
  if (x === rink.butG || x === rink.butD) return C.rouge;
  if (Math.abs(fx - rink.cx) <= 1) return Math.floor(fy / 3) % 3 === 0 ? '#f3c7cf' : C.rouge;
  if (x === rink.bleueG || x === rink.bleueG + 1 || x === rink.bleueD || x === rink.bleueD - 1) return C.bleu;
  const dc = Math.hypot(fx - cx, fy - cy);
  if (Math.abs(dc - 19) < 0.55) return C.bleu;
  if (dc < 2) return C.bleu;
  const oy = Math.round(rink.h * 0.27);
  for (const gx of [rink.butG + 40, rink.butD - 40]) {
    for (const sy of [-1, 1]) {
      const d = Math.hypot(fx - gx, fy - (cy + sy * oy));
      if (Math.abs(d - 15) < 0.55 && d > 0) return C.rouge;
      if (d < 1.9) return C.rouge;
      // petits traits de mise au jeu
      if (Math.abs(fy - (cy + sy * oy)) > 2 && Math.abs(fy - (cy + sy * oy)) < 4.5 && Math.abs(Math.abs(fx - gx) - 3.5) < 0.6) return C.rouge;
    }
  }
  for (const gx of [rink.bleueG + 12, rink.bleueD - 12]) {
    for (const sy of [-1, 1]) if (Math.hypot(fx - gx, fy - (cy + sy * oy)) < 1.9) return C.rouge;
  }
  return null;
}

export function construitGlace(rink: Rink, W: number, H: number): HTMLCanvasElement {
  const glace = document.createElement('canvas');
  glace.width = W;
  glace.height = H;
  const gc = glace.getContext('2d')!;
  const img = gc.createImageData(W, H);
  const d = img.data;
  const lumieres: [number, number][] = [];
  for (let i = 0; i < 4; i++) lumieres.push([rink.x + rink.w * (0.16 + i * 0.227), rink.y + rink.h * 0.32]);
  const pose = (i: number, c: [number, number, number], a = 255) => {
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = a;
  };
  const PL = hex(C.planche);
  const PLO = hex(C.plancheOmbre);
  const PLI = hex(C.plinthe);
  const CT = hex(C.contour);
  const PUB = [hex('#2b4c9b'), hex('#b9314d'), hex('#1c8f7a'), hex('#e0a526')];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const db = distBande(rink, x + 0.5, y + 0.5);
      if (db > 6.5) continue;
      if (db > 0) {
        if (db <= 1.2) pose(i, PLI);
        else if (db <= 5) {
          // bande blanche, avec des panneaux publicitaires sur les longs côtés
          const droit = x > rink.x + rink.r && x < rink.x + rink.w - rink.r;
          if (droit && db > 2 && db <= 4.2 && (x - rink.x) % 44 > 3) {
            const k = Math.floor((x - rink.x) / 44) + (y < rink.cy ? 0 : 2);
            pose(i, PUB[k % PUB.length]!);
          } else pose(i, y < rink.cy || db < 3 ? PL : PLO);
        } else pose(i, CT);
        continue;
      }
      const m = marquage(rink, x, y);
      if (m) {
        const c = hex(m);
        const eclat = BAYER[(y & 3) * 4 + (x & 3)]! < 3 ? 22 : 0;
        pose(i, [Math.min(255, c[0] + eclat), Math.min(255, c[1] + eclat), Math.min(255, c[2] + eclat)]);
        continue;
      }
      let t = 0.5 + 0.18 * (1 - (y - rink.y) / rink.h);
      for (const [lx, ly] of lumieres) {
        const ex = (x - lx) / 26;
        const ey = (y - ly) / 11;
        t += 0.28 * Math.exp(-(ex * ex + ey * ey));
      }
      if (db > -7) t -= (1 + db / 7) * 0.22;
      const hsh = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      t += (hsh - Math.floor(hsh) - 0.5) * 0.07;
      const v = Math.max(0, Math.min(0.999, t)) * (TEINTES_GLACE.length - 1);
      const k = Math.floor(v);
      const seuil = (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
      pose(i, TEINTES_GLACE[Math.min(TEINTES_GLACE.length - 1, v - k > seuil ? k + 1 : k)]!);
    }
  }
  gc.putImageData(img, 0, 0);
  return glace;
}

/** Les tribunes : deux images légèrement différentes, alternées quand la foule saute. */
export function construitFoule(rink: Rink, W: number, H: number): [HTMLCanvasElement, HTMLCanvasElement] {
  const couleurs = [EQUIPES[0].maillot, EQUIPES[0].fonce, EQUIPES[1].maillot, EQUIPES[1].fonce, '#e8e8f0', '#f2c14e', '#5b6b8c', '#3b3f5c'];
  const peaux = ['#f1c7a0', '#d9a07a', '#a86b4a', '#7a4a33', '#f6d7bd'];
  const gens: { x: number; y: number; c: string; p: string; s: number }[] = [];
  for (let y = 1; y < H; y += 5) {
    for (let x = 1 + ((y / 5) & 1) * 2; x < W; x += 4) {
      if (distBande(rink, x + 1, y + 2) < 9) continue;
      if (Math.random() < 0.12) continue;
      gens.push({
        x: x + ((Math.random() * 2) | 0) - 1,
        y,
        c: couleurs[(Math.random() * couleurs.length) | 0]!,
        p: peaux[(Math.random() * peaux.length) | 0]!,
        s: Math.random(),
      });
    }
  }
  const foule: [HTMLCanvasElement, HTMLCanvasElement] = [document.createElement('canvas'), document.createElement('canvas')];
  for (let f = 0; f < 2; f++) {
    const c = foule[f]!;
    c.width = W;
    c.height = H;
    const x = c.getContext('2d')!;
    x.fillStyle = '#0d1126';
    x.fillRect(0, 0, W, H);
    // gradins
    x.fillStyle = '#141a36';
    for (let y = 0; y < H; y += 5) x.fillRect(0, y + 4, W, 1);
    for (const p of gens) {
      const saute = f === 1 && p.s > 0.35 ? -1 : 0;
      x.fillStyle = p.c;
      x.fillRect(p.x, p.y + 2 + saute, 3, 3);
      x.fillStyle = p.p;
      x.fillRect(p.x + 1, p.y + saute, 2, 2);
      if (f === 1 && p.s > 0.8) {
        x.fillStyle = p.p;
        x.fillRect(p.x - 1, p.y - 1 + saute, 1, 2);
        x.fillRect(p.x + 3, p.y - 1 + saute, 1, 2);
      }
    }
    // pénombre de l'aréna
    x.fillStyle = 'rgba(6,8,22,0.42)';
    x.fillRect(0, 0, W, H);
  }
  return foule;
}

export function dessineCage(g: CanvasRenderingContext2D, rink: Rink, eq: TeamId): void {
  const gx = eq === 0 ? rink.butG : rink.butD;
  const dir = eq === 0 ? 1 : -1;
  const m = BUT_DEMI;
  const cy = rink.cy;
  const h = 6;
  const x0 = Math.min(gx, gx - dir * BUT_PROF);
  const x1 = Math.max(gx, gx - dir * BUT_PROF);
  // ombre
  g.fillStyle = 'rgba(30,50,90,0.25)';
  g.fillRect(x0, cy - m + 1, x1 - x0 + 1, 2 * m);
  // filet (motif en damier)
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let y = cy - m - h; y <= cy + m; y++) {
    for (let x = x0; x <= x1; x++) {
      if (((x + y) & 1) === 0) g.fillRect(x, y, 1, 1);
    }
  }
  // armature arrière
  g.fillStyle = '#c9d2e3';
  g.fillRect(gx - dir * BUT_PROF, cy - m - h + 2, 1, 2 * m + h - 2);
  // poteaux et barre transversale rouges
  g.fillStyle = C.rouge;
  g.fillRect(gx, cy - m - h, 1, h + 1);
  g.fillRect(gx, cy + m - h, 1, h + 1);
  g.fillRect(gx, cy - m - h, 1, 2 * m + 1);
  g.fillStyle = '#ff7a8c';
  g.fillRect(gx, cy - m - h, 1, 1);
  // haut du filet (lien entre barre et armature)
  g.fillStyle = '#e8edf6';
  for (let x = x0; x <= x1; x++) {
    g.fillRect(x, cy - m - h, 1, 1);
    g.fillRect(x, cy + m - h, 1, 1);
  }
}

export function dessineLampe(g: CanvasRenderingContext2D, rink: Rink, eq: TeamId, niveau: number, temps: number): void {
  const x = eq === 0 ? rink.x - 4 : rink.x + rink.w + 1;
  const y = rink.cy - 22;
  g.fillStyle = niveau > 0 && (Math.floor(temps * 8) & 1) ? '#ff3b4e' : '#5a1522';
  g.fillRect(Math.round(x), Math.round(y), 3, 4);
  if (niveau > 0) {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.35 * niveau;
    disque(g, x + 1, y + 2, 9, '#ff2a40');
    g.globalAlpha = 0.25 * niveau;
    disque(g, x + 1, y + 2, 18, '#ff2a40');
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}
