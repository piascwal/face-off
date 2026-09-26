import { pointCrosse } from '@core/actions';
import { FRAPPE_PASSE, FRAPPE_TIR } from '@core/constants';
import type { Goalie, Puck, Skater } from '@core/types';
import { px } from './primitives';
import type { BanqueSprites } from './sprites';
import { C, MARQUE } from './theme';
import type { EquipeVisuelle } from './team-visuals';

/** Couleur fixe du repère « c'est vous » — jamais celle d'un maillot, pour ne
 * jamais se confondre avec une équipe (voir dessinePatineur). */
const COULEUR_CONTROLE = MARQUE.bleu;

/**
 * Anneau pulsant au sol sous un patineur — sert de base aux indicateurs
 * visuels : qui est sélectionné, et qui porte le palet.
 */
function haloSol(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, alpha: number): void {
  g.globalAlpha = alpha;
  g.strokeStyle = col;
  g.lineWidth = 1;
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

/** Petit palet qui rebondit au-dessus de la tête de celui qui l'a en sa possession. */
function badgePalet(g: CanvasRenderingContext2D, x: number, y: number, temps: number): void {
  const rebond = Math.abs(Math.sin(temps * 5)) * 2;
  const by = y - rebond;
  px(g, x - 3, by - 2, 6, 4, C.contour);
  px(g, x - 2, by - 1, 4, 2, '#5a6180');
  px(g, x - 2, by - 1, 1, 1, '#c9d2e3');
}

/** Chevron double, plus gros et plus lisible que le simple repère de départ —
 * pour ne jamais perdre de vue le patineur qu'on pilote, même dans une mêlée
 * à dix joueurs. */
function repereControle(g: CanvasRenderingContext2D, x: number, fy: number, couleur = COULEUR_CONTROLE, simple = false): void {
  const y0 = fy - 3;
  for (const [dy, large] of simple
    ? ([[3, 6]] as const)
    : ([
        [0, 9],
        [3, 6],
      ] as const)) {
    const w = large;
    px(g, x - w / 2 - 1, y0 + dy - 1, w + 2, 3, C.contour);
    px(g, x - w / 2, y0 + dy, w, 1, couleur);
  }
}

/** Pas de patinage : distance parcourue (px logiques) par image du cycle. */
const PAS_ANIM = 6.5;
/** Crosse animée (armé, frappe) : longueur gants → talon, et angles clés. */
const LONG_CROSSE = 19;
const ANGLE_SOL = 95;
const ANGLE_ARME = 235;

/**
 * Trace un segment en « pixels de sprite » (carrés de `e` px logiques) :
 * la crosse garde le grain des sprites, en détail double.
 */
function segmentFin(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, e: number, col: string, epais = 1): void {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / e));
  g.fillStyle = col;
  const t = e * epais;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = y0 + ((y1 - y0) * i) / n;
    g.fillRect(Math.round(x / e) * e - t / 2, Math.round(y / e) * e - t / 2, t, t);
  }
}

