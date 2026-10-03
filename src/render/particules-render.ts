/** Traces de patins sur la glace et particules d'effets. */

import type { Skater } from '@core/types';

/** Traînées de patins qui s'estompent lentement sur la glace. */
export class TracesGlace {
  private canvas = document.createElement('canvas');

  reinitialise(W: number, H: number): void {
    this.canvas.width = W;
    this.canvas.height = H;
  }

  dessine(g: CanvasRenderingContext2D, patineurs: Skater[], temps: number): void {
    const rc = this.canvas.getContext('2d')!;
    if (Math.floor(temps * 2) !== Math.floor((temps - 1 / 60) * 2)) {
      rc.globalCompositeOperation = 'destination-out';
      rc.fillStyle = 'rgba(0,0,0,0.08)';
      rc.fillRect(0, 0, this.canvas.width, this.canvas.height);
      rc.globalCompositeOperation = 'source-over';
    }
    rc.fillStyle = 'rgba(120,160,195,0.22)';
    for (const s of patineurs) {
      if (Math.hypot(s.vx, s.vy) < 30) continue;
      const pied = Math.floor(s.anim / 8) & 1;
      rc.fillRect(Math.round(s.x) + (pied ? -2 : 1), Math.round(s.y) + 3, 1, 1);
    }
    g.drawImage(this.canvas, 0, 0);
  }
}

export function dessineParticules(g: CanvasRenderingContext2D, particules: { x: number; y: number; vie: number; max: number; c: string; t: number; lum?: boolean }[]): void {
  for (const p of particules) {
    const a = Math.min(1, p.vie / (p.max * 0.5));
    if (p.lum) g.globalCompositeOperation = 'lighter';
    g.globalAlpha = a;
    g.fillStyle = p.c;
    g.fillRect(Math.round(p.x), Math.round(p.y), p.t, p.t);
    if (p.lum) g.globalCompositeOperation = 'source-over';
  }
  g.globalAlpha = 1;
}
