import { DUREES, EFFECTIFS, NIVEAUX } from '@core/constants';
import type { BonusEquipe, StatsMatch } from '@core/types';
import type { FormatLan } from '@net/partie';
import { largeurTexte, texte } from './pixel-font';
import { px } from './primitives';
import type { BanqueSprites } from './sprites';
import { dessinePanneauEquipe, dessinePanneauMaillot, type CarteEquipe } from './team-select';
import { couleurNom, type TeamDef, type Variante } from './team-visuals';
import { C } from './theme';
import { dessineStatsFin } from './screens';
import { bouton, panneau, type ZoneBouton } from './widgets';

// ======================================================== liste des parties ==

export interface LignePartie {
  nom: string;
  equipe: TeamDef;
  effectifIdx: number;
  dureeIdx: number;
  /** La partie est lancée : les sièges sont pris, on ne peut plus que regarder le match. */
  enCours: boolean;
  format: FormatLan;
  /** Joueurs déjà assis, et sièges du format. */
  joueurs: number;
  places: number;
  adverse: TeamDef | null;
  score: [number, number];
  spect: number;
  onRejoindre: () => void;
  onRegarder: () => void;
}

/** Libellés des formats de partie (voir net/partie). */
export const LIBELLES_FORMAT: Record<FormatLan, string> = {
  '1v1': '1 CONTRE 1',
  '2v1': '2 CONTRE 1',
  '1v2': '1 CONTRE 2',
  '2v2': '2 CONTRE 2',
  coop: 'COOP CONTRE CPU',
};
const COURT_FORMAT: Record<FormatLan, string> = { '1v1': '1V1', '2v1': '2V1', '1v2': '1V2', '2v2': '2V2', coop: 'COOP' };

export type StatutLan = 'recherche' | 'pret' | 'erreur' | 'connexion' | 'creation';

export interface EtatLan {
  statut: StatutLan;
  /** Ligne d'information ou d'erreur (partie complète, hôte parti...). */
  message: string | null;
  parties: LignePartie[];
  pseudo: string;
  onRetour: () => void;
  onActualiser: () => void;
  onCreer: () => void;
}

const points = (t: number) => '.'.repeat(1 + (Math.floor(t * 3) % 3));

/**
 * Écran « multijoueur Wi-Fi » : les parties hébergées sur le même réseau
 * apparaissent toutes seules (aucune adresse à saisir) ; le bouton
 * ACTUALISER relance la recherche.
 */
