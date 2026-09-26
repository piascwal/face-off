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

/**
 * Décalage (perpendiculaire à l'axe d'attaque) d'un patineur de rang `rang`
 * autour du rang 0 (toujours au centre, décalage nul) : rang 1 va d'un côté,
 * rang 2 de l'autre, rang 3 plus loin du même côté que rang 1, etc. — une
 * formation qui s'étend proprement quel que soit l'effectif (2, 3 ou 5 par
 * équipe), là où un tableau de décalages fixes ne couvrait que 3 rangs.
 */
export function decalageRang(rang: number, base: number): number {
  if (rang === 0) return 0;
  const idx = rang - 1;
  const multiplicateur = Math.floor(idx / 2) + 1;
  const signe = idx % 2 === 0 ? -1 : 1;
  return base * multiplicateur * signe;
}
