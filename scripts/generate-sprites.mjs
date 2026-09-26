#!/usr/bin/env node
// Génère les feuilles de sprites PNG des patineurs et gardiens, les écussons
// détourés et les icônes PWA.
//
// Les joueurs et les gardiens viennent d'illustrations pixel art converties
// par convertit-sources.py (assets/sprites-src/) : ce script les repeint pour
// chaque équipe et chaque maillot, pose l'écusson de l'équipe sur la poitrine
// et dessine le calque des variantes de visage (voir sprites-illustres.mjs).
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detoure } from './logo-cutout.mjs';
import { chargeSources, feuilleGardien, feuilleJoueur, feuilleVisages, VISAGES } from './sprites-illustres.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_SPRITES = path.join(__dirname, '..', 'public', 'sprites');
const OUT_ICONS = path.join(__dirname, '..', 'public', 'icons');
const OUT_LOGOS = path.join(__dirname, '..', 'public', 'logos');
const SRC_LOGOS = path.join(__dirname, '..', 'assets', 'logos-src');
mkdirSync(OUT_SPRITES, { recursive: true });
mkdirSync(OUT_ICONS, { recursive: true });
mkdirSync(OUT_LOGOS, { recursive: true });

// Couleurs de maillot dérivées des écussons dans assets/logos-src/ — tenues
// synchronisées à la main avec src/render/team-visuals.ts (ce script tourne
// en Node pur, sans les alias TS du reste du projet). Chaque équipe a un
// maillot domicile et un maillot extérieur (corps/bande inversés) pour que
// le joueur puisse éviter un choc de couleurs avec l'adversaire.
const INTERIEURS = [
  { id: 'toulouse', maillot: '#d81f26', fonce: '#141414', clair: '#ffffff', casque: '#141414' },
  { id: 'nice', maillot: '#17181a', fonce: '#7a1017', clair: '#e8b73a', casque: '#17181a' },
  { id: 'vaujany', maillot: '#9c2b1f', fonce: '#5c3a1e', clair: '#dba24a', casque: '#5c3a1e' },
  { id: 'nimes', maillot: '#2f7d3a', fonce: '#163a1b', clair: '#d8b23a', casque: '#163a1b' },
  { id: 'grenoble', maillot: '#2f6fd0', fonce: '#0c1830', clair: '#f2661c', casque: '#0c1830' },
  { id: 'montpellier', maillot: '#0d1e4a', fonce: '#071230', clair: '#e8611c', casque: '#0d1e4a' },
  { id: 'montreal', maillot: '#af1e2d', fonce: '#14205c', clair: '#ffffff', casque: '#14205c' },
  { id: 'ducks', maillot: '#0d0d0d', fonce: '#c9a227', clair: '#f2661c', casque: '#0d0d0d' },
  { id: 'marseille', maillot: '#2f7bbf', fonce: '#16213e', clair: '#c7ccd1', casque: '#2b2f38' },
  { id: 'valence', maillot: '#c41e3a', fonce: '#0d0d0d', clair: '#ffffff', casque: '#0d0d0d' },
  { id: 'annecy', maillot: '#141414', fonce: '#8b1e1e', clair: '#ffffff', casque: '#141414' },
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
    base: base.id,
  })),
);
const EQUIPES_LOGO = INTERIEURS; // un seul écusson par équipe, indépendant du maillot
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

// --- Joueurs et gardiens --------------------------------------------------

/**
 * Taille d'un pixel de sprite, en pixels logiques du jeu : le patineur fait
 * environ 28 px de haut en jeu (plus grand, les mêlées devenaient illisibles),
 * le gardien environ 23, pour laisser voir la cage derrière lui.
 */
const ECHELLE_JOUEUR = 0.28;
const ECHELLE_GARDIEN = 0.2;
/**
 * Décalage de dessin (px de sprite) par rapport au point d'ancrage : le
 * patineur est dessiné un peu en arrière pour que la palette de sa crosse
 * tombe sur le palet qu'il porte ; le gardien, en avant, pour se tenir
 * devant sa cage plutôt que dessus.
 */
const DECALAGE_JOUEUR = 10;
const DECALAGE_GARDIEN = -41;
const sources = await chargeSources(path.join(__dirname, '..', 'assets', 'sprites-src'));

for (const eq of EQUIPES) {
  const logo = await loadImage(path.join(OUT_LOGOS, `${eq.base}.png`));
  writeFileSync(path.join(OUT_SPRITES, `skater-${eq.id}.png`), feuilleJoueur(sources, eq, logo).toBuffer('image/png'));
  writeFileSync(path.join(OUT_SPRITES, `goalie-${eq.id}.png`), feuilleGardien(sources, eq, logo).toBuffer('image/png'));
}
writeFileSync(path.join(OUT_SPRITES, 'visages.png'), feuilleVisages(sources).toBuffer('image/png'));

const { joueur, gardien } = sources.meta;
writeFileSync(
  path.join(OUT_SPRITES, 'meta.json'),
  JSON.stringify(
    {
      joueur: { ...joueur, echelle: ECHELLE_JOUEUR, decalage: DECALAGE_JOUEUR },
      gardien: { ...gardien, echelle: ECHELLE_GARDIEN, decalage: DECALAGE_GARDIEN },
      visages: VISAGES.length,
      teamIds: EQUIPES_LOGO.map((e) => e.id),
      variants: VARIANTES,
    },
    null,
    2,
  ),
);

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