export function dessineLan(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, etat: EtatLan): void {
  g.fillStyle = 'rgba(7,9,20,0.84)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  texte(g, 'MULTIJOUEUR WIFI', cx, 4, C.blanc, 2, 'c');
  texte(g, "JUSQU'A 4 JOUEURS ET DES SPECTATEURS SUR LE MEME WIFI", cx, 22, '#6f7aa6', 1, 'c');

  const pw = Math.min(W - 16, 330);
  const x0 = cx - pw / 2;
  const y0 = 34;
  const ph = H - y0 - 30;
  panneau(g, x0, y0, pw, ph);
  texte(g, 'PARTIES SUR VOTRE RESEAU', x0 + 8, y0 + 5, C.gris, 1, 'g');
  texte(g, `VOUS : ${etat.pseudo}`, x0 + pw - 8, y0 + 5, C.or, 1, 'd');

  const occupe = etat.statut === 'connexion' || etat.statut === 'creation';
  const hLigne = 19;
  const max = Math.max(1, Math.floor((ph - 22) / hLigne));
  etat.parties.slice(0, max).forEach((p, i) => {
    const y = y0 + 17 + i * hLigne;
    const x = x0 + 6;
    const w = pw - 12;
    px(g, x - 1, y - 1, w + 2, 18, C.contour);
    px(g, x, y, w, 16, '#1c2350');
    px(g, x, y, w, 1, '#3a4590');
    px(g, x, y, 3, 16, p.enCours ? '#3fb4e8' : p.equipe.interieur.maillot);
    texte(g, p.nom, x + 8, y + 4, C.blanc, 1, 'g');
    if (p.enCours) {
      // partie lancée : le match en cours, à regarder en spectateur ; les
      // textes sont placés selon leur largeur (les noms d'équipe sont longs)
      const regarder = 'REGARDER >';
      const fin = x + w - 6 - largeurTexte(regarder) - 8;
      const debut = x + 8 + largeurTexte(p.nom) + 8;
      const match = `${p.equipe.code} ${p.score[0]}-${p.score[1]} ${p.adverse?.code ?? '?'}`;
      texte(g, match, debut, y + 4, C.blanc, 1, 'g');
      const nb = p.spect ? `${p.spect} SPECT.` : 'EN COURS';
      if (debut + largeurTexte(match) + 8 + largeurTexte(nb) <= fin) texte(g, nb, fin, y + 4, C.gris, 1, 'd');
      texte(g, regarder, x + w - 6, y + 4, '#3fb4e8', 1, 'd');
    } else {
      // salle d'attente : l'équipe de l'hôte, le format et les sièges pris (ce qui ne tient pas est omis)
      const rejoindre = 'REJOINDRE >';
      const fin = x + w - 6 - largeurTexte(rejoindre) - 8;
      let cur = x + 8 + largeurTexte(p.nom) + 8;
      const pose = (t: string, couleur: string) => {
        if (cur + largeurTexte(t) > fin) return;
        texte(g, t, cur, y + 4, couleur, 1, 'g');
        cur += largeurTexte(t) + 8;
      };
      pose(COURT_FORMAT[p.format], p.format === 'coop' ? VERT : C.or);
      pose(`${p.joueurs}/${p.places}`, C.blanc);
      pose(p.equipe.code, couleurNom(p.equipe.interieur));
      const n = EFFECTIFS[p.effectifIdx] ?? 3;
      pose(`${n}C${n} ${(DUREES[p.dureeIdx] ?? 180) / 60}MIN`, C.gris);
      texte(g, rejoindre, x + w - 6, y + 4, C.or, 1, 'd');
    }
    if (!occupe) boutons.push({ x, y, w, h: 16, act: p.enCours ? p.onRegarder : p.onRejoindre });
  });

  const my = y0 + ph / 2 - 8;
  if (etat.statut === 'recherche') {
    texte(g, `RECHERCHE DU RESEAU${points(temps)}`, cx, my, C.blanc, 1, 'c');
  } else if (etat.statut === 'creation') {
    texte(g, `CREATION DE LA PARTIE${points(temps)}`, cx, my, C.blanc, 1, 'c');
  } else if (etat.statut === 'pret' && !etat.parties.length) {
    const a = 0.5 + 0.5 * Math.sin(temps * 3);
    g.globalAlpha = 0.5 + a * 0.5;
    texte(g, `AUCUNE PARTIE POUR L'INSTANT${points(temps)}`, cx, my, C.blanc, 1, 'c');
    g.globalAlpha = 1;
    texte(g, 'CREEZ-EN UNE, OU ATTENDEZ QUE VOTRE AMI LA CREE', cx, my + 12, '#6f7aa6', 1, 'c');
  }
  if (etat.message) {
    const couleur = etat.statut === 'erreur' ? '#ff7a5c' : etat.statut === 'connexion' ? C.blanc : C.or;
    const y = etat.parties.length ? y0 + ph - 11 : my + (etat.statut === 'pret' ? 26 : 0);
    texte(g, etat.statut === 'connexion' ? `${etat.message}${points(temps)}` : etat.message, cx, y, couleur, 1, 'c');
  }

  const by = H - 22;
  bouton(g, boutons, '< RETOUR', x0, by, 70, 16, etat.onRetour, { couleur: '#232a58' });
  if (!occupe) {
    bouton(g, boutons, 'ACTUALISER', cx - 45, by, 90, 16, etat.onActualiser, { couleur: '#1f7fb3', clair: '#6fd0ff', fonce: '#0f4d73' });
    bouton(g, boutons, 'CREER UNE PARTIE', x0 + pw - 112, by, 112, 16, etat.onCreer, { couleur: '#d12f4c', clair: '#ff7a90', fonce: '#8c1b3a' });
  }
}

// ======================================================= réglages de l'hôte ==

