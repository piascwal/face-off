/** Salle d'attente Wi-Fi (sièges, spectateurs) et choix du rôle à l'arrivée. */

import { DUREES, EFFECTIFS, NIVEAUX } from '@core/constants';
import type { BonusEquipe } from '@core/types';
import type { FormatLan } from '@net/partie';
import { qualitePing, texteLatence } from '@piascwal/lan-kit';
import { texte } from './pixel-font';
import { px } from './primitives';
import type { BanqueSprites } from './sprites';
import { C } from './theme';
import { bouton, panneau, type ZoneBouton } from './widgets';
import { LIBELLES_BONUS, LIBELLES_FORMAT, oui, points, ROUGE, VERT, type ResumeConfig } from './lan-commun';

// =========================================================== salle d'attente ==

/** Un siège de la salle d'attente (A1, A2, B1, B2) ; `null` dans `EtatSalon.places` s'il n'existe pas dans ce format. */
export interface PlaceSalon {
  joueur: { nom: string; moi: boolean; hote: boolean; /** sa latence vue par l'hôte (ms), si elle est connue */ ping: number | null } | null;
  /** Prendre ce siège libre (jamais pour l'hôte, assis d'office). */
  onPrendre: (() => void) | null;
  /** Hôte : exclure ce joueur. */
  onExclure: (() => void) | null;
}

export interface RegardeurSalon {
  nom: string;
  moi: boolean;
  /** Pas encore choisi entre jouer et regarder. */
  indecis: boolean;
}

export interface EtatSalon {
  hote: boolean;
  nomHote: string;
  format: FormatLan;
  /** Hôte : change le format. */
  onFormat: (() => void) | null;
  /** Portrait de chaque camp (« toulouse-interieur »). */
  maillots: [string, string];
  places: [PlaceSalon | null, PlaceSalon | null, PlaceSalon | null, PlaceSalon | null];
  spectateurs: RegardeurSalon[];
  spectateursMax: number;
  config: ResumeConfig;
  /** Un appareil est en train de se connecter (liaison pas encore ouverte). */
  connexionEnCours: boolean;
  /** Code de vérification de ma liaison avec l'hôte (ou de la dernière arrivée côté hôte). */
  code: string | null;
  latenceMs: number | null;
  /** Le salon en ligne : son code, à donner aux amis, et le partage du lien. */
  ligne: { code: string; copie: boolean; onPartage: () => void } | null;
  message: string | null;
  /** Handicap de chaque camp (l'hôte le règle, les autres le voient). */
  bonus: [BonusEquipe, BonusEquipe];
  onBonus: ((camp: 0 | 1) => void) | null;
  /** Bilan des duels précédents contre cet adversaire (1 contre 1), ou null. */
  bilan: string | null;
  /** Mon rôle : assis, spectateur, ou pas encore choisi. */
  moi: 'siege' | 'spect' | 'indecis';
  /** Hôte : lancer la partie (null pour les autres) ; `peutLancer` : il y a de quoi jouer. */
  onLancer: (() => void) | null;
  peutLancer: boolean;
  /** Quitter mon siège pour regarder. */
  onRegarder: (() => void) | null;
  onQuitter: () => void;
}

const TAG_HOTE = '#ffd35c';
const TAG_JOUEUR = '#5cf08a';

