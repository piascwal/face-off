import { pointCrosse } from '@core/actions';
import { CHUTE_PLONGEON, TIR_ANIM, TIR_ANIM_S } from '@core/constants';
import type { Goalie, Puck, Skater } from '@core/types';
import { px } from './primitives';
import type { BanqueSprites, Rect } from './sprites';
import { C, MARQUE } from './theme';
import type { EquipeVisuelle } from './team-visuals';

/** Couleur fixe du repère « c'est vous » — jamais celle d'un maillot, pour ne
 * jamais se confondre avec une équipe (voir dessinePatineur). */
const COULEUR_CONTROLE = MARQUE.bleu;

/**
 * Anneau pulsant au sol sous un patineur — sert de base aux indicateurs
 * visuels : qui est sélectionné, et qui porte le palet.
 */
function haloSol(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, alpha: number, epais = 1): void {
  g.globalAlpha = alpha;
  g.strokeStyle = col;
  g.lineWidth = epais;
  g.beginPath();
  g.ellipse(Math.round(x), Math.round(y), r, r * 0.42, 0, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
}

/** Flaque de lumière douce au sol (fondu additif) : se voit de loin, même dans une
 * mêlée, contrairement à un simple anneau qu'on peut confondre avec le marquage
 * de la glace. */
function lueurSol(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, alpha: number): void {
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = alpha;
  g.fillStyle = col;
  g.beginPath();
  g.ellipse(Math.round(x), Math.round(y), r, r * 0.42, 0, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

/**
 * Flèche pointée vers le joueur qu'on pilote (bas de la pointe en `y`) :
 * se repère d'un coup d'œil, même dans une mêlée. `simple` : version plus
 * petite, pour le joueur de l'autre humain en Wi-Fi.
 */
function flecheControle(g: CanvasRenderingContext2D, x: number, y: number, couleur = COULEUR_CONTROLE, simple = false): void {
  const lignes = simple ? [5, 3, 1] : [9, 7, 5, 3, 1];
  const y0 = y - lignes.length;
  // contour d'un pixel autour de la pointe
  lignes.forEach((w, i) => px(g, x - w / 2 - 1, y0 + i - 1, w + 2, 3, C.contour));
  lignes.forEach((w, i) => px(g, x - w / 2, y0 + i, w, 1, couleur));
  // reflet sur le bord haut
  px(g, x - lignes[0]! / 2, y0, lignes[0]! - 1, 1, '#ffffff');
  g.globalAlpha = 0.35;
  px(g, x - lignes[0]! / 2, y0, lignes[0]!, 1, couleur);
  g.globalAlpha = 1;
}

let tamponFlash: HTMLCanvasElement | null = null;

/**
 * Silhouette blanche d'un sprite : le flash d'impact (mise en échec, esquive),
 * comme dans les jeux d'arcade — se lit d'un coup d'œil, sans texte.
 */
function dessineBlanc(g: CanvasRenderingContext2D, img: CanvasImageSource, r: Rect, dx: number, dy: number, dw: number, dh: number, couleur = '#ffffff'): void {
  tamponFlash ??= document.createElement('canvas');
  if (tamponFlash.width < r.sw || tamponFlash.height < r.sh) {
    tamponFlash.width = Math.max(tamponFlash.width, r.sw);
    tamponFlash.height = Math.max(tamponFlash.height, r.sh);
  }
  const t = tamponFlash.getContext('2d');
  if (!t) return;
  t.clearRect(0, 0, r.sw, r.sh);
  t.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = couleur;
  t.fillRect(0, 0, r.sw, r.sh);
  t.globalCompositeOperation = 'source-over';
  g.drawImage(tamponFlash, 0, 0, r.sw, r.sh, dx, dy, dw, dh);
}

/** Étoiles qui tournent au-dessus d'un joueur sonné. */
function etoiles(g: CanvasRenderingContext2D, x: number, y: number, temps: number): void {
  for (let i = 0; i < 3; i++) {
    const a = temps * 6 + i * 2.1;
    px(g, x + Math.cos(a) * 6, y + Math.sin(a) * 2, 1, 1, C.or);
  }
}

/**
 * Défenseur esquivé, au sol : plongeon puis allongé, tête dans le sens de sa
 * glissade (voir `esquive` dans core/actions).
 */
function dessineAuSol(
  g: CanvasRenderingContext2D,
  sprites: BanqueSprites,
  s: Skater,
  temps: number,
  estControle: boolean,
  equipes: [EquipeVisuelle, EquipeVisuelle],
): void {
  const M = sprites.meta.chute;
  const e = M.echelle;
  const gauche = Math.cos(s.face) < 0;
  const frame = s.chuteD - s.chuteT < CHUTE_PLONGEON ? 0 : 1;
  const sprite = sprites.spriteChute(equipes[s.eq].id, frame, gauche);
  const miroir = (x: number) => (gauche ? M.tileW - x : x);
  const bx = s.x - miroir(M.pied.x) * e;
  const by = s.y + 2 - M.pied.y * e;
  if (estControle) haloSol(g, s.x, s.y + 4, 12, COULEUR_CONTROLE, 0.5 + 0.25 * Math.sin(temps * 6));
  if (sprite) {
    const { img, rect: r } = sprite;
    if (s.flashT > 0) dessineBlanc(g, img, r, bx, by, M.tileW * e, M.tileH * e);
    else g.drawImage(img, r.sx, r.sy, r.sw, r.sh, bx, by, M.tileW * e, M.tileH * e);
  }
  const t = M.tete[frame] ?? M.pied;
  const hx = bx + miroir(t.x) * e;
  const hy = by + t.y * e;
  if (frame === 1) etoiles(g, hx, hy - 5, temps);
  if (estControle) flecheControle(g, Math.round(hx), Math.round(hy) - 8 + Math.round(Math.sin(temps * 6)));
  else if (s.humain) flecheControle(g, Math.round(hx), Math.round(hy) - 8, equipes[s.eq].clair, true);
}

/**
 * Image du geste de tir à montrer : 0 (armé) tant que le tir se charge, puis
 * 1, 2, 3 (descente, impact, accompagnement) juste après le tir ; null sinon.
 */
function imageTir(s: Skater): number | null {
  if (s.arme && s.tient) return 0;
  if (s.tirT <= 0) return null;
  let t = TIR_ANIM_S - s.tirT;
  for (let i = 0; i < TIR_ANIM.length; i++) {
    if (t < TIR_ANIM[i]!) return i + 1;
    t -= TIR_ANIM[i]!;
  }
  return TIR_ANIM.length;
}

/** Pas de patinage : distance parcourue (px logiques) par image du cycle. */
const PAS_ANIM = 8;

/** Aspect d'un joueur sous l'effet d'un bonus. */
export interface AspectBonus {
  /** Doré en ce moment (il clignote entre doré et normal à la fin du bonus). */
  or: boolean;
  /** Super vitesse : images fantômes derrière lui. */
  vitesse: boolean;
  /** Freeze : pris dans un bloc de glace. */
  gele: boolean;
  /** Inversion adverse : spirales de confusion au-dessus de la tête. */
  confus: boolean;
  /** Renfort du surnombre : dessiné en semi-transparence. */
  fantome: boolean;
}

/** Bloc de glace autour d'un joueur gelé (bonus freeze), avec deux reflets. */
function blocGlace(g: CanvasRenderingContext2D, x: number, haut: number, bas: number): void {
  const l = 18;
  const x0 = Math.round(x - l / 2);
  const y0 = Math.round(haut);
  const h = Math.round(bas - haut);
  g.globalAlpha = 0.35;
  px(g, x0, y0, l, h, '#bfefff');
  g.globalAlpha = 0.85;
  px(g, x0, y0, l, 1, '#f2fcff');
  px(g, x0, y0, 1, h, '#f2fcff');
  px(g, x0 + l - 1, y0, 1, h, '#8fd8f5');
  px(g, x0, y0 + h - 1, l, 1, '#8fd8f5');
  g.globalAlpha = 0.7;
  for (let k = 0; k < 5; k++) px(g, x0 + 3 + k, y0 + 7 - k, 1, 1, '#ffffff');
  for (let k = 0; k < 3; k++) px(g, x0 + 4 + k, y0 + 11 - k, 1, 1, '#ffffff');
  g.globalAlpha = 1;
}

/** Spirales de confusion (inversion des commandes) au-dessus de la tête. */
function spirales(g: CanvasRenderingContext2D, x: number, y: number, temps: number): void {
  for (const [dx, sens] of [
    [-5, 1],
    [5, -1],
  ] as const) {
    for (let k = 0; k < 16; k++) {
      const a = sens * (temps * 7 + k * 0.62);
      const r = 0.6 + k * 0.32;
      const qx = x + dx + Math.cos(a) * r;
      const qy = y + Math.sin(a) * r * 0.8;
      px(g, qx - 1, qy - 1, 3, 3, '#2a1450');
      px(g, qx, qy, 2, 2, k < 3 ? '#ffffff' : '#c08cff');
    }
  }
}

export function dessinePatineur(
  g: CanvasRenderingContext2D,
  sprites: BanqueSprites,
  s: Skater,
  temps: number,
  estControle: boolean,
  equipes: [EquipeVisuelle, EquipeVisuelle],
  bonus: AspectBonus | null,
  menace = false,
): void {
  if (s.chuteT > 0) {
    dessineAuSol(g, sprites, s, temps, estControle, equipes);
    return;
  }
  const gauche = Math.cos(s.face) < 0;
  const or = !!bonus?.or;
  const id = equipes[s.eq].id;
  const varianteVisage = s.rang * 2 + s.eq * 3;
  // geste de tir (armé, puis descente, impact, accompagnement), si sa feuille est chargée
  let poseTir = imageTir(s);
  if (poseTir !== null && !sprites.spriteTir(id, poseTir, gauche)) poseTir = null;
  const M = poseTir !== null ? sprites.meta.tir : sprites.meta.joueur;
  const e = M.echelle;
  // taille des repères au sol, proportionnelle au joueur
  const rs = e / 0.28;
  const v = Math.hypot(s.vx, s.vy);
  const frame = poseTir ?? (v < 14 ? sprites.meta.joueur.arret : Math.floor(s.anim / PAS_ANIM) % sprites.meta.joueur.images);
  // joueur doré (bonus) : feuille repeinte en or, visage compris ; chaque joueur
  // garde son visage (teint, barbe) : même tirage sur les deux écrans en Wi-Fi
  let sprite;
  let visage;
  if (poseTir !== null) {
    sprite = or ? sprites.spriteTirDore(id, frame, gauche) : sprites.spriteTir(id, frame, gauche);
    visage = or ? null : sprites.spriteVisageTir(varianteVisage, frame, gauche);
  } else {
    sprite = or ? sprites.spriteJoueurDore(id, frame, gauche) : sprites.spriteJoueur(id, frame, gauche);
    visage = or ? null : sprites.spriteVisage(varianteVisage, frame, gauche);
  }
  const tw = M.tileW * e;
  const th = M.tileH * e;
  // le tronc du joueur sur sa position (4 px sous son centre : là où il touche la glace)
  const ancre = M.pied.x + M.decalage;
  const piedX = gauche ? M.tileW - ancre : ancre;
  let bx = s.x - piedX * e;
  const by = s.y + 4 - M.pied.y * e;
  if (s.sonne > 0) bx += Math.sin(temps * 40);
  // mise en échec en préparation : le défenseur tremble, prêt à charger
  if (s.prepaEchecT > 0) bx += Math.floor(temps * 30) & 1 ? 1 : -1;
  const teteY = by + (poseTir !== null ? sprites.meta.tir.tete[poseTir]! : sprites.meta.joueur.tete) * e + 2;
  const sp = pointCrosse(s);
  const corps = (dx = 0, dy = 0) => {
    // impact : silhouette blanche (le visage est dans la silhouette)
    if (sprite && s.flashT > 0 && dx === 0 && dy === 0) {
      dessineBlanc(g, sprite.img, sprite.rect, bx, by, tw, th);
      return;
    }
    if (sprite) g.drawImage(sprite.img, sprite.rect.sx, sprite.rect.sy, sprite.rect.sw, sprite.rect.sh, bx + dx, by + dy, tw, th);
    if (visage) g.drawImage(visage.img, visage.rect.sx, visage.rect.sy, visage.rect.sw, visage.rect.sh, bx + dx, by + dy, tw, th);
  };

  // indicateur « c'est vous » : toujours visible, même en tenant le palet — une
  // couleur fixe (jamais celle d'un maillot) pour ne se confondre ni avec une
  // équipe ni avec le marquage doré du porteur du palet ci-dessous.
  if (estControle) {
    haloSol(g, s.x, s.y + 4, 8 * rs, COULEUR_CONTROLE, 0.5 + 0.25 * Math.sin(temps * 6));
  }
  // indicateur « porte le palet » : flaque de lumière dorée + double anneau au
  // sol — la flaque se repère de loin, même à moitié cachée derrière d'autres
  // joueurs dans une mêlée.
  if (s.tient) {
    lueurSol(g, s.x, s.y + 4, 12 * rs, C.or, 0.5 + 0.15 * Math.sin(temps * 8));
    haloSol(g, s.x, s.y + 4, 9 * rs, C.or, 1, 2);
    haloSol(g, s.x, s.y + 4, 11 * rs, '#fff3b0', 0.5 + 0.3 * Math.sin(temps * 8));
  }
  // mise en échec en préparation : anneau rouge clignotant sous le défenseur
  if (s.prepaEchecT > 0) {
    haloSol(g, s.x, s.y + 4, 10 * rs, '#ff5a4e', Math.floor(temps * 16) & 1 ? 1 : 0.45, 2);
  }
  // joueur doré : flaque de lumière dorée au sol
  if (or) lueurSol(g, s.x, s.y + 4, 16 * rs, '#ffb020', 0.45 + 0.15 * Math.sin(temps * 10));
  // super vitesse : deux images fantômes derrière lui
  if (bonus?.vitesse && Math.hypot(s.vx, s.vy) > 30) {
    g.globalAlpha = 0.3;
    corps(-s.vx * 0.05, -s.vy * 0.05);
    g.globalAlpha = 0.15;
    corps(-s.vx * 0.1, -s.vy * 0.1);
    g.globalAlpha = 1;
  }
  if (bonus?.fantome) g.globalAlpha = 0.62;
  if (or) {
    // auréole : le joueur doré brille (le flou d'ombre est en pixels d'écran)
    g.save();
    g.shadowColor = '#ffd35c';
    g.shadowBlur = (5 + 2 * Math.sin(temps * 8)) * g.getTransform().a;
    corps();
    g.restore();
  } else corps();
  g.globalAlpha = 1;
  // freeze : silhouette bleutée dans un bloc de glace
  if (bonus?.gele && sprite) {
    g.globalAlpha = 0.45;
    dessineBlanc(g, sprite.img, sprite.rect, bx, by, tw, th, '#8fe3ff');
    g.globalAlpha = 1;
    blocGlace(g, s.x, teteY - 3, s.y + 6);
  }
  if (bonus?.confus) spirales(g, Math.round(s.x), teteY - 4, temps);

  if (s.sonne > 0) etoiles(g, s.x, teteY - 1, temps);
  if (s.elanT > 0) {
    g.globalAlpha = 0.35;
    corps(-s.vx * 0.04, -s.vy * 0.04);
    g.globalAlpha = 1;
  }
  if (s.esquiveT > 0) {
    // esquive : deux images fantômes là où le joueur était
    g.globalAlpha = 0.3;
    corps(-s.vx * 0.05, -s.vy * 0.05);
    g.globalAlpha = 0.18;
    corps(-s.vx * 0.1, -s.vy * 0.1);
    g.globalAlpha = 1;
  }
  // un défenseur arrive en mise en échec : « ! » clignotant, c'est le moment d'esquiver
  if (menace) {
    const cl = Math.floor(temps * 16) & 1 ? '#ff5a4e' : '#ffd35c';
    const x = Math.round(s.x) + 7;
    const y = teteY - 14;
    px(g, x - 2, y - 1, 5, 10, C.contour);
    px(g, x - 1, y, 3, 5, cl);
    px(g, x - 1, y + 6, 3, 2, cl);
  }
  // au-dessus de la tête : la flèche du joueur piloté
  if (estControle) {
    flecheControle(g, Math.round(s.x), teteY - 2 + Math.round(Math.sin(temps * 6)));
  } else if (s.humain) {
    // l'adversaire humain d'une partie en réseau : petite flèche à ses couleurs
    flecheControle(g, Math.round(s.x), teteY - 2, equipes[s.eq].clair, true);
  }
  if (estControle && s.arme && s.vise !== null) {
    // flèche de visée pointillée, qui s'allonge avec la puissance
    const L = 12 + 26 * s.charge;
    const c = s.charge > 0.85 ? '#ff5a4e' : C.or;
    for (let k = 4; k < L; k += 4) {
      const x = sp.x + Math.cos(s.vise) * k;
      const y = sp.y + Math.sin(s.vise) * k;
      px(g, x - 1, y - 1, 3, 3, C.contour);
      px(g, x, y, 1, 1, c);
    }
    const bx_ = sp.x + Math.cos(s.vise) * L;
    const by_ = sp.y + Math.sin(s.vise) * L;
    px(g, bx_ - 2, by_ - 2, 5, 5, C.contour);
    px(g, bx_ - 1, by_ - 1, 3, 3, c);
  }
}

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
  } else if (!p.porteur && p.lueur && v > 40) {
    // bonus : traînée scintillante dorée (tir guidé) ou néon (ricochet), plus longue et lumineuse
    const col = p.lueur === 1 ? '#f0a810' : '#10b4f0';
    const ux = p.vx / v;
    const uy = p.vy / v;
    const L = Math.min(40, v * 0.1);
    g.fillStyle = col;
    for (let k = 1; k <= L; k++) {
      g.globalAlpha = 0.9 * (1 - k / L);
      g.fillRect(Math.round(p.x - ux * k) - 1, Math.round(p.y - uy * k) - 1, 3, 3);
    }
    // scintillement : quelques éclats qui s'allument le long de la traînée
    g.fillStyle = p.lueur === 1 ? '#c87800' : '#0a7cc0';
    for (let i = 0; i < 4; i++) {
      const k = (((temps * 37 + i * 11) % L) + L) % L;
      const cote = Math.sin(temps * 50 + i * 2) * 3;
      g.globalAlpha = 0.8 * (1 - k / L);
      g.fillRect(Math.round(p.x - ux * k - uy * cote), Math.round(p.y - uy * k + ux * cote), 1, 1);
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