export interface EtatConfigLan {
  /** Combien d'humains de chaque côté (le CPU tient les places vides). */
  format: FormatLan;
  /** Niveau du CPU en coop (index dans NIVEAUX). */
  niveauIdx: number;
  onFormat: () => void;
  onNiveau: () => void;
  effectifIdx: number;
  dureeIdx: number;
  assistTir: boolean;
  assistPasse: boolean;
  changementAuto: boolean;
  ralenti: boolean;
  pouvoirs: boolean;
  onEffectif: () => void;
  onDuree: () => void;
  onAssistTir: () => void;
  onAssistPasse: () => void;
  onChangementAuto: () => void;
  onRalenti: () => void;
  onPouvoirs: () => void;
  onRetour: () => void;
  onCreer: () => void;
}

const oui = (b: boolean) => (b ? 'OUI' : 'NON');
const ROUGE = { couleur: '#d12f4c', clair: '#ff7a90', fonce: '#8c1b3a' };
const BLEU = { couleur: '#1f7fb3', clair: '#6fd0ff', fonce: '#0f4d73' };
const VERT = '#5ce68a';

/** Avant d'annoncer la partie, l'hôte règle le format du match (il vaut pour les deux joueurs). */
export function dessineConfigLan(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, etat: EtatConfigLan): void {
  g.fillStyle = 'rgba(7,9,20,0.84)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  texte(g, 'NOUVELLE PARTIE WIFI', cx, 4, C.blanc, 2, 'c');
  const pw = 230;
  const n = EFFECTIFS[etat.effectifIdx] ?? 3;
  const lignes: [string, string, () => void][] = [
    ['FORMAT', LIBELLES_FORMAT[etat.format], etat.onFormat],
    ...(etat.format === 'coop' ? ([['NIVEAU DU CPU', NIVEAUX[etat.niveauIdx]?.nom ?? 'NORMAL', etat.onNiveau]] as [string, string, () => void][]) : []),
    ['EQUIPES', `${n} CONTRE ${n}`, etat.onEffectif],
    ['DUREE', `${(DUREES[etat.dureeIdx] ?? 180) / 60} MIN`, etat.onDuree],
    ['ASSISTANCE TIR', oui(etat.assistTir), etat.onAssistTir],
    ['ASSISTANCE PASSE', oui(etat.assistPasse), etat.onAssistPasse],
    ['CHGT AUTO JOUEUR', oui(etat.changementAuto), etat.onChangementAuto],
    ['RALENTI DES BUTS', oui(etat.ralenti), etat.onRalenti],
    ['BONUS', oui(etat.pouvoirs), etat.onPouvoirs],
  ];
  const pas = 14;
  const ph = 8 + lignes.length * pas;
  const py = 22;
  panneau(g, cx - pw / 2, py, pw, ph);
  lignes.forEach(([k, v, act], i) => {
    const y = py + 5 + i * pas;
    texte(g, k, cx - pw / 2 + 10, y + 3, C.gris, 1, 'g');
    bouton(g, boutons, `< ${v} >`, cx + pw / 2 - 110, y, 100, 12, act, { couleur: '#232a58', texte: i === 0 && etat.format === 'coop' ? VERT : undefined });
  });
  const note = etat.format === 'coop' ? 'VOUS JOUEZ ENSEMBLE CONTRE LE CPU' : etat.format === '1v1' ? 'CES REGLAGES VALENT POUR TOUS LES JOUEURS' : "L'HOTE REGLE EQUIPES ET MAILLOTS POUR TOUS";
  texte(g, note, cx, py + ph + 6, etat.format === 'coop' ? VERT : '#6f7aa6', 1, 'c');
  const by = H - 22;
  bouton(g, boutons, '< RETOUR', cx - pw / 2, by, 70, 16, etat.onRetour, { couleur: '#232a58' });
  bouton(g, boutons, 'CREER LA PARTIE', cx + pw / 2 - 112, by, 112, 16, etat.onCreer, ROUGE);
}

export interface ResumeConfig {
  format: FormatLan;
  niveauIdx: number;
  effectifIdx: number;
  dureeIdx: number;
  assistTir: boolean;
  assistPasse: boolean;
  changementAuto: boolean;
  ralenti: boolean;
  pouvoirs: boolean;
}