/** Une carte de siège : le joueur de face, son nom, son rôle ; ou un siège libre. */
function carteSiege(
  g: CanvasRenderingContext2D,
  boutons: ZoneBouton[],
  sprites: BanqueSprites,
  x: number,
  y: number,
  w: number,
  h: number,
  p: PlaceSalon,
  maillot: string,
  miroir: boolean,
  temps: number,
): void {
  panneau(g, x, y, w, h);
  const j = p.joueur;
  if (j) {
    px(g, x, y, w, 2, j.moi ? C.blanc : j.hote ? TAG_HOTE : TAG_JOUEUR);
    const M = sprites.meta.portrait;
    const sp = sprites.spritePortrait(maillot, miroir);
    const sh = Math.min(44, h - 28);
    const sw = Math.round((M.tileW * sh) / M.tileH);
    if (sp) g.drawImage(sp.img, sp.rect.sx, sp.rect.sy, sp.rect.sw, sp.rect.sh, Math.round(x + w / 2 - sw / 2), y + 5, sw, sh);
    texte(g, j.nom, x + w / 2, y + 6 + sh, C.blanc, 1, 'c');
    const ty = y + h - 11;
    px(g, x + 8, ty, w - 16, 9, j.hote ? TAG_HOTE : TAG_JOUEUR);
    texte(g, j.moi ? (j.hote ? 'HOTE - VOUS' : 'VOUS') : j.hote ? 'HOTE' : 'JOUEUR', x + w / 2, ty + 1, '#06101a', 1, 'c', null);
    if (!j.hote) {
      const q = qualitePing(j.ping);
      const couleur = q === 'bon' ? TAG_JOUEUR : q === 'moyen' ? C.or : q === 'mauvais' ? '#ff7a90' : C.gris;
      texte(g, texteLatence(j.ping), x + w - (p.onExclure ? 14 : 4), y + 5, couleur, 1, 'd', null);
    }
    if (p.onExclure) bouton(g, boutons, 'X', x + w - 12, y + 4, 9, 9, p.onExclure, { couleur: '#6a1f33', clair: '#a8374f', fonce: '#44111f', texte: C.blanc });
    return;
  }
  // siège libre : points qui pulsent, et un bouton pour le prendre
  for (let i = 0; i < 3; i++) {
    g.globalAlpha = 0.3 + 0.7 * Math.max(0, Math.sin(temps * 4 - i * 0.8));
    px(g, x + w / 2 - 10 + i * 8, y + 12, 4, 4, p.onPrendre ? C.or : '#4a548c');
  }
  g.globalAlpha = 1;
  texte(g, 'LIBRE', x + w / 2, y + 24, p.onPrendre ? C.blanc : '#6f7aa6', 1, 'c');
  if (p.onPrendre) {
    bouton(g, boutons, 'PRENDRE', x + 8, y + h - 24, w - 16, 14, p.onPrendre, { couleur: '#1f7a46', clair: '#5cf08a', fonce: '#0f4a29' });
  } else {
    texte(g, 'CPU SI VIDE', x + w / 2, y + 36, '#4a548c', 1, 'c');
    px(g, x + 8, y + h - 11, w - 16, 9, '#2a3160');
    texte(g, 'EN ATTENTE', x + w / 2, y + h - 10, '#8a93b0', 1, 'c', null);
  }
}

/**
 * Salle d'attente, façon salon de jeu : les quatre sièges au centre (équipe A
 * à gauche, équipe B à droite), les spectateurs en bas. L'hôte règle le format
 * et lance ; chaque arrivant prend un siège libre ou regarde.
 */
