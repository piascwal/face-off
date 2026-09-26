#!/usr/bin/env node
// Génère les feuilles de sprites PNG pixel art des patineurs et gardiens.
//
// Contrairement au POC (silhouettes ~10x14 dessinées pixel par pixel au vol
// dans le navigateur), ce script tourne une fois côté build/CI et produit de
// vrais fichiers PNG dans public/sprites/ : plus de détail (casque à visière,
// chandail à numéro et bande, culotte rayée, patin avec lame qui brille), et
// surtout des assets qu'une infographiste peut ouvrir dans un éditeur pixel
// art et remplacer directement, sans toucher au code du jeu (voir
// public/sprites/meta.json pour la grille attendue).
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detoure } from './logo-cutout.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_SPRITES = path.join(__dirname, '..', 'public', 'sprites');
const OUT_ICONS = path.join(__dirname, '..', 'public', 'icons');
const OUT_LOGOS = path.join(__dirname, '..', 'public', 'logos');
const SRC_LOGOS = path.join(__dirname, '..', 'assets', 'logos-src');
mkdirSync(OUT_SPRITES, { recursive: true });
mkdirSync(OUT_ICONS, { recursive: true });
mkdirSync(OUT_LOGOS, { recursive: true });

const TILE_W = 24;
const TILE_H = 32;
const SKATER_FRAMES = 3;

// Couleurs de maillot dérivées des écussons dans assets/logos-src/ — tenues
// synchronisées à la main avec src/render/team-visuals.ts (ce script tourne
// en Node pur, sans les alias TS du reste du projet). Chaque équipe a un
// maillot domicile et un maillot extérieur (corps/bande inversés) pour que
// le joueur puisse éviter un choc de couleurs avec l'adversaire.
const INTERIEURS = [
  { id: 'toulouse', numero: 1, maillot: '#d81f26', fonce: '#141414', clair: '#ffffff', casque: '#141414' },
  { id: 'nice', numero: 2, maillot: '#17181a', fonce: '#7a1017', clair: '#e8b73a', casque: '#17181a' },
  { id: 'vaujany', numero: 3, maillot: '#9c2b1f', fonce: '#5c3a1e', clair: '#dba24a', casque: '#5c3a1e' },
  { id: 'nimes', numero: 4, maillot: '#2f7d3a', fonce: '#163a1b', clair: '#d8b23a', casque: '#163a1b' },
  { id: 'grenoble', numero: 5, maillot: '#2f6fd0', fonce: '#0c1830', clair: '#f2661c', casque: '#0c1830' },
  { id: 'montpellier', numero: 6, maillot: '#0d1e4a', fonce: '#071230', clair: '#e8611c', casque: '#0d1e4a' },
  { id: 'montreal', numero: 7, maillot: '#af1e2d', fonce: '#14205c', clair: '#ffffff', casque: '#14205c' },
  { id: 'ducks', numero: 8, maillot: '#0d0d0d', fonce: '#c9a227', clair: '#f2661c', casque: '#0d0d0d' },
  { id: 'marseille', numero: 9, maillot: '#2f7bbf', fonce: '#16213e', clair: '#c7ccd1', casque: '#2b2f38' },
  { id: 'valence', numero: 0, maillot: '#c41e3a', fonce: '#0d0d0d', clair: '#ffffff', casque: '#0d0d0d' },
  { id: 'annecy', numero: 4, maillot: '#141414', fonce: '#8b1e1e', clair: '#ffffff', casque: '#141414' },
];
const VARIANTES = ['interieur', 'exterieur'];
function palette(base, variante) {
  if (variante === 'interieur') return base;
  return { maillot: base.clair, fonce: base.fonce, clair: base.maillot, casque: base.casque };
}
const EQUIPES = INTERIEURS.flatMap((base) =>
  VARIANTES.map((variante) => ({
    ...palette(base, variante),
    id: `${base.id}-${variante}`,
    numero: base.numero,
  })),
);
const EQUIPES_LOGO = INTERIEURS; // un seul écusson par équipe, indépendant du maillot
const CONTOUR = '#0b0e1d';
const PEAU = '#f1c7a0';
const PEAU_OMBRE = '#d9a47c';
const VISIERE = '#12213a';
const VISIERE_REFLET = '#3a5f8f';
const CULOTTE = '#1d2340';
const CULOTTE_OMBRE = '#131830';
const PATIN = '#23262e';
const PATIN_REFLET = '#4a5162';
const SUPPORT = '#5b6273';
const LACET = '#9aa4b8';
const LAME = '#e6edf5';
const LAME_BRIL = '#ffffff';
const BOIS = '#c08a52';
const BOIS_OMBRE = '#7a5230';
const TAPE = '#f4f6fb';

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Mélange deux couleurs hexa (t=0 → a, t=1 → b) : sert aux teintes d'ombre
 * dérivées de la couleur d'équipe (casque, maillot...) sans les coder en dur. */