/** Libellés des handicaps (voir core BonusEquipe). */
export const LIBELLES_BONUS: Record<BonusEquipe, string> = {
  aucun: 'SANS AIDE',
  gardien: 'GARDIEN +20%',
  vitesse: 'VITESSE +10%',
  tir: 'TIR PUISSANT',
  but: "1 BUT D'AVANCE",
};

// =========================================================== salle d'attente ==

/** Un siège de la salle d'attente (A1, A2, B1, B2) ; `null` dans `EtatSalon.places` s'il n'existe pas dans ce format. */
export interface PlaceSalon {
  joueur: { nom: string; moi: boolean; hote: boolean } | null;
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
    const ms = etat.latenceMs !== null ? `  WIFI ${Math.max(1, Math.round(etat.latenceMs))} MS` : '';
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

// ============================================= équipes puis maillots, à deux ==

export interface CoteChoixLan {
  nom: string;
  pret: boolean;
  carte: CarteEquipe;
  variante: Variante;
}

export interface EtatChoixLan {
  etape: 'equipes' | 'maillots';
  /** Mon camp : 0 = gauche (celui de l'hôte), 1 = droite. */
  moi: 0 | 1;
  /** `pret` : tous les joueurs du camp sont prêts (l'hôte seul décide quand `hoteChoisit`). */
  cotes: [CoteChoixLan, CoteChoixLan];
  /** Coop : l'hôte et son équipier jouent ensemble contre le CPU (libellés des deux côtés). */
  coop: boolean;
  /** L'hôte règle les deux camps et valide seul (tous les formats sauf 1 contre 1) ; les autres regardent. */
  hoteChoisit: boolean;
  hote: boolean;
  nomHote: string;
  /** Mon maillot est identique à celui de l'adversaire déjà prêt : impossible de valider. */
  maillotPris: boolean;
  /** `cote` : le panneau touché (en coop, l'hôte règle les deux). */
  onPrecedent: (cote: 0 | 1) => void;
  onSuivant: (cote: 0 | 1) => void;
  onToggleMaillot: (cote: 0 | 1) => void;
  onPret: (pret: boolean) => void;
  onQuitter: () => void;
}

/**
 * Sélection simultanée : chacun ne règle que son côté ; « PRET » verrouille
 * son choix (MODIFIER pour revenir dessus) et l'étape suivante n'arrive
 * qu'une fois les deux joueurs prêts.
 */
export function dessineChoixLan(
  g: CanvasRenderingContext2D,
  boutons: ZoneBouton[],
  sprites: BanqueSprites,
  W: number,
  H: number,
  temps: number,
  etat: EtatChoixLan,
): void {
  g.fillStyle = 'rgba(7,9,20,0.84)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const moitie = Math.floor(W / 2);
  const bas = H - 22;
  const titre = etat.etape === 'equipes' ? 'CHOIX DES EQUIPES' : 'CHOIX DES MAILLOTS';
  texte(g, etat.coop ? `COOP : ${titre}` : titre, cx, 2, etat.coop ? VERT : C.blanc, 1, 'c');
  px(g, moitie - 1, 12, 1, bas - 16, '#2a3160');

  const autre = etat.cotes[etat.moi === 0 ? 1 : 0];
  // seul l'hôte règle (les deux camps) et valide ; les autres regardent
  const suiveur = etat.hoteChoisit && !etat.hote;
  for (const place of [0, 1] as const) {
    const c = etat.cotes[place];
    const x = place === 0 ? 0 : moitie;
    const w = place === 0 ? moitie : W - moitie;
    const moiAgit = etat.hoteChoisit ? etat.hote : place === etat.moi;
    const actif = moiAgit && !c.pret;
    // coop : à gauche l'équipe des deux joueurs, à droite le CPU
    const nom = etat.coop ? (place === 0 ? 'NOTRE EQUIPE' : 'ADVERSAIRE CPU') : c.nom;
    if (etat.etape === 'equipes') {
      dessinePanneauEquipe(g, boutons, x, w, H, nom, c.carte, actif ? () => etat.onPrecedent(place) : null, actif ? () => etat.onSuivant(place) : null, {
        echelleLogo: 0.42,
        hauteurNotes: 0.63,
      });
    } else {
      dessinePanneauMaillot(g, boutons, sprites, x, w, H, nom, { def: c.carte.def, variante: c.variante }, place === 0, actif ? () => etat.onToggleMaillot(place) : null);
    }
    const sx = x + w / 2;
    const sy = bas - 12;
    if (c.pret) {
      texte(g, 'PRET !', sx, sy, VERT, 1, 'c');
    } else if (moiAgit && etat.maillotPris) {
      texte(g, 'MAILLOT DEJA PRIS', sx, sy, '#ff9a5c', 1, 'c');
    } else {
      g.globalAlpha = moiAgit ? 1 : 0.5 + 0.5 * Math.abs(Math.sin(temps * 2.5));
      const qui = suiveur ? `${etat.nomHote} ` : '';
      texte(g, moiAgit ? 'A VOUS DE CHOISIR' : `${qui}CHOISIT${points(temps)}`, sx, sy, C.gris, 1, 'c');
      g.globalAlpha = 1;
    }
  }

  const moi = etat.cotes[etat.moi];
  bouton(g, boutons, '< QUITTER', 4, bas, 66, 16, etat.onQuitter, { couleur: '#232a58' });
  if (suiveur) {
    // les autres n'ont rien à valider : ils suivent les choix de l'hôte
    g.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(temps * 2.5));
    texte(g, `${etat.nomHote} CHOISIT LES EQUIPES${points(temps)}`, cx, bas + 5, C.or, 1, 'c');
    g.globalAlpha = 1;
  } else if (!moi.pret) {
    if (etat.maillotPris) texte(g, 'CHANGEZ DE MAILLOT', cx, bas + 5, '#ff9a5c', 1, 'c');
    else bouton(g, boutons, 'PRET', cx - 45, bas, 90, 16, () => etat.onPret(true), { e: 2, ...ROUGE });
  } else {
    bouton(g, boutons, 'MODIFIER', cx - 40, bas, 80, 16, () => etat.onPret(false), { couleur: '#232a58' });
    if (!etat.hoteChoisit && !autre.pret) texte(g, `EN ATTENTE DE ${autre.nom}`, W - 6, bas + 5, C.or, 1, 'd');
  }
}