export function dessineSalon(g: CanvasRenderingContext2D, boutons: ZoneBouton[], sprites: BanqueSprites, W: number, H: number, temps: number, etat: EtatSalon): void {
  g.fillStyle = 'rgba(7,9,20,0.84)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const coop = etat.format === 'coop';
  texte(g, "SALLE D'ATTENTE", cx, 2, C.blanc, 2, 'c');
  texte(g, `PARTIE DE ${etat.nomHote}`, 6, 4, C.gris, 1, 'g');
  if (etat.ligne) {
    texte(g, `SALON ${etat.ligne.code}`, 6, 13, C.or, 1, 'g');
    bouton(g, boutons, etat.ligne.copie ? 'OK !' : 'LIEN', 6, 22, 44, 11, etat.ligne.onPartage, { couleur: '#24995c', clair: '#5fe0a0', fonce: '#14603a' });
  }

  // format : l'hôte le change, les autres le voient
  const fy = 21;
  if (etat.onFormat) {
    texte(g, 'FORMAT', cx - 60, fy + 3, C.gris, 1, 'd');
    bouton(g, boutons, `< ${LIBELLES_FORMAT[etat.format]} >`, cx - 54, fy, 120, 12, etat.onFormat, { couleur: '#232a58', texte: coop ? VERT : C.or });
  } else {
    texte(g, LIBELLES_FORMAT[etat.format], cx, fy + 3, coop ? VERT : C.or, 1, 'c');
  }

  const bas = H - 18;
  // de bas en haut : spectateurs, état, résumé, handicap, puis les cartes
  const yFigures = H - 40;
  const yLabel = H - 50;
  const yEtat = yLabel - 11;
  const yResume = yEtat - 11;
  const yHandicap = yResume - 15;
  const yCartes = fy + 24;
  const hCartes = Math.max(54, yHandicap - 4 - yCartes);

  const cw = Math.min(88, Math.floor((W - 16 - 40) / 4));
  const gap = 5;
  const places = etat.places;
  const camps: { camp: 0 | 1; sieges: (0 | 1 | 2 | 3)[] }[] = [
    { camp: 0, sieges: ([0, 1] as const).filter((s) => places[s]) },
    { camp: 1, sieges: ([2, 3] as const).filter((s) => places[s]) },
  ];
  for (const { camp, sieges } of camps) {
    const n = Math.max(1, sieges.length);
    const largeur = n * cw + (n - 1) * gap;
    const x0 = camp === 0 ? cx - 20 - largeur : cx + 20;
    texte(g, camp === 0 ? 'EQUIPE A' : 'EQUIPE B', x0 + largeur / 2, fy + 14, camp === 0 ? '#ff9a5c' : '#6fb4ff', 1, 'c');
    if (!sieges.length) {
      // coop : en face, le CPU
      panneau(g, x0, yCartes, cw, hCartes);
      px(g, x0, yCartes, cw, 2, '#8a93b0');
      texte(g, 'ADVERSAIRE', x0 + cw / 2, yCartes + hCartes / 2 - 10, C.blanc, 1, 'c');
      texte(g, 'CPU', x0 + cw / 2, yCartes + hCartes / 2 + 2, C.or, 2, 'c');
      continue;
    }
    sieges.forEach((s, i) => carteSiege(g, boutons, sprites, x0 + i * (cw + gap), yCartes, cw, hCartes, places[s]!, etat.maillots[camp], camp === 0, temps));
  }
  texte(g, coop ? '+' : 'VS', cx, yCartes + hCartes / 2 - 6, coop ? VERT : C.or, 2, 'c');

  // handicap sous chaque camp : réglable par l'hôte, affiché chez les autres (pas de handicap en coop)
  if (!coop) {
    for (const { camp, sieges } of camps) {
      const n = Math.max(1, sieges.length);
      const largeur = n * cw + (n - 1) * gap;
      const x0 = camp === 0 ? cx - 20 - largeur : cx + 20;
      const b = etat.bonus[camp];
      const couleur = b === 'aucun' ? C.gris : C.or;
      if (etat.onBonus) bouton(g, boutons, `< ${LIBELLES_BONUS[b]} >`, x0, yHandicap, largeur, 12, () => etat.onBonus!(camp), { couleur: '#232a58', texte: couleur });
      else texte(g, LIBELLES_BONUS[b], x0 + largeur / 2, yHandicap + 3, couleur, 1, 'c');
    }
  } else {
    texte(g, `NIVEAU DU CPU : ${NIVEAUX[etat.config.niveauIdx]?.nom ?? 'NORMAL'}`, cx, yHandicap + 3, C.or, 1, 'c');
  }
  resumeConfigCourt(g, cx, yResume, etat.config);

  // ligne d'état : message, sinon bilan, sinon aide ; le code de vérification et la latence à droite
  const aide = etat.message ?? etat.bilan ?? aideSalon(etat);
  texte(g, aide, cx, yEtat, etat.message ? '#ff9a5c' : etat.bilan ? C.blanc : '#6f7aa6', 1, 'c');
  if (etat.code) {
    const ms = etat.latenceMs !== null ? `  PING ${Math.max(1, Math.round(etat.latenceMs))} MS` : '';
    texte(g, `CODE ${etat.code}${ms}`, W - 6, 4, '#6f7aa6', 1, 'd');
  }

  // spectateurs : figurines en bas, les indécis grisés
  texte(g, `SPECTATEURS ${etat.spectateurs.length}/${etat.spectateursMax}`, cx, yLabel, C.gris, 1, 'c');
  const n = etat.spectateursMax;
  const pas = Math.min(34, Math.floor((W - 150) / n));
  const xs = cx - (n * pas) / 2 + pas / 2;
  const sup = sprites.meta.supporters;
  for (let i = 0; i < n; i++) {
    const x = Math.round(xs + i * pas);
    const r = etat.spectateurs[i];
    if (!r) {
      px(g, x - 7, yFigures + 8, 14, 12, '#1a2150');
      texte(g, '?', x, yFigures + 10, '#3a4590', 1, 'c');
      continue;
    }
    const sp = sprites.spriteSupporter(etat.maillots[i % 2]!, i, false);
    const sh = 26;
    const sw = Math.round((sup.tileW * sh) / sup.tileH);
    if (sp) {
      g.globalAlpha = r.indecis ? 0.45 : 1;
      g.drawImage(sp.img, sp.rect.sx, sp.rect.sy, sp.rect.sw, sp.rect.sh, x - Math.round(sw / 2), yFigures - 2, sw, sh);
      g.globalAlpha = 1;
    }
    texte(g, r.indecis ? `${r.nom.slice(0, 5)}?` : r.nom.slice(0, Math.max(3, Math.floor((pas - 2) / 6))), x, yFigures + 26, r.moi ? C.or : r.indecis ? C.gris : C.blanc, 1, 'c');
  }

  bouton(g, boutons, '< QUITTER', 4, bas, 62, 14, etat.onQuitter, { couleur: '#232a58' });
  if (etat.onLancer) {
    if (etat.peutLancer) bouton(g, boutons, 'LANCER', W - 78, bas, 74, 14, etat.onLancer, { e: 1, ...ROUGE });
    else {
      g.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(temps * 2.5));
      texte(g, `EN ATTENTE${points(temps)}`, W - 41, bas + 3, '#6f7aa6', 1, 'c');
      g.globalAlpha = 1;
    }
  } else if (etat.onRegarder) {
    bouton(g, boutons, 'REGARDER', W - 78, bas, 74, 14, etat.onRegarder, { couleur: '#232a58', texte: '#8fe3ff' });
  }
}