function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return (
    '#' +
    pa
      .map((v, i) => Math.round(v + (pb[i] - v) * t)
        .toString(16)
        .padStart(2, '0'))
      .join('')
  );
}

const CHIFFRES = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['011', '100', '111', '101', '111'],
  7: ['111', '001', '001', '001', '001'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
};

function dessineChiffre(ctx, n, ox, oy, color) {
  const motif = CHIFFRES[n] ?? CHIFFRES[1];
  for (let y = 0; y < motif.length; y++) {
    for (let x = 0; x < motif[y].length; x++) {
      if (motif[y][x] === '1') rect(ctx, ox + x, oy + y, 1, 1, color);
    }
  }
}

/**
 * Casque en dôme (au lieu d'une simple casquette plate) : galbe arrondi sur
 * le dessus, reflet clair et ombre sombre sur les bords pour donner du
 * volume, visière teintée avec son propre reflet, et menton dégagé.
 */
function dessineCasque(ctx, eq, ox, oy) {
  const clair = mix(eq.casque, '#ffffff', 0.45);
  const sombre = mix(eq.casque, '#000000', 0.35);
  rect(ctx, ox + 9, oy + 0, 1, 1, clair);
  rect(ctx, ox + 10, oy + 0, 1, 1, eq.casque);
  rect(ctx, ox + 11, oy + 0, 2, 1, eq.clair);
  rect(ctx, ox + 13, oy + 0, 2, 1, eq.casque);
  rect(ctx, ox + 7, oy + 1, 1, 1, clair);
  rect(ctx, ox + 8, oy + 1, 3, 1, eq.casque);
  rect(ctx, ox + 11, oy + 1, 2, 1, eq.clair);
  rect(ctx, ox + 13, oy + 1, 4, 1, eq.casque);
  rect(ctx, ox + 6, oy + 2, 1, 1, clair);
  rect(ctx, ox + 7, oy + 2, 4, 1, eq.casque);
  rect(ctx, ox + 11, oy + 2, 2, 1, eq.clair);
  rect(ctx, ox + 13, oy + 2, 4, 1, eq.casque);
  rect(ctx, ox + 17, oy + 2, 1, 1, sombre);
  rect(ctx, ox + 6, oy + 3, 5, 1, eq.casque);
  rect(ctx, ox + 11, oy + 3, 2, 1, eq.clair);
  rect(ctx, ox + 13, oy + 3, 4, 1, eq.casque);
  rect(ctx, ox + 17, oy + 3, 1, 1, sombre);
  rect(ctx, ox + 6, oy + 4, 2, 1, eq.casque);
  rect(ctx, ox + 8, oy + 4, 2, 1, VISIERE_REFLET);
  rect(ctx, ox + 10, oy + 4, 6, 1, VISIERE);
  rect(ctx, ox + 16, oy + 4, 1, 1, eq.casque);
  rect(ctx, ox + 17, oy + 4, 1, 1, sombre);
  rect(ctx, ox + 6, oy + 5, 2, 1, eq.casque);
  rect(ctx, ox + 8, oy + 5, 1, 1, VISIERE_REFLET);
  rect(ctx, ox + 9, oy + 5, 7, 1, VISIERE);
  rect(ctx, ox + 16, oy + 5, 1, 1, eq.casque);
  rect(ctx, ox + 17, oy + 5, 1, 1, sombre);
  rect(ctx, ox + 6, oy + 6, 2, 1, eq.casque);
  rect(ctx, ox + 8, oy + 6, 8, 1, PEAU);
  rect(ctx, ox + 16, oy + 6, 2, 1, sombre);
  rect(ctx, ox + 7, oy + 7, 1, 1, eq.casque);
  rect(ctx, ox + 8, oy + 7, 7, 1, PEAU);
  rect(ctx, ox + 15, oy + 7, 1, 1, PEAU_OMBRE);
  rect(ctx, ox + 16, oy + 7, 1, 1, sombre);
  rect(ctx, ox + 8, oy + 8, 1, 1, sombre);
  rect(ctx, ox + 9, oy + 8, 5, 1, PEAU);
  rect(ctx, ox + 14, oy + 8, 1, 1, PEAU_OMBRE);
  rect(ctx, ox + 15, oy + 8, 1, 1, sombre);
}