// ======================================================== pause partagée ==

export interface EtatPauseLan {
  /** Nom du joueur qui a demandé la pause. */
  par: string;
  /** Absent pour un spectateur : seuls les joueurs relancent le match. */
  onReprendre?: () => void;
  onQuitter: () => void;
}

export function dessinePauseLan(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, etat: EtatPauseLan): void {
  g.fillStyle = 'rgba(7,9,20,0.6)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  texte(g, 'PAUSE', cx, cy - 52, C.blanc, 3, 'c');
  texte(g, `DEMANDEE PAR ${etat.par}`, cx, cy - 16, C.or, 1, 'c');
  if (etat.onReprendre) bouton(g, boutons, 'REPRENDRE', cx - 55, cy + 2, 110, 18, etat.onReprendre, BLEU);
  bouton(g, boutons, 'QUITTER LA PARTIE', cx - 55, cy + 26, 110, 18, etat.onQuitter);
}

/** Compte à rebours de reprise, pour que personne ne soit pris par surprise. */
export function dessineRepriseLan(g: CanvasRenderingContext2D, W: number, H: number, reste: number): void {
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  g.fillStyle = 'rgba(7,9,20,0.35)';
  g.fillRect(0, 0, W, H);
  texte(g, 'REPRISE', cx, cy - 30, C.blanc, 1, 'c');
  const n = Math.max(1, Math.ceil(reste));
  const f = reste - Math.floor(reste);
  texte(g, n, cx, cy - 18, C.or, f > 0.7 ? 5 : 4, 'c');
}

