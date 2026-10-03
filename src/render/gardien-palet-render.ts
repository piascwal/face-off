/** Dessin des gardiens et du palet. */

import type { Goalie, Puck } from '@core/types';
import type { BanqueSprites } from './sprites';
import type { EquipeVisuelle } from './team-visuals';

export function dessineGardien(
  g: CanvasRenderingContext2D,
  sprites: BanqueSprites,
  gk: Goalie,
  temps: number,
  equipes: [EquipeVisuelle, EquipeVisuelle],
): void {
  const M = sprites.meta.gardien;
  const e = M.echelle;
  const gauche = gk.eq === 1;
  const sprite = sprites.spriteGardien(equipes[gk.eq].id, gauche);
  const ancre = M.pied.x + M.decalage;
  const piedX = gauche ? M.tileW - ancre : ancre;
  const bx = gk.x - piedX * e + Math.sin(temps * 60) * gk.secoue;
  // pieds un peu plus bas que ceux des patineurs : les jambières couvrent alors
  // toute la zone où le gardien arrête vraiment le palet
  const by = gk.y + 6 - M.pied.y * e;
  if (sprite) g.drawImage(sprite.img, sprite.rect.sx, sprite.rect.sy, sprite.rect.sw, sprite.rect.sh, bx, by, M.tileW * e, M.tileH * e);
}

/**
 * Palet, avec une traînée quand il file après une passe ou un tir — comme
 * l'élan des patineurs : des « fantômes » du palet sur ses dernières
 * positions et deux lignes de vitesse. Bleu glacier pour une passe, orange
 * pour un tir appuyé.
 */
export function dessinePalet(g: CanvasRenderingContext2D, p: Puck, temps = 0): void {
  const v = Math.hypot(p.vx, p.vy);
  // tir surpuissant : longue traînée de feu, du jaune au rouge, qui crépite
  if (!p.porteur && p.lueur === 3 && v > 40) {
    const ux = p.vx / v;
    const uy = p.vy / v;
    const L = Math.min(56, v * 0.09);
    // couleurs franches (pas de fondu additif : sur la glace claire, tout virerait au blanc)
    for (let k = 1; k <= L; k++) {
      const u = k / L;
      g.globalAlpha = 0.95 * (1 - u * 0.8);
      g.fillStyle = u < 0.15 ? '#ffd23a' : u < 0.45 ? '#ff8a1a' : '#e3321e';
      const ep = u < 0.5 ? 4 : 3;
      const tremble = Math.round(Math.sin(temps * 60 + k) * u * 2);
      g.fillRect(Math.round(p.x - ux * k - uy * tremble) - ep / 2, Math.round(p.y - uy * k + ux * tremble) - ep / 2, ep, ep);
    }
    g.globalAlpha = 1;
  } else if (!p.porteur && p.lueur === 2 && v > 40) {
    // super passe : une traînée verte qui scintille, le palet file droit sur son receveur
    const ux = p.vx / v;
    const uy = p.vy / v;
    const L = Math.min(40, v * 0.12);
    for (let k = 1; k <= L; k++) {
      const u = k / L;
      g.globalAlpha = 0.9 * (1 - u * 0.85);
      g.fillStyle = u < 0.3 ? '#eaffd0' : u < 0.6 ? '#5ee08a' : '#1fae5a';
      const ep = u < 0.5 ? 4 : 3;
      const onde = Math.round(Math.sin(temps * 30 - k * 0.6) * u * 1.5);
      g.fillRect(Math.round(p.x - ux * k - uy * onde) - ep / 2, Math.round(p.y - uy * k + ux * onde) - ep / 2, ep, ep);
    }
    g.globalAlpha = 1;
  } else if (!p.porteur && v > 120) {
    const tir = v > 330 || (p.tireur !== null && v > 200);
    const col = tir ? '#ff7a1a' : '#1fa8e8';
    const n = p.trace.length;
    // fantômes du palet sur ses dernières positions, comme l'élan des patineurs
    for (let i = 0; i < n - 1; i++) {
      const t = p.trace[i]!;
      g.globalAlpha = ((i + 1) / n) * 0.5;
      g.fillStyle = '#0c0e16';
      g.fillRect(Math.round(t.x) - 2, Math.round(t.y) - 1, 4, 2);
    }
    // traînée de couleur (2 px d'épaisseur) qui s'estompe derrière le palet
    const ux = p.vx / v;
    const uy = p.vy / v;
    const L = Math.min(tir ? 30 : 22, v * 0.07);
    g.fillStyle = col;
    for (let k = 2; k <= L; k++) {
      g.globalAlpha = 0.85 * (1 - k / L);
      const x = Math.round(p.x - ux * k);
      const y = Math.round(p.y - uy * k);
      g.fillRect(x - 1, y - 1, 2, 2);
    }
    if (tir) {
      // tir : deux fines lignes de vitesse de part et d'autre
      for (const cote of [-3, 3]) {
        for (let k = 4; k <= L * 0.7; k++) {
          g.globalAlpha = 0.6 * (1 - k / (L * 0.7));
          g.fillRect(Math.round(p.x - ux * k - uy * cote), Math.round(p.y - uy * k + ux * cote), 1, 1);
        }
      }
    }
    g.globalAlpha = 1;
  }
  const x = Math.round(p.x) - 2;
  const y = Math.round(p.y) - 1;
  g.fillStyle = 'rgba(20,40,80,0.35)';
  g.fillRect(x, y + 2, 4, 1);
  g.fillStyle = '#0c0e16';
  g.fillRect(x, y, 4, 2);
  g.fillStyle = '#4a5068';
  g.fillRect(x + 1, y, 2, 1);
}
