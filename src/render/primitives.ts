export function px(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string): void {
  g.fillStyle = col;
  g.fillRect(Math.round(x), Math.round(y), w, h);
}

export function ligne(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, col: string): void {
  let ix0 = Math.round(x0);
  let iy0 = Math.round(y0);
  const ix1 = Math.round(x1);
  const iy1 = Math.round(y1);
  g.fillStyle = col;
  const dx = Math.abs(ix1 - ix0);
  const sx = ix0 < ix1 ? 1 : -1;
  const dy = -Math.abs(iy1 - iy0);
  const sy = iy0 < iy1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 200; n++) {
    g.fillRect(ix0, iy0, 1, 1);
    if (ix0 === ix1 && iy0 === iy1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      ix0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      iy0 += sy;
    }
  }
}

export function disque(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string): void {
  g.fillStyle = col;
  const icx = Math.round(cx);
  const icy = Math.round(cy);
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.8));
    g.fillRect(icx - w, icy + dy, w * 2 + 1, 1);
  }
}

export function anneau(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string, part = 1, epais = 1): void {
  g.fillStyle = col;
  const icx = Math.round(cx);
  const icy = Math.round(cy);
  const n = Math.ceil(r * 8);
  for (let i = 0; i < n * part; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    for (let k = 0; k < epais; k++) {
      g.fillRect(Math.round(icx + Math.cos(a) * (r - k)), Math.round(icy + Math.sin(a) * (r - k)), 1, 1);
    }
  }
}

export function ellipseOmbre(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, alpha: number): void {
  g.fillStyle = `rgba(20,40,80,${alpha})`;
  const icx = Math.round(cx);
  const icy = Math.round(cy);
  for (let dy = -ry; dy <= ry; dy++) {
    const w = Math.round(rx * Math.sqrt(1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5))));
    g.fillRect(icx - w, icy + dy, w * 2 + 1, 1);
  }
}