/**
 * Maillot avec épaulettes, bande blanche, numéro, et une ombre sur le flanc
 * droit du joueur (colonnes de droite plus sombres) pour donner du volume —
 * plutôt qu'un aplat uniforme.
 */
function dessineMaillot(ctx, eq, numero, ox, oy) {
  const ombre = mix(eq.maillot, '#000000', 0.3);
  rect(ctx, ox + 7, oy + 9, 4, 1, eq.maillot);
  rect(ctx, ox + 11, oy + 9, 2, 1, '#ffffff');
  rect(ctx, ox + 13, oy + 9, 2, 1, eq.maillot);
  rect(ctx, ox + 15, oy + 9, 2, 1, ombre);
  rect(ctx, ox + 5, oy + 10, 3, 1, eq.clair);
  rect(ctx, ox + 8, oy + 10, 8, 1, eq.maillot);
  rect(ctx, ox + 16, oy + 10, 2, 1, eq.clair);
  rect(ctx, ox + 18, oy + 10, 1, 1, ombre);
  rect(ctx, ox + 5, oy + 11, 3, 1, eq.clair);
  rect(ctx, ox + 8, oy + 11, 8, 1, eq.maillot);
  rect(ctx, ox + 16, oy + 11, 2, 1, eq.clair);
  rect(ctx, ox + 18, oy + 11, 1, 1, ombre);
  rect(ctx, ox + 4, oy + 12, 1, 1, eq.clair);
  rect(ctx, ox + 5, oy + 12, 1, 1, '#ffffff');
  rect(ctx, ox + 6, oy + 12, 2, 1, eq.clair);
  rect(ctx, ox + 8, oy + 12, 8, 1, eq.maillot);
  rect(ctx, ox + 16, oy + 12, 1, 1, ombre);
  rect(ctx, ox + 17, oy + 12, 2, 1, eq.clair);
  rect(ctx, ox + 19, oy + 12, 1, 1, ombre);
  rect(ctx, ox + 4, oy + 13, 1, 1, eq.maillot);
  rect(ctx, ox + 5, oy + 13, 1, 1, '#ffffff');
  dessineChiffre(ctx, numero, ox + 10, oy + 11, eq.clair);
  rect(ctx, ox + 6, oy + 13, 10, 1, eq.maillot);
  rect(ctx, ox + 16, oy + 13, 4, 1, ombre);
  rect(ctx, ox + 4, oy + 14, 12, 1, eq.maillot);
  rect(ctx, ox + 16, oy + 14, 4, 1, ombre);
  rect(ctx, ox + 3, oy + 15, 2, 1, eq.fonce);
  rect(ctx, ox + 5, oy + 15, 11, 1, eq.maillot);
  rect(ctx, ox + 16, oy + 15, 3, 1, ombre);
  rect(ctx, ox + 3, oy + 16, 2, 1, eq.fonce);
  rect(ctx, ox + 5, oy + 16, 13, 1, '#ffffff');
  rect(ctx, ox + 18, oy + 16, 1, 1, ombre);
  rect(ctx, ox + 5, oy + 17, 14, 1, eq.fonce);
}

function dessineCulotte(ctx, eq, ox, oy) {
  const ombre = mix(eq.maillot, '#000000', 0.3);
  rect(ctx, ox + 6, oy + 18, 10, 1, CULOTTE);
  rect(ctx, ox + 16, oy + 18, 2, 1, CULOTTE_OMBRE);
  rect(ctx, ox + 6, oy + 19, 1, 1, CULOTTE);
  rect(ctx, ox + 7, oy + 19, 9, 1, eq.maillot);
  rect(ctx, ox + 16, oy + 19, 1, 1, ombre);
  rect(ctx, ox + 17, oy + 19, 1, 1, CULOTTE_OMBRE);
  rect(ctx, ox + 6, oy + 20, 10, 1, CULOTTE);
  rect(ctx, ox + 16, oy + 20, 2, 1, CULOTTE_OMBRE);
}