function aideSalon(etat: EtatSalon): string {
  if (etat.hote) return etat.connexionEnCours ? 'UN JOUEUR ARRIVE...' : etat.peutLancer ? 'LANCEZ QUAND TOUT LE MONDE EST LA' : "ATTENDEZ QUE D'AUTRES REJOIGNENT";
  if (etat.moi === 'siege') return "EN ATTENTE DE L'HOTE";
  if (etat.moi === 'spect') return "VOUS REGARDEZ - TOUCHEZ UN SIEGE POUR JOUER";
  return 'PRENEZ UN SIEGE, OU REGARDEZ';
}

function resumeConfigCourt(g: CanvasRenderingContext2D, cx: number, y: number, c: ResumeConfig): void {
  const n = EFFECTIFS[c.effectifIdx] ?? 3;
  texte(g, `${n} CONTRE ${n}  ${(DUREES[c.dureeIdx] ?? 180) / 60} MIN  BONUS ${oui(c.pouvoirs)}  RALENTI ${oui(c.ralenti)}`, cx, y, C.blanc, 1, 'c');
}

// ====================================================== choix du rôle à l'arrivée ==

export interface EtatChoixRole {
  nomHote: string;
  /** Joueurs assis / places du format ; spectateurs présents. */
  joueurs: number;
  places: number;
  spectateurs: number;
  spectateursMax: number;
  /** Au moins un siège libre. */
  siegeLibre: boolean;
  /** Portrait montré sur la carte JOUER, et figurine sur la carte REGARDER. */
  maillot: string;
  onJouer: () => void;
  onRegarder: () => void;
  onQuitter: () => void;
}