/** Coupure Wi-Fi en pleine partie : qui on attend, et combien de temps encore. */
export interface EtatCoupureLan {
  /** Ligne sous le titre (« EN ATTENTE DE LYNX 12 », « RECONNEXION A OURS 22 »). */
  sous: string;
  /** Secondes restantes avant d'abandonner. */
  reste: number;
  /** Bouton (ne plus attendre, quitter) ; aucun pour un spectateur. */
  bouton?: { libelle: string; act: () => void };
}

/**
 * Connexion perdue : voile sur tout l'écran (match figé, choix des équipes ou
 * écran de fin), avec le compte à rebours de la place gardée.
 */
export function dessineCoupureLan(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, e: EtatCoupureLan): void {
  g.fillStyle = 'rgba(7,9,20,0.72)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  texte(g, 'CONNEXION PERDUE', cx, cy - 48, '#ff8a8a', 2, 'c');
  g.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(temps * 3));
  texte(g, e.sous, cx, cy - 26, C.or, 1, 'c');
  g.globalAlpha = 1;
  texte(g, Math.max(0, Math.ceil(e.reste)), cx, cy - 12, C.blanc, 3, 'c');
  texte(g, 'SECONDES', cx, cy + 12, C.gris, 1, 'c');
  if (e.bouton) bouton(g, boutons, e.bouton.libelle, cx - 60, cy + 26, 120, 18, e.bouton.act);
}

// ================================================================== fin ==

export interface EtatFinLan {
  score: [number, number];
  tirs: [number, number];
  stats: StatsMatch;
  /** Bilan cumulé contre cet adversaire (mis à jour avec ce match). */
  bilan: string | null;
  prolong: boolean;
  moi: 0 | 1;
  monVote: 'rejouer' | 'equipes' | null;
  /** Les autres joueurs et leur vote. */
  autres: { nom: string; vote: 'rejouer' | 'equipes' | null }[];
  onVote: (v: 'rejouer' | 'equipes' | null) => void;
  onQuitter: () => void;
}

/** Fin de match en réseau : on ne relance que si les deux joueurs votent la même chose. */
export function dessineFinLan(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, fin: EtatFinLan): void {
  g.fillStyle = 'rgba(7,9,20,0.5)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  // panneau sombre derrière le bilan : lisible par-dessus l'image de victoire / défaite
  g.fillStyle = 'rgba(7,9,20,0.72)';
  g.fillRect(cx - 142, cy - 94, 284, 158);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(cx - 142, cy - 94, 284, 1);
  g.fillRect(cx - 142, cy + 63, 284, 1);
  const eux = fin.moi === 0 ? 1 : 0;
  const gagne = fin.score[fin.moi] > fin.score[eux];
  const nul = fin.score[0] === fin.score[1];
  const titre = nul ? 'MATCH NUL' : gagne ? 'VICTOIRE !' : 'DEFAITE';
  texte(g, titre, cx, cy - 75 + Math.round(Math.sin(temps * 4) * 1.5), gagne ? C.or : nul ? C.blanc : '#ff6b6b', 3, 'c');
  texte(g, `${fin.score[0]} - ${fin.score[1]}${fin.prolong ? '  PROL.' : ''}`, cx, cy - 50, C.blanc, 2, 'c');
  dessineStatsFin(g, cx, cy - 31, fin.tirs, fin.stats);

  const choix = (v: 'rejouer' | 'equipes', label: string, x: number, w: number, style: typeof ROUGE) => {
    const choisi = fin.monVote === v;
    bouton(g, boutons, choisi ? `> ${label} <` : label, x, cy + 17, w, 18, () => fin.onVote(choisi ? null : v), choisi ? style : { couleur: '#232a58' });
  };
  choix('rejouer', 'REJOUER', cx - 124, 110, ROUGE);
  choix('equipes', "CHANGER D'EQUIPES", cx + 4, 120, BLEU);

  const lib = (v: 'rejouer' | 'equipes' | null) => (v === 'rejouer' ? 'VEUT REJOUER' : v === 'equipes' ? "VEUT CHANGER D'EQUIPES" : `REFLECHIT${points(temps)}`);
  // un joueur par ligne (trois autres au plus) ; avec plus d'un, on les resserre
  const pasLigne = fin.autres.length > 1 ? 9 : 10;
  fin.autres.forEach((a, i) => texte(g, `${a.nom} ${lib(a.vote)}`, cx, cy + 40 + i * pasLigne, a.vote ? C.or : C.gris, 1, 'c'));
  const yBilan = cy + 40 + Math.max(1, fin.autres.length) * pasLigne;
  if (fin.monVote && fin.autres.some((a) => a.vote && a.vote !== fin.monVote)) {
    texte(g, 'VOUS N\'ETES PAS D\'ACCORD : CHOISISSEZ LA MEME OPTION', cx, yBilan, '#ff9a5c', 1, 'c');
  } else if (fin.monVote && fin.autres.some((a) => !a.vote)) {
    texte(g, 'ON RELANCE DES QUE VOUS ETES D\'ACCORD', cx, yBilan, '#6f7aa6', 1, 'c');
  }
  bouton(g, boutons, 'QUITTER', 4, H - 22, 66, 16, fin.onQuitter, { couleur: '#232a58' });
  if (fin.bilan) texte(g, fin.bilan, W - 6, H - 17, '#6f7aa6', 1, 'd');
}

