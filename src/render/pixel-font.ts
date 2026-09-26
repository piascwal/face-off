import { C } from './theme';

const GLYPHES_SRC: Record<string, string> = {
  A: '01110 10001 10001 11111 10001 10001 10001',
  B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111',
  F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111',
  H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110',
  J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001',
  L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 10001 11001 10101 10011 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101',
  R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110',
  T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010',
  X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100',
  Z: '11111 00001 00010 00100 01000 10000 11111',
  É: '00010 00100 11111 10000 11110 10000 11111',
  È: '01000 00100 11111 10000 11110 10000 11111',
  '0': '01110 10001 10011 10101 11001 10001 01110',
  '1': '00100 01100 00100 00100 00100 00100 01110',
  '2': '01110 10001 00001 00010 00100 01000 11111',
  '3': '11111 00010 00100 00010 00001 10001 01110',
  '4': '00010 00110 01010 10010 11111 00010 00010',
  '5': '11111 10000 11110 00001 00001 10001 01110',
  '6': '00110 01000 10000 11110 10001 10001 01110',
  '7': '11111 00001 00010 00100 01000 01000 01000',
  '8': '01110 10001 10001 01110 10001 10001 01110',
  '9': '01110 10001 10001 01111 00001 00010 01100',
  ':': '00000 01100 01100 00000 01100 01100 00000',
  '!': '00100 00100 00100 00100 00100 00000 00100',
  '?': '01110 10001 00001 00010 00100 00000 00100',
  '.': '00000 00000 00000 00000 00000 01100 01100',
  '-': '00000 00000 00000 11111 00000 00000 00000',
  '+': '00000 00100 00100 11111 00100 00100 00000',
  '/': '00000 00001 00010 00100 01000 10000 00000',
  "'": '00100 00100 01000 00000 00000 00000 00000',
  '<': '00010 00100 01000 10000 01000 00100 00010',
  '>': '01000 00100 00010 00001 00010 00100 01000',
  '|': '00000 11011 11011 11011 11011 11011 00000',
  '%': '11001 11010 00010 00100 01000 01011 10011',
};

const GLYPHES: Record<string, string[]> = {};
for (const k in GLYPHES_SRC) GLYPHES[k] = GLYPHES_SRC[k]!.split(' ');

const cacheTexte = new Map<string, HTMLCanvasElement>();
export const largeurTexte = (s: string, e = 1): number => (s.length ? s.length * 6 - 1 : 0) * e;

/** Rend un texte (avec contour sombre d'un pixel) dans un petit canvas mis en cache. */
function texteCanvas(s: string, couleur: string, e: number, contour: string | null): HTMLCanvasElement {
  const cle = `${s}|${couleur}|${e}|${contour}`;
  const existant = cacheTexte.get(cle);
  if (existant) return existant;
  if (cacheTexte.size > 400) cacheTexte.clear();
  const lw = largeurTexte(s, e);
  const lh = 7 * e;
  const c = document.createElement('canvas');
  c.width = lw + 2 * e + 2;
  c.height = lh + 2 * e + 3;
  const x = c.getContext('2d')!;
  const trace = (ox: number, oy: number, col: string) => {
    x.fillStyle = col;
    for (let i = 0; i < s.length; i++) {
      const gl = GLYPHES[s[i]!];
      if (!gl) continue;
      for (let r = 0; r < 7; r++) {
        for (let q = 0; q < 5; q++) {
          if (gl[r]![q] === '1') x.fillRect(ox + (i * 6 + q) * e, oy + r * e, e, e);
        }
      }
    }
  };
  if (contour) {
    const o = Math.max(1, e >> 1);
    trace(e + 1, e + 1 + o + 1, contour); // ombre portée
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
    ]) {
      trace(e + 1 + dx! * o, e + 1 + dy! * o, contour);
    }
  }
  trace(e + 1, e + 1, couleur);
  cacheTexte.set(cle, c);
  return c;
}

export function texte(
  g: CanvasRenderingContext2D,
  s: string | number,
  x: number,
  y: number,
  couleur = C.blanc,
  e = 1,
  align: 'g' | 'c' | 'd' = 'c',
  contour: string | null = C.contour,
): void {
  const su = String(s).toUpperCase();
  const c = texteCanvas(su, couleur, e, contour);
  const lw = largeurTexte(su, e);
  let ox = x;
  if (align === 'c') ox = x - lw / 2;
  else if (align === 'd') ox = x - lw;
  g.drawImage(c, Math.round(ox - e - 1), Math.round(y - e - 1));
}