const POSES_JAMBES = [
  [
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ],
  [
    { dx: -3, dy: 0 },
    { dx: 3, dy: -2 },
  ],
  [
    { dx: 3, dy: 0 },
    { dx: -3, dy: -2 },
  ],
];

/**
 * Patin détaillé : chaussure avec languette et lacet, coque plus claire au
 * bout, support de lame distinct de la lame elle-même (plus longue, avec un
 * reflet à l'avant) — remplace l'ancien bloc uni + trait de lame.
 */
function dessineJambes(ctx, eq, frame, ox, oy) {
  const paire = POSES_JAMBES[frame % POSES_JAMBES.length];
  for (const [jambe, sens] of [
    [paire[0], -1],
    [paire[1], 1],
  ]) {
    const jx = ox + 12 + sens * 3 + jambe.dx;
    const jy = oy + 21 + jambe.dy;
    rect(ctx, jx - 1, jy, 3, 4, eq.maillot);
    rect(ctx, jx - 1, jy + 1, 3, 1, '#ffffff');
    rect(ctx, jx - 1, jy + 3, 3, 1, eq.clair);
    rect(ctx, jx - 1, jy + 4, 3, 1, PATIN_REFLET);
    rect(ctx, jx - 1, jy + 5, 4, 2, PATIN);
    rect(ctx, jx + 2, jy + 5, 1, 1, PATIN_REFLET);
    rect(ctx, jx, jy + 5, 1, 1, LACET);
    rect(ctx, jx - 1, jy + 7, 4, 1, SUPPORT);
    rect(ctx, jx - 2, jy + 8, 6, 1, LAME);
    rect(ctx, jx + 2, jy + 8, 2, 1, LAME_BRIL);
  }
}

/**
 * Crosse en bois de 2px d'épaisseur, tenue à deux mains, palette posée sur
 * la glace et scotchée en blanc — remplace l'ancien trait de 1px qui
 * flottait à hauteur de taille.
 */
function crosse(ctx, eq, frame, ox, oy) {
  const d = frame === 2 ? 1 : 0;
  const [x0, y0] = [16, 10];
  const [x1, y1] = [18, 28];
  const n = y1 - y0;
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = y0 + i + d;
    rect(ctx, ox + x, oy + y, 1, 1, BOIS);
    rect(ctx, ox + x + 1, oy + y, 1, 1, BOIS_OMBRE);
  }
  rect(ctx, ox + x0, oy + y0 + d, 2, 2, TAPE);
  rect(ctx, ox + x0, oy + y0 + d + 4, 2, 1, eq.clair);
  // palette : posée sur la glace, scotch blanc au milieu
  rect(ctx, ox + 17, oy + 29 + d, 6, 2, BOIS);
  rect(ctx, ox + 17, oy + 30 + d, 6, 1, BOIS_OMBRE);
  rect(ctx, ox + 18, oy + 29 + d, 4, 2, TAPE);
  rect(ctx, ox + 18, oy + 30 + d, 4, 1, mix(TAPE, '#000000', 0.15));
  // mains, l'une au-dessus de l'autre le long du manche
  rect(ctx, ox + 15, oy + 13 + d, 3, 2, eq.fonce);
  rect(ctx, ox + 15, oy + 13 + d, 3, 1, mix(eq.fonce, '#ffffff', 0.25));
  rect(ctx, ox + 16, oy + 17 + d, 3, 2, eq.fonce);
  rect(ctx, ox + 16, oy + 17 + d, 3, 1, mix(eq.fonce, '#ffffff', 0.25));
}

function dessinePatineur(ctx, eq, numero, frame, ox, oy) {
  dessineJambes(ctx, eq, frame, ox, oy);
  dessineCulotte(ctx, eq, ox, oy);
  dessineMaillot(ctx, eq, numero, ox, oy);
  dessineCasque(ctx, eq, ox, oy);
  crosse(ctx, eq, frame, ox, oy);
}