/** À l'arrivée dans la salle d'attente : jouer (puis prendre un siège) ou regarder. */
export function dessineChoixRole(g: CanvasRenderingContext2D, boutons: ZoneBouton[], sprites: BanqueSprites, W: number, H: number, temps: number, etat: EtatChoixRole): void {
  g.fillStyle = 'rgba(7,9,20,0.84)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  texte(g, `PARTIE DE ${etat.nomHote}`, cx, 4, C.blanc, 2, 'c');
  texte(g, 'TU VEUX ...', cx, 28, C.gris, 1, 'c');
  const cw = 120;
  const y = 44;
  const h = Math.min(100, H - y - 50);
  const carte = (x: number, titre: string, sous: string, ligne: string, col: string, act: (() => void) | null, figure: () => void) => {
    panneau(g, x, y, cw, h);
    px(g, x, y, cw, 2, act ? col : '#4a548c');
    figure();
    texte(g, titre, x + cw / 2, y + h - 38, act ? col : '#6f7aa6', 2, 'c');
    texte(g, sous, x + cw / 2, y + h - 22, C.gris, 1, 'c');
    texte(g, ligne, x + cw / 2, y + h - 12, act ? C.blanc : '#ff9a5c', 1, 'c');
    if (act) boutons.push({ x, y, w: cw, h, act });
  };
  carte(
    cx - 14 - cw,
    'JOUER',
    'PRENDRE UN SIEGE',
    etat.siegeLibre ? `${etat.joueurs}/${etat.places} JOUEURS` : 'AUCUN SIEGE LIBRE',
    TAG_JOUEUR,
    etat.siegeLibre ? etat.onJouer : null,
    () => {
      const M = sprites.meta.portrait;
      const sp = sprites.spritePortrait(etat.maillot, false);
      const sh = Math.min(46, h - 54);
      const sw = Math.round((M.tileW * sh) / M.tileH);
      if (sp) g.drawImage(sp.img, sp.rect.sx, sp.rect.sy, sp.rect.sw, sp.rect.sh, cx - 14 - cw + cw / 2 - sw / 2, y + 6, sw, sh);
    },
  );
  const plein = etat.spectateurs >= etat.spectateursMax;
  carte(
    cx + 14,
    'REGARDER',
    'SPECTATEUR',
    `${etat.spectateurs}/${etat.spectateursMax} SPECTATEURS`,
    '#6fb4ff',
    plein ? null : etat.onRegarder,
    () => {
      const S = sprites.meta.supporters;
      const sp = sprites.spriteSupporter(etat.maillot, 1, false);
      const sh = Math.min(44, h - 54);
      const sw = Math.round((S.tileW * sh) / S.tileH);
      if (sp) g.drawImage(sp.img, sp.rect.sx, sp.rect.sy, sp.rect.sw, sp.rect.sh, cx + 14 + cw / 2 - sw / 2, y + 7, sw, sh);
    },
  );
  g.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(temps * 2.5));
  texte(g, 'VOUS POUVEZ CHANGER TANT QUE LA PARTIE N A PAS COMMENCE', cx, y + h + 8, '#6f7aa6', 1, 'c');
  g.globalAlpha = 1;
  bouton(g, boutons, '< RETOUR', 4, H - 18, 62, 14, etat.onQuitter, { couleur: '#232a58' });
}
