import { clamp } from '@core/utils';
import type { TeamProfile } from '@core/teams';
import { obtientLogo } from './logos';
import { texte } from './pixel-font';
import { px } from './primitives';
import type { BanqueSprites } from './sprites';
import { C } from './theme';
import { palette, type TeamDef, type Variante } from './team-visuals';
import { bouton, type ZoneBouton } from './widgets';

export interface CarteEquipe {
  def: TeamDef;
  profil: TeamProfile;
}

export interface EtatSelectionEquipe {
  joueur: CarteEquipe;
  adversaire: CarteEquipe;
  onPrecedentJoueur: () => void;
  onSuivantJoueur: () => void;
  onPrecedentAdversaire: () => void;
  onSuivantAdversaire: () => void;
  onConfirmer: () => void;
}

/** Convertit un multiplicateur de stat (~0.85..1.15) en note façon jeu de sport (65..99). */
function note(x: number): number {
  return Math.round(clamp((x - 0.85) / 0.3, 0, 1) * 34 + 65);
}

export function notesEquipe(p: TeamProfile): { attaque: number; defense: number; globale: number } {
  return {
    attaque: note((p.vit + p.tir) / 2),
    defense: note((p.defense + p.gardien) / 2),
    globale: note((p.vit + p.tir + p.defense + p.gardien) / 4),
  };
}

function fleche(g: CanvasRenderingContext2D, boutons: ZoneBouton[], x: number, y: number, taille: number, versDroite: boolean, act: () => void): void {
  const w = taille;
  const h = taille;
  g.fillStyle = C.contour;
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = '#232a58';
  g.fillRect(x, y, w, h);
  const cx = x + w / 2;
  const cy = y + h / 2;
  g.fillStyle = C.blanc;
  const s = Math.floor(taille * 0.28);
  for (let i = 0; i < s; i++) {
    const dx = versDroite ? i : -i;
    px(g, cx + dx - 1, cy - (s - i), 2, 1, C.blanc);
    px(g, cx + dx - 1, cy + (s - i), 2, 1, C.blanc);
  }
  boutons.push({ x, y, w, h, act });
}

// ============================================== étape 1 : les équipes ======

function dessinePanneauEquipe(
  g: CanvasRenderingContext2D,
  boutons: ZoneBouton[],
  x: number,
  w: number,
  H: number,
  titre: string,
  carte: CarteEquipe,
  onPrecedent: () => void,
  onSuivant: () => void,
): void {
  const cx = x + w / 2;
  texte(g, titre, cx, 5, C.gris, 1, 'c');

  // Le logo grossit avec la hauteur dispo, pour occuper tout le panneau plutôt
  // que de rester tassé en haut — les flèches restent calées sur son centre.
  const tailleLogo = Math.round(H * 0.32);
  const logoY = Math.round(H * 0.1);
  const tailleFleche = Math.round(tailleLogo * 0.32);
  const yFleche = Math.round(logoY + (tailleLogo - tailleFleche) / 2);
  fleche(g, boutons, x + 4, yFleche, tailleFleche, false, onPrecedent);
  fleche(g, boutons, x + w - 4 - tailleFleche, yFleche, tailleFleche, true, onSuivant);

  const def = carte.def;
  const pal = def.interieur;
  const logo = obtientLogo(def.id);
  if (logo) {
    g.imageSmoothingEnabled = true;
    g.drawImage(logo, cx - tailleLogo / 2, logoY, tailleLogo, tailleLogo);
    g.imageSmoothingEnabled = false;
  }
  let y = logoY + tailleLogo + 5;
  px(g, cx - tailleLogo / 2 - 2, y, tailleLogo + 4, 2, pal.maillot);
  y += 8;
  texte(g, def.code, cx, y, pal.clair, 1, 'c');
  y += 9;
  texte(g, def.nom, cx, y, C.gris, 1, 'c');
  y += 14;
  texte(g, '< > POUR CHANGER', cx, y, '#4f5780', 1, 'c');

  const notes = notesEquipe(carte.profil);
  const statsY = Math.round(H * 0.68);
  const cols: [string, number, string][] = [
    ['ATT', notes.attaque, '#ff8a3d'],
    ['DEF', notes.defense, '#6fd0ff'],
    ['GLB', notes.globale, C.or],
  ];
  const pad = 18;
  const colW = (w - pad * 2) / 3;
  cols.forEach(([label, valeur, couleur], i) => {
    const cxi = x + pad + colW * i + colW / 2;
    texte(g, String(valeur), cxi, statsY, couleur, 3, 'c');
    texte(g, label, cxi, statsY + 21, C.gris, 1, 'c');
  });
}