// ============================================================ spectateur ==

export interface EtatAttenteSpectateur {
  /** Noms des joueurs de chaque camp. */
  camps: [string[], string[]];
  /** Ce que font les joueurs en ce moment. */
  sous: string;
  spect: number;
  onQuitter: () => void;
}

/** Spectateur hors match (salle d'attente, choix des équipes, entre deux matchs). */
export function dessineAttenteSpectateur(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, etat: EtatAttenteSpectateur): void {
  g.fillStyle = 'rgba(7,9,20,0.84)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  texte(g, 'MODE SPECTATEUR', cx, cy - 58, '#8fe3ff', 2, 'c');
  texte(g, `${etat.camps[0].join(' + ') || '...'}  VS  ${etat.camps[1].join(' + ') || 'CPU'}`, cx, cy - 26, C.blanc, 1, 'c');
  g.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(temps * 2.5));
  texte(g, `${etat.sous}${points(temps)}`, cx, cy - 8, C.or, 1, 'c');
  g.globalAlpha = 1;
  texte(g, 'LE MATCH S\'AFFICHE DES QU\'IL COMMENCE', cx, cy + 8, '#6f7aa6', 1, 'c');
  if (etat.spect > 1) texte(g, `${etat.spect} SPECTATEURS`, cx, cy + 22, '#6f7aa6', 1, 'c');
  bouton(g, boutons, 'QUITTER', 4, H - 22, 66, 16, etat.onQuitter, { couleur: '#232a58' });
}

export interface EtatFinSpectateur {
  score: [number, number];
  tirs: [number, number];
  stats: StatsMatch;
  prolong: boolean;
  noms: [string, string];
  onQuitter: () => void;
}

/** Fin de match vue par un spectateur : le score et les statistiques, sans vote. */
export function dessineFinSpectateur(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, fin: EtatFinSpectateur): void {
  g.fillStyle = 'rgba(7,9,20,0.5)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  g.fillStyle = 'rgba(7,9,20,0.72)';
  g.fillRect(cx - 142, cy - 94, 284, 158);
  const [a, b] = fin.score;
  const vainqueur = a === b ? null : a > b ? fin.noms[0] : fin.noms[1];
  texte(g, 'FIN DU MATCH', cx, cy - 75 + Math.round(Math.sin(temps * 4) * 1.5), C.or, 3, 'c');
  texte(g, `${a} - ${b}${fin.prolong ? '  PROL.' : ''}`, cx, cy - 50, C.blanc, 2, 'c');
  dessineStatsFin(g, cx, cy - 31, fin.tirs, fin.stats);
  texte(g, vainqueur ? `VICTOIRE DE ${vainqueur}` : 'MATCH NUL', cx, cy + 22, C.blanc, 1, 'c');
  texte(g, `LES JOUEURS VOTENT POUR LA SUITE${points(temps)}`, cx, cy + 36, '#6f7aa6', 1, 'c');
  bouton(g, boutons, 'QUITTER', 4, H - 22, 66, 16, fin.onQuitter, { couleur: '#232a58' });
}
