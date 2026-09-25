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
const VISIERE = '#12213a';
const VISIERE_REFLET = '#3a5f8f';
const CULOTTE = '#1d2340';
const PATIN = '#23262e';
const LAME = '#e6edf5';
const LAME_BRIL = '#ffffff';

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

const CHIFFRES = {
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['011', '100', '111', '101', '111'],
};

function dessineChiffre(ctx, n, ox, oy, color) {
  const motif = CHIFFRES[n] ?? CHIFFRES[1];
  for (let y = 0; y < motif.length; y++) {
    for (let x = 0; x < motif[y].length; x++) {
      if (motif[y][x] === '1') rect(ctx, ox + x, oy + y, 1, 1, color);
    }
  }
}

function dessineCasque(ctx, eq, ox, oy) {
  rect(ctx, ox + 8, oy + 0, 8, 1, eq.casque);
  rect(ctx, ox + 6, oy + 1, 12, 2, eq.casque);
  rect(ctx, ox + 5, oy + 3, 14, 2, eq.casque);
  rect(ctx, ox + 7, oy + 4, 10, 2, VISIERE);
  rect(ctx, ox + 7, oy + 4, 10, 1, VISIERE_REFLET);
  rect(ctx, ox + 8, oy + 6, 8, 2, PEAU);
  // reflet sur le dessus du casque
  rect(ctx, ox + 8, oy + 0, 3, 1, 'rgba(255,255,255,0.55)');
  // grille faciale (deux barres fines devant le visage)
  rect(ctx, ox + 10, oy + 6, 1, 2, VISIERE);
  rect(ctx, ox + 13, oy + 6, 1, 2, VISIERE);
}

function dessineMaillot(ctx, eq, numero, ox, oy) {
  rect(ctx, ox + 7, oy + 8, 10, 1, eq.maillot);
  rect(ctx, ox + 5, oy + 9, 14, 7, eq.maillot);
  // épaulettes claires
  rect(ctx, ox + 5, oy + 9, 3, 3, eq.clair);
  rect(ctx, ox + 16, oy + 9, 3, 3, eq.clair);
  // bande à mi-corps
  rect(ctx, ox + 5, oy + 12, 14, 1, '#ffffff');
  // ombre légère sous la bande, pour un peu de volume
  rect(ctx, ox + 5, oy + 15, 14, 1, eq.fonce);
  dessineChiffre(ctx, numero, ox + 10, oy + 13, eq.clair);
  // gants
  rect(ctx, ox + 3, oy + 13, 3, 3, eq.fonce);
  rect(ctx, ox + 18, oy + 13, 3, 3, eq.fonce);
}

function dessineCulotte(ctx, eq, ox, oy) {
  rect(ctx, ox + 6, oy + 16, 12, 3, CULOTTE);
  rect(ctx, ox + 6, oy + 17, 12, 1, eq.maillot);
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

function dessineJambes(ctx, eq, frame, ox, oy) {
  const paire = POSES_JAMBES[frame % POSES_JAMBES.length];
  for (const [jambe, sens] of [
    [paire[0], -1],
    [paire[1], 1],
  ]) {
    const jx = ox + 12 + sens * 3 + jambe.dx;
    const jy = oy + 19 + jambe.dy;
    rect(ctx, jx - 1, jy, 3, 4, eq.maillot);
    rect(ctx, jx - 1, jy + 1, 3, 1, '#ffffff');
    rect(ctx, jx - 1, jy + 4, 3, 3, PATIN);
    rect(ctx, jx - 2, jy + 7, 5, 1, LAME);
    rect(ctx, jx - 2, jy + 7, 2, 1, LAME_BRIL);
  }
}

function crosse(ctx, eq, frame, ox, oy) {
  void eq;
  const bx = ox + 19;
  const by = oy + 12 + (frame === 2 ? 1 : 0);
  ctx.fillStyle = '#5b3a22';
  ctx.fillRect(bx, by, 1, 6);
  ctx.fillRect(bx, by + 6, 4, 1);
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