function dessineGardien(ctx, eq, ox, oy) {
  // jambières larges
  rect(ctx, ox + 4, oy + 18, 6, 9, '#eef2f8');
  rect(ctx, ox + 14, oy + 18, 6, 9, '#eef2f8');
  rect(ctx, ox + 4, oy + 24, 6, 2, eq.maillot);
  rect(ctx, ox + 14, oy + 24, 6, 2, eq.maillot);
  rect(ctx, ox + 4, oy + 27, 6, 2, PATIN);
  rect(ctx, ox + 14, oy + 27, 6, 2, PATIN);
  rect(ctx, ox + 3, oy + 29, 8, 1, LAME);
  rect(ctx, ox + 13, oy + 29, 8, 1, LAME);
  // plastron large
  rect(ctx, ox + 4, oy + 9, 16, 9, eq.maillot);
  rect(ctx, ox + 4, oy + 9, 16, 2, eq.clair);
  rect(ctx, ox + 4, oy + 13, 16, 1, '#ffffff');
  dessineChiffre(ctx, 1, ox + 10, oy + 14, eq.clair);
  // mitaine et bouclier
  rect(ctx, ox + 0, oy + 12, 5, 6, eq.fonce);
  rect(ctx, ox + 19, oy + 11, 5, 7, '#c9d2e3');
  rect(ctx, ox + 19, oy + 11, 5, 1, eq.maillot);
  // casque + grille
  rect(ctx, ox + 7, oy + 0, 10, 3, eq.casque);
  rect(ctx, ox + 6, oy + 3, 12, 2, eq.casque);
  rect(ctx, ox + 8, oy + 5, 8, 3, VISIERE);
  for (let i = 0; i < 4; i++) rect(ctx, ox + 9 + i * 2, oy + 5, 1, 3, '#3a4560');
  rect(ctx, ox + 7, oy + 0, 3, 1, 'rgba(255,255,255,0.55)');
  // crosse de gardien
  ctx.fillStyle = '#5b3a22';
  ctx.fillRect(ox + 21, oy + 17, 2, 8);
}

/** Ajoute un contour sombre d'un pixel autour de toute forme opaque. */
function ajouteContour(ctx, w, h, couleur) {
  const img = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(img.data);
  const opaque = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    return src[(y * w + x) * 4 + 3] > 10;
  };
  const [cr, cg, cb] = [
    parseInt(couleur.slice(1, 3), 16),
    parseInt(couleur.slice(3, 5), 16),
    parseInt(couleur.slice(5, 7), 16),
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (opaque(x, y)) continue;
      if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1)) {
        const i = (y * w + x) * 4;
        img.data[i] = cr;
        img.data[i + 1] = cg;
        img.data[i + 2] = cb;
        img.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function creeFeuilleJoueur(eq, numero) {
  // rangée 0 (y=0..TILE_H) : orienté droite. rangée 1 : miroir horizontal (gauche).
  const canvas = createCanvas(TILE_W * SKATER_FRAMES, TILE_H * 2);
  const ctx = canvas.getContext('2d');
  for (let frame = 0; frame < SKATER_FRAMES; frame++) {
    dessinePatineur(ctx, eq, numero, frame, frame * TILE_W, 0);
  }
  ajouteContour(ctx, canvas.width, TILE_H, CONTOUR);
  for (let frame = 0; frame < SKATER_FRAMES; frame++) {
    ctx.save();
    ctx.translate((frame + 1) * TILE_W, TILE_H);
    ctx.scale(-1, 1);
    ctx.drawImage(canvas, frame * TILE_W, 0, TILE_W, TILE_H, 0, 0, TILE_W, TILE_H);
    ctx.restore();
  }
  return canvas;
}

function creeFeuilleGardien(eq) {
  // rangée 0 : orienté droite. rangée 1 : miroir horizontal (gauche).
  const canvas = createCanvas(TILE_W, TILE_H * 2);
  const ctx = canvas.getContext('2d');
  dessineGardien(ctx, eq, 0, 0);
  ajouteContour(ctx, TILE_W, TILE_H, CONTOUR);
  ctx.save();
  ctx.translate(TILE_W, TILE_H);
  ctx.scale(-1, 1);
  ctx.drawImage(canvas, 0, 0, TILE_W, TILE_H, 0, 0, TILE_W, TILE_H);
  ctx.restore();
  return canvas;
}

for (const eq of EQUIPES) {
  const feuille = creeFeuilleJoueur(eq, eq.numero);
  writeFileSync(path.join(OUT_SPRITES, `skater-${eq.id}.png`), feuille.toBuffer('image/png'));
  const gk = creeFeuilleGardien(eq);
  writeFileSync(path.join(OUT_SPRITES, `goalie-${eq.id}.png`), gk.toBuffer('image/png'));
}

writeFileSync(
  path.join(OUT_SPRITES, 'meta.json'),
  JSON.stringify(
    {
      tileW: TILE_W,
      tileH: TILE_H,
      skaterFrames: SKATER_FRAMES,
      teamIds: EQUIPES_LOGO.map((e) => e.id),
      variants: VARIANTES,
    },
    null,
    2,
  ),
);

// --- Écussons des équipes : fond retiré (damier « transparent » ou couleur
// pleine selon la source, voir logo-cutout.mjs), recadrés en carré sur un
// fond PNG transparent. ------------------------------------------------------

function boiteOpaque({ data, width, height }) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 16) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? { x0: 0, y0: 0, x1: width - 1, y1: height - 1 } : { x0, y0, x1, y1 };
}