export function dessineSelectionEquipe(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, etat: EtatSelectionEquipe): void {
  g.fillStyle = 'rgba(7,9,20,0.78)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  texte(g, 'CHOISISSEZ VOS EQUIPES', cx, 2, C.blanc, 1, 'c');

  const moitie = Math.floor(W / 2);
  const boutonY = H - 22;
  px(g, moitie - 1, 12, 1, boutonY - 16, '#2a3160');
  dessinePanneauEquipe(g, boutons, 0, moitie, H, 'VOUS', etat.joueur, etat.onPrecedentJoueur, etat.onSuivantJoueur);
  dessinePanneauEquipe(g, boutons, moitie, W - moitie, H, 'ADVERSAIRE', etat.adversaire, etat.onPrecedentAdversaire, etat.onSuivantAdversaire);

  bouton(g, boutons, 'JOUER', cx - 45, boutonY, 90, 16, etat.onConfirmer, {
    e: 2,
    couleur: '#d12f4c',
    clair: '#ff7a90',
    fonce: '#8c1b3a',
  });
}

// ============================================== étape 2 : les maillots =====

export interface CoteMaillot {
  def: TeamDef;
  variante: Variante;
}

export interface EtatChoixMaillots {
  joueur: CoteMaillot;
  adversaire: CoteMaillot;
  onToggleJoueur: () => void;
  onToggleAdversaire: () => void;
  onRetour: () => void;
  onConfirmer: () => void;
}

function dessinePanneauMaillot(
  g: CanvasRenderingContext2D,
  boutons: ZoneBouton[],
  sprites: BanqueSprites,
  x: number,
  w: number,
  H: number,
  titre: string,
  cote: CoteMaillot,
  faceDroite: boolean,
  onToggle: () => void,
): void {
  const cx = x + w / 2;
  texte(g, titre, cx, 5, C.gris, 1, 'c');

  const def = cote.def;
  const pal = palette(def, cote.variante);
  const tailleLogo = 22;
  const logo = obtientLogo(def.id);
  if (logo) {
    g.imageSmoothingEnabled = true;
    g.drawImage(logo, cx - tailleLogo / 2, 8, tailleLogo, tailleLogo);
    g.imageSmoothingEnabled = false;
  }
  texte(g, def.code, cx, 32, C.gris, 1, 'c');

  // le joueur porte le maillot choisi, tourné vers le centre de l'écran
  const spriteId = `${def.id}-${cote.variante}`;
  const sprite = sprites.spriteJoueur(spriteId, 0, !faceDroite);
  const echelle = 3;
  const { w: tw, h: th } = sprites.tailleJoueur;
  const sw = tw * echelle;
  const sh = th * echelle;
  const sy = 42;
  if (sprite) {
    g.drawImage(sprite.img, sprite.rect.sx, sprite.rect.sy, sprite.rect.sw, sprite.rect.sh, cx - sw / 2, sy, sw, sh);
  }

  const label = cote.variante === 'interieur' ? 'DOMICILE' : 'EXTERIEUR';
  bouton(g, boutons, `< ${label} >`, cx - 48, sy + sh + 8, 96, 14, onToggle, { couleur: '#232a58' });
  px(g, cx - 30, sy + sh + 26, 60, 2, pal.maillot);
}

export function dessineChoixMaillots(
  g: CanvasRenderingContext2D,
  boutons: ZoneBouton[],
  sprites: BanqueSprites,
  W: number,
  H: number,
  etat: EtatChoixMaillots,
): void {
  g.fillStyle = 'rgba(7,9,20,0.78)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  texte(g, 'CHOISISSEZ LES MAILLOTS', cx, 2, C.blanc, 1, 'c');

  const moitie = Math.floor(W / 2);
  const boutonY = H - 22;
  px(g, moitie - 1, 12, 1, boutonY - 16, '#2a3160');
  dessinePanneauMaillot(g, boutons, sprites, 0, moitie, H, 'VOUS', etat.joueur, true, etat.onToggleJoueur);
  dessinePanneauMaillot(g, boutons, sprites, moitie, W - moitie, H, 'ADVERSAIRE', etat.adversaire, false, etat.onToggleAdversaire);

  bouton(g, boutons, '< RETOUR', 4, boutonY, 60, 16, etat.onRetour, { couleur: '#232a58', e: 1 });
  bouton(g, boutons, 'JOUER', cx - 45, boutonY, 90, 16, etat.onConfirmer, {
    e: 2,
    couleur: '#d12f4c',
    clair: '#ff7a90',
    fonce: '#8c1b3a',
  });
}
