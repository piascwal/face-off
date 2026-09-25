export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export const angDiff = (a: number, b: number): number => {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

export const alea = (a: number, b: number): number => a + Math.random() * (b - a);

export function pointSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby || 1), 0, 1);
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}