async function traiteLogos() {
  // assez grand pour l'animation de but, où l'écusson occupe presque tout l'écran
  const TAILLE = 256;
  for (const eq of EQUIPES_LOGO) {
    const img = await loadImage(path.join(SRC_LOGOS, `${eq.id}.jpg`));
    const brut = createCanvas(img.width, img.height);
    const bctx = brut.getContext('2d');
    bctx.drawImage(img, 0, 0);
    const imgData = bctx.getImageData(0, 0, img.width, img.height);
    detoure(imgData);
    bctx.putImageData(imgData, 0, 0);

    // recadre sur la partie opaque : certaines sources ont une large marge de
    // fond qui, une fois transparente, rapetisserait l'écusson à l'écran
    const { x0, y0, x1, y1 } = boiteOpaque(imgData);
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;

    const canvas = createCanvas(TAILLE, TAILLE);
    const ctx = canvas.getContext('2d');
    const marge = TAILLE * 0.03;
    const dispo = TAILLE - marge * 2;
    const echelle = Math.min(dispo / bw, dispo / bh);
    const w = bw * echelle;
    const h = bh * echelle;
    ctx.drawImage(brut, x0, y0, bw, bh, (TAILLE - w) / 2, (TAILLE - h) / 2, w, h);
    writeFileSync(path.join(OUT_LOGOS, `${eq.id}.png`), canvas.toBuffer('image/png'));
  }
}

await traiteLogos();

// --- Icônes PWA : un petit palet pixel art sur fond nuit ------------------

function dessineIcone(taille, maskable) {
  // Le rond de mise au jeu (face-off circle) autour d'un palet : lisible à
  // toutes les tailles, et thématiquement le nom du jeu.
  const canvas = createCanvas(taille, taille);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#070914';
  ctx.fillRect(0, 0, taille, taille);
  const marge = maskable ? taille * 0.24 : taille * 0.12;
  const r = (taille - marge * 2) / 2;
  const cx = taille / 2;
  const cy = taille / 2;
  const epais = Math.max(2, r * 0.09);

  ctx.strokeStyle = '#d8344d';
  ctx.lineWidth = epais;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#2ec8f5';
  ctx.lineWidth = epais * 0.6;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx - r * 0.45, cy);
  ctx.moveTo(cx + r * 0.45, cy);
  ctx.lineTo(cx + r, cy);
  ctx.stroke();

  ctx.fillStyle = '#0b0e1d';
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.42, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a4560';
  ctx.lineWidth = Math.max(1, epais * 0.4);
  ctx.stroke();

  return canvas;
}

writeFileSync(path.join(OUT_ICONS, 'icon-192.png'), dessineIcone(192, false).toBuffer('image/png'));
writeFileSync(path.join(OUT_ICONS, 'icon-512.png'), dessineIcone(512, false).toBuffer('image/png'));
writeFileSync(path.join(OUT_ICONS, 'icon-maskable-512.png'), dessineIcone(512, true).toBuffer('image/png'));

console.log('Sprites et icônes générés dans public/sprites/ et public/icons/');
