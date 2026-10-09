import { resumeNotes } from '@core/stats';
import type { TeamProfile } from '@core/teams';
import { obtientLogo } from './logos';
import { texte } from './pixel-font';
import { px } from './primitives';
import type { BanqueSprites } from './sprites';
import { C } from './theme';
import { couleurNom, palette, type TeamDef, type Variante } from './team-visuals';
import { basculeStar, basculeStats, COULEUR_PATINEUR, COULEUR_STAR, dessineRadar, etoile, modeStats, notesDuProfil } from './stats-ecran';
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
  onRetour: () => void;
}

/** Les trois notes du résumé : moyennes sur tous les patineurs (le joueur star compris) et le gardien. */
export function notesEquipe(p: TeamProfile): { attaque: number; defense: number; globale: number } {
  return resumeNotes(p);
}

export function fleche(g: CanvasRenderingContext2D, boutons: ZoneBouton[], x: number, y: number, taille: number, versDroite: boolean, act: () => void): void {
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

/** « VOUS » calé à gauche, « ADVERSAIRE » à droite : le titre d'écran garde le centre. */
function titrePanneau(g: CanvasRenderingContext2D, titre: string, x: number, w: number): void {
  if (x === 0) texte(g, titre, x + 6, 2, C.gris, 1, 'g');
  else texte(g, titre, x + w - 6, 2, C.gris, 1, 'd');
}

// ============================================== étape 1 : les équipes ======

export interface OptionsPanneauEquipe {
  /** Fraction de la hauteur d'écran occupée par le logo. */
  echelleLogo?: number;
  /** Position verticale des notes, en fraction de la hauteur d'écran. */
  hauteurNotes?: number;
}

export function dessinePanneauEquipe(
  g: CanvasRenderingContext2D,
  boutons: ZoneBouton[],
  x: number,
  w: number,
  H: number,
  titre: string,
  carte: CarteEquipe,
  onPrecedent: (() => void) | null,
  onSuivant: (() => void) | null,
  opts: OptionsPanneauEquipe = {},
): void {
  const cx = x + w / 2;
  titrePanneau(g, titre, x, w);
  // chaque moitié d'écran a son propre mode STATS : on compare deux équipes côte à côte
  const cote = x === 0 ? 0 : 1;
  const mode = modeStats(cote);
  const def = carte.def;
  const pal = def.interieur;
  const notes = notesEquipe(carte.profil);
  const statsY = Math.round(H * (opts.hauteurNotes ?? 0.7));
  let yNotes = statsY;

  if (mode) {
    // le radar à la place de l'écusson : code et nom, profil montré, radar ; les flèches
    // passent du patineur normal au joueur star (pour changer d'équipe : bouton EQUIPE)
    texte(g, def.code, cx, 13, couleurNom(pal), 1, 'c');
    texte(g, def.nom, cx, 22, C.gris, 1, 'c');
    const yb = 33;
    const etiquette = mode.star ? 'JOUEUR STAR' : 'JOUEUR';
    const lw = etiquette.length * 6 - 1;
    texte(g, etiquette, cx, yb, mode.star ? COULEUR_STAR : COULEUR_PATINEUR, 1, 'c');
    if (mode.star) {
      etoile(g, cx - Math.round(lw / 2) - 11, yb - 1, COULEUR_STAR);
      etoile(g, cx + Math.round(lw / 2) + 4, yb - 1, COULEUR_STAR);
    }
    const haut = yb + 8 + 12;
    const bas = statsY - 14;
    const R = Math.max(18, Math.min(Math.round((bas - haut) / 2.1), Math.round(w * 0.2)));
    const cy = Math.round(haut + (bas - haut) / 2 + 2);
    dessineRadar(g, cx, cy, R, notesDuProfil(carte.profil, mode.star), mode.star);
    const tf = 20;
    const yf = cy - Math.round(tf / 2);
    fleche(g, boutons, x + 4, yf, tf, false, () => basculeStar(cote));
    fleche(g, boutons, x + w - 4 - tf, yf, tf, true, () => basculeStar(cote));
  } else {
    // Le logo grossit avec la hauteur dispo, pour occuper tout le panneau plutôt
    // que de rester tassé en haut — les flèches restent calées sur son centre.
    const tailleLogo = Math.round(H * (opts.echelleLogo ?? 0.5));
    const logoY = 13;
    const tailleFleche = Math.round(tailleLogo * 0.3);
    const yFleche = Math.round(logoY + (tailleLogo - tailleFleche) / 2);
    if (onPrecedent) fleche(g, boutons, x + 4, yFleche, tailleFleche, false, onPrecedent);
    if (onSuivant) fleche(g, boutons, x + w - 4 - tailleFleche, yFleche, tailleFleche, true, onSuivant);
    const logo = obtientLogo(def.id);
    if (logo) {
      g.imageSmoothingEnabled = true;
      g.drawImage(logo, cx - tailleLogo / 2, logoY, tailleLogo, tailleLogo);
      g.imageSmoothingEnabled = false;
    }
    let y = logoY + tailleLogo + 5;
    px(g, cx - tailleLogo / 2 - 3, y - 1, tailleLogo + 6, 4, '#c9d2e3');
    px(g, cx - tailleLogo / 2 - 2, y, tailleLogo + 4, 2, pal.maillot);
    y += 8;
    texte(g, def.code, cx, y, couleurNom(pal), 1, 'c');
    y += 9;
    texte(g, def.nom, cx, y, C.gris, 1, 'c');
    yNotes = Math.max(y + 12, statsY);
  }

  // les quatre notes du résumé : gardien, défense, attaque, globale
  const cols: [string, number, string][] = [
    ['GAR', carte.profil.gardien, '#7be08a'],
    ['DEF', notes.defense, '#6fd0ff'],
    ['ATT', notes.attaque, '#ff8a3d'],
    ['GLB', notes.globale, C.or],
  ];
  const pad = 6;
  const colW = (w - pad * 2) / cols.length;
  cols.forEach(([label, valeur, couleur], i) => {
    const cxi = x + pad + colW * i + colW / 2;
    texte(g, String(valeur), cxi, yNotes + 2, couleur, 2, 'c');
    texte(g, label, cxi, yNotes + 19, C.gris, 1, 'c');
  });
  bouton(g, boutons, mode ? 'EQUIPE' : 'STATS', cx - 28, yNotes + 30, 56, 13, () => basculeStats(cote), { couleur: '#232a58' });
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

  bouton(g, boutons, '< RETOUR', 4, boutonY, 60, 16, etat.onRetour, { couleur: '#232a58', e: 1 });
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

export function dessinePanneauMaillot(
  g: CanvasRenderingContext2D,
  boutons: ZoneBouton[],
  sprites: BanqueSprites,
  x: number,
  w: number,
  H: number,
  titre: string,
  cote: CoteMaillot,
  faceDroite: boolean,
  onToggle: (() => void) | null,
): void {
  const cx = x + w / 2;
  titrePanneau(g, titre, x, w);

  const def = cote.def;
  const pal = palette(def, cote.variante);
  // le bloc (nom, joueur, bouton du maillot) est centré verticalement entre
  // le bandeau du haut et les boutons RETOUR / JOUER
  const hautBloc = 16;
  const hauteurBloc = 144;
  const zoneHaut = 12;
  const zoneBas = H - 26;
  const dy = Math.max(0, Math.round(zoneHaut + (zoneBas - zoneHaut - hauteurBloc) / 2 - hautBloc));
  texte(g, def.code, cx, hautBloc + dy, couleurNom(def.interieur), 2, 'c');

  // le joueur, de face, porte le maillot choisi ; crosse vers l'extérieur de l'écran
  // (à gauche pour le panneau de gauche : le dessin d'origine la tient à droite)
  const spriteId = `${def.id}-${cote.variante}`;
  const M = sprites.meta.portrait;
  const sprite = sprites.spritePortrait(spriteId, faceDroite);
  const sh = 96;
  const echelle = sh / M.tileH;
  const sw = M.tileW * echelle;
  const sy = 36 + dy;
  if (sprite) {
    g.drawImage(sprite.img, sprite.rect.sx, sprite.rect.sy, sprite.rect.sw, sprite.rect.sh, Math.round(cx - sw / 2), sy, sw, sh);
  }

  const label = cote.variante === 'interieur' ? 'DOMICILE' : 'EXTERIEUR';
  if (onToggle) bouton(g, boutons, `< ${label} >`, cx - 48, sy + sh + 8, 96, 14, onToggle, { couleur: '#232a58' });
  else texte(g, label, cx, sy + sh + 11, C.gris, 1, 'c');
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