/** Crosse : manche (bois, contour sombre) des gants jusqu'au talon, palette entourée de ruban noir. */
function dessineCrosse(g: CanvasRenderingContext2D, e: number, mx: number, my: number, tx: number, ty: number, bx: number, by: number): void {
  segmentFin(g, mx, my, tx, ty, e, '#14162c', 2.6);
  segmentFin(g, tx, ty, bx, by, e, '#14162c', 2.6);
  segmentFin(g, mx, my, tx, ty, e, '#a0714a', 1.2);
  segmentFin(g, tx, ty, bx, by, e, '#1c1d32', 1.2);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function dessinePatineur(
  g: CanvasRenderingContext2D,
  sprites: BanqueSprites,
  s: Skater,
  temps: number,
  estControle: boolean,
  equipes: [EquipeVisuelle, EquipeVisuelle],
  specialPret: boolean,
): void {
  const M = sprites.meta.joueur;
  const e = sprites.meta.echelle;
  const gauche = Math.cos(s.face) < 0;
  const dir = gauche ? -1 : 1;
  const v = Math.hypot(s.vx, s.vy);
  const frame = v < 14 ? 0 : Math.floor(s.anim / PAS_ANIM) % M.images;
  const bob = M.bob[frame] ?? 0;
  const id = equipes[s.eq].id;
  const sprite = sprites.spriteJoueur(id, frame, gauche);
  const gants = sprites.spriteJoueur(id, frame, gauche, true);
  const tw = M.tileW * e;
  const th = M.tileH * e;
  // les pieds du sprite sur la position du joueur (4 px sous son centre)
  const piedX = gauche ? M.tileW - 1 - M.pied.x : M.pied.x;
  let bx = s.x - (piedX + 0.5) * e;
  const by = s.y + 4 - M.pied.y * e;
  if (s.sonne > 0) bx += Math.sin(temps * 40);
  const teteY = by + (2 + bob) * e;
  const mainX = bx + ((gauche ? M.tileW - 1 - M.gants.x : M.gants.x) + 0.5) * e;
  const mainY = by + (M.gants.y + bob + 0.5) * e;

  // --- géométrie de la crosse selon le geste en cours
  const sp = pointCrosse(s);
  let talon = { x: sp.x - dir * 2.5, y: sp.y + 1 };
  let bout = { x: sp.x + dir * 2.5, y: sp.y + 1 };
  let derriere = sp.y < s.y; // palette « plus loin » que le joueur : dessinée avant lui
  // crosse orientée d'un angle `a` (degrés, 90 = vers la glace, 180 = vers l'arrière)
  const oriente = (a: number) => {
    const r = (a * Math.PI) / 180;
    const cx = Math.cos(r) * dir;
    const cy = Math.sin(r);
    talon = { x: mainX + cx * LONG_CROSSE, y: mainY + cy * LONG_CROSSE };
    // la palette part à angle droit du manche, vers l'avant quand la crosse est au sol
    bout = { x: talon.x + Math.sin(r) * dir * 4, y: talon.y - Math.cos(r) * 4 };
    derriere = false;
  };
  if (s.arme) {
    // armé : la crosse remonte par-dessus l'épaule à mesure que le tir se charge
    // (vite en arrière au début, puis de plus en plus haut)
    oriente(ANGLE_SOL + (ANGLE_ARME - ANGLE_SOL) * Math.sqrt(Math.min(1, s.charge)));
  } else if (s.frappe > 0) {
    // frappe : la crosse redescend sur la glace puis accompagne vers l'avant,
    // d'autant plus haut que le geste est fort
    const amp = s.frappeAmp;
    const u = Math.min(1, 1 - s.frappe / (amp > 0.5 ? FRAPPE_TIR : FRAPPE_PASSE));
    const depart = ANGLE_SOL + (ANGLE_ARME - ANGLE_SOL) * Math.sqrt(amp);
    oriente(u < 0.2 ? lerp(depart, 95, u / 0.2) : 95 - 135 * amp * Math.sin(((u - 0.2) / 0.8) * Math.PI));
  } else if (s.pokeT > 0) {
    // poke-check : la palette part loin devant, au ras de la glace
    const k = 1 + (Math.max(0, s.pokeT) / 0.3) * 1.3;
    talon = { x: s.x + (sp.x - s.x) * k - dir * 2.5, y: s.y + (sp.y - s.y) * k + 1 };
    bout = { x: talon.x + dir * 5, y: talon.y };
  }
  const crosse = () => dessineCrosse(g, e, mainX, mainY, talon.x, talon.y, bout.x, bout.y);
  const corps = (dx = 0, dy = 0) => {
    if (sprite) g.drawImage(sprite.img, sprite.rect.sx, sprite.rect.sy, sprite.rect.sw, sprite.rect.sh, bx + dx, by + dy, tw, th);
  };

  // indicateur « c'est vous » : toujours visible, même en tenant le palet — une
  // couleur fixe (jamais celle d'un maillot) pour ne se confondre ni avec une
  // équipe ni avec le marquage doré du porteur du palet ci-dessous.
  if (estControle) {
    haloSol(g, s.x, s.y + 4, 7, COULEUR_CONTROLE, 0.5 + 0.25 * Math.sin(temps * 6));
  }
  // indicateur « porte le palet » : flaque de lumière douce + anneau net au sol,
  // plus le palet qui rebondit au-dessus de la tête — la flaque se repère de loin,
  // même à moitié cachée derrière d'autres joueurs dans une mêlée.
  if (s.tient) {
    lueurSol(g, s.x, s.y + 4, 10, C.or, 0.45 + 0.15 * Math.sin(temps * 8));
    haloSol(g, s.x, s.y + 4, 6, C.or, 0.85 + 0.15 * Math.sin(temps * 8));
    badgePalet(g, Math.round(s.x), teteY - 4, temps);
  }
  // tir spécial chargé (combo de passes) : petite flamme pulsante au-dessus du porteur
  if (s.tient && specialPret) {
    const rebond = Math.abs(Math.sin(temps * 9)) * 2;
    const fx = Math.round(s.x);
    const fy = teteY - 10 - rebond;
    px(g, fx - 2, fy - 2, 5, 5, C.contour);
    px(g, fx - 1, fy - 1, 3, 3, '#ff8a3d');
    px(g, fx, fy - 2, 1, 1, '#ffd35c');
  }

  if (derriere) crosse();
  corps();
  if (!derriere) {
    crosse();
    // les gants repassent par-dessus le manche
    if (gants) g.drawImage(gants.img, gants.rect.sx, gants.rect.sy, gants.rect.sw, gants.rect.sh, bx, by, tw, th);
  }

  if (s.sonne > 0) {
    for (let i = 0; i < 3; i++) {
      const a = temps * 6 + i * 2.1;
      px(g, s.x + Math.cos(a) * 6, teteY - 1 + Math.sin(a) * 2, 1, 1, C.or);
    }
  }
  if (s.elanT > 0) {
    g.globalAlpha = 0.35;
    corps(-s.vx * 0.04, -s.vy * 0.04);
    g.globalAlpha = 1;
  }
  if (estControle) {
    // double chevron au-dessus du joueur, pour ne jamais le perdre de vue —
    // plus gros que le halo au sol, il reste lisible même dans une mêlée.
    repereControle(g, Math.round(s.x), teteY - 9 + Math.round(Math.sin(temps * 6)));
  } else if (s.humain) {
    // l'adversaire humain d'une partie en réseau : simple chevron à ses couleurs
    repereControle(g, Math.round(s.x), teteY - 9, equipes[s.eq].clair, true);
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
  if (s.arme) {
    const w = 13;
    const x = Math.round(s.x) - 6;
    const y = teteY - (s.humain ? 13 : 7);
    px(g, x - 1, y - 1, w + 2, 4, C.contour);
    px(g, x, y, w, 2, '#2a2f4a');
    const c = s.charge > 0.85 ? (Math.floor(temps * 20) & 1 ? '#ffffff' : '#ff5a4e') : s.charge > 0.5 ? '#ffb13b' : '#ffe27a';
    px(g, x, y, Math.max(1, Math.round(w * s.charge)), 2, c);
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
  const e = sprites.meta.echelle;
  const gauche = gk.eq === 1;
  const sprite = sprites.spriteGardien(equipes[gk.eq].id, gauche);
  const piedX = gauche ? M.tileW - 1 - M.pied.x : M.pied.x;
  const bx = gk.x - (piedX + 0.5) * e + Math.sin(temps * 60) * gk.secoue;
  const by = gk.y + 4 - M.pied.y * e;
  if (sprite) g.drawImage(sprite.img, sprite.rect.sx, sprite.rect.sy, sprite.rect.sw, sprite.rect.sh, bx, by, M.tileW * e, M.tileH * e);
}

export function dessinePalet(g: CanvasRenderingContext2D, p: Puck): void {
  const v = Math.hypot(p.vx, p.vy);
  if (!p.porteur && v > 170) {
    g.globalCompositeOperation = 'lighter';
    const n = p.trace.length;
    for (let i = 0; i < n; i++) {
      const t = p.trace[i]!;
      g.globalAlpha = (i / n) * 0.6;
      g.fillStyle = v > 330 ? '#ffb04a' : '#8fe3ff';
      g.fillRect(Math.round(t.x) - 1, Math.round(t.y), 2, 1);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
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
