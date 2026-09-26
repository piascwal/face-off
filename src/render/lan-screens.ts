import { DUREES, EFFECTIFS } from '@core/constants';
import { texte } from './pixel-font';
import { px } from './primitives';
import type { BanqueSprites } from './sprites';
import { dessinePanneauEquipe, dessinePanneauMaillot, type CarteEquipe } from './team-select';
import type { TeamDef, Variante } from './team-visuals';
import { C } from './theme';
import { bouton, panneau, type ZoneBouton } from './widgets';

// ======================================================== liste des parties ==

export interface LignePartie {
  nom: string;
  equipe: TeamDef;
  effectifIdx: number;
  dureeIdx: number;
  onRejoindre: () => void;
}

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
  texte(g, "A DEUX SUR LE MEME WIFI - L'HOTE SERT DE SERVEUR", cx, 22, '#6f7aa6', 1, 'c');

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
    px(g, x, y, 3, 16, p.equipe.interieur.maillot);
    texte(g, p.nom, x + 8, y + 4, C.blanc, 1, 'g');
    texte(g, p.equipe.code, x + 96, y + 4, p.equipe.interieur.clair, 1, 'g');
    const n = EFFECTIFS[p.effectifIdx] ?? 3;
    texte(g, `${n} C ${n}  ${(DUREES[p.dureeIdx] ?? 180) / 60} MIN`, x + 150, y + 4, C.gris, 1, 'g');
    texte(g, 'REJOINDRE >', x + w - 6, y + 4, C.or, 1, 'd');
    if (!occupe) boutons.push({ x, y, w, h: 16, act: p.onRejoindre });
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
  effectifIdx: number;
  dureeIdx: number;
  assistTir: boolean;
  assistPasse: boolean;
  changementAuto: boolean;
  onEffectif: () => void;
  onDuree: () => void;
  onAssistTir: () => void;
  onAssistPasse: () => void;
  onChangementAuto: () => void;
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
  const ph = 98;
  const py = 26;
  panneau(g, cx - pw / 2, py, pw, ph);
  const n = EFFECTIFS[etat.effectifIdx] ?? 3;
  const lignes: [string, string, () => void][] = [
    ['EQUIPES', `${n} CONTRE ${n}`, etat.onEffectif],
    ['DUREE', `${(DUREES[etat.dureeIdx] ?? 180) / 60} MIN`, etat.onDuree],
    ['ASSISTANCE TIR', oui(etat.assistTir), etat.onAssistTir],
    ['ASSISTANCE PASSE', oui(etat.assistPasse), etat.onAssistPasse],
    ['CHGT AUTO JOUEUR', oui(etat.changementAuto), etat.onChangementAuto],
  ];
  lignes.forEach(([k, v, act], i) => {
    const y = py + 6 + i * 18;
    texte(g, k, cx - pw / 2 + 10, y + 4, C.gris, 1, 'g');
    bouton(g, boutons, `< ${v} >`, cx + pw / 2 - 110, y, 100, 13, act, { couleur: '#232a58' });
  });
  texte(g, 'CES REGLAGES VALENT POUR LES DEUX JOUEURS', cx, py + ph + 7, '#6f7aa6', 1, 'c');
  const by = H - 22;
  bouton(g, boutons, '< RETOUR', cx - pw / 2, by, 70, 16, etat.onRetour, { couleur: '#232a58' });
  bouton(g, boutons, 'CREER LA PARTIE', cx + pw / 2 - 112, by, 112, 16, etat.onCreer, ROUGE);
}

function resumeConfig(g: CanvasRenderingContext2D, cx: number, y: number, c: ResumeConfig): void {
  const n = EFFECTIFS[c.effectifIdx] ?? 3;
  texte(g, `${n} CONTRE ${n}   ${(DUREES[c.dureeIdx] ?? 180) / 60} MIN`, cx, y, C.blanc, 1, 'c');
  texte(g, `ASSIST. TIR ${oui(c.assistTir)}   PASSE ${oui(c.assistPasse)}   CHGT AUTO ${oui(c.changementAuto)}`, cx, y + 11, C.gris, 1, 'c');
}

export interface ResumeConfig {
  effectifIdx: number;
  dureeIdx: number;
  assistTir: boolean;
  assistPasse: boolean;
  changementAuto: boolean;
}

// =========================================================== salle d'attente ==

export interface EtatSalon {
  role: 'hote' | 'client';
  hote: string;
  invite: string | null;
  /** Un appareil est en train de rejoindre (liaison pas encore ouverte). */
  connexionEnCours: boolean;
  config: ResumeConfig;
  /** Code de vérification identique sur les deux écrans (voir net/liaison). */
  code: string | null;
  latenceMs: number | null;
  message: string | null;
  onLancer: () => void;
  onExclure: () => void;
  onQuitter: () => void;
}

function carteJoueur(g: CanvasRenderingContext2D, x: number, y: number, w: number, role: string, nom: string | null, temps: number, attente: string): void {
  panneau(g, x, y, w, 50);
  texte(g, role, x + w / 2, y + 6, C.gris, 1, 'c');
  if (nom) {
    texte(g, nom, x + w / 2, y + 20, C.blanc, 2, 'c');
    return;
  }
  for (let i = 0; i < 3; i++) {
    g.globalAlpha = 0.3 + 0.7 * Math.max(0, Math.sin(temps * 4 - i * 0.8));
    px(g, x + w / 2 - 10 + i * 8, y + 20, 4, 4, C.or);
  }
  g.globalAlpha = 1;
  texte(g, attente, x + w / 2, y + 32, C.blanc, 1, 'c');
}

export function dessineSalon(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, etat: EtatSalon): void {
  g.fillStyle = 'rgba(7,9,20,0.84)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const hote = etat.role === 'hote';
  texte(g, "SALLE D'ATTENTE", cx, 4, C.blanc, 2, 'c');

  const cw = Math.min(150, Math.floor((W - 60) / 2));
  carteJoueur(g, cx - 18 - cw, 26, cw, 'HOTE', etat.hote, temps, '');
  carteJoueur(g, cx + 18, 26, cw, 'INVITE', etat.invite, temps, etat.connexionEnCours ? 'UN JOUEUR ARRIVE' : "EN ATTENTE D'UN JOUEUR");
  texte(g, 'VS', cx, 44, C.or, 2, 'c');
  if (!etat.invite) texte(g, 'SUR L\'AUTRE APPAREIL : MULTI WIFI', cx + 18 + cw / 2, 80, '#6f7aa6', 1, 'c');

  resumeConfig(g, cx, 98, etat.config);
  if (etat.code) {
    const ms = etat.latenceMs !== null ? `   WIFI ${Math.max(1, Math.round(etat.latenceMs))} MS` : '';
    texte(g, `CODE DE VERIFICATION ${etat.code}${ms}`, cx, 124, C.or, 1, 'c');
    texte(g, 'LE MEME CODE DOIT S\'AFFICHER SUR LES DEUX ECRANS', cx, 134, '#6f7aa6', 1, 'c');
  }
  if (etat.message) texte(g, etat.message, cx, 150, '#ff9a5c', 1, 'c');

  const bas = H - 22;
  bouton(g, boutons, '< QUITTER', 4, bas, 66, 16, etat.onQuitter, { couleur: '#232a58' });
  if (hote) {
    if (etat.invite) {
      bouton(g, boutons, 'LANCER', cx - 45, bas, 90, 16, etat.onLancer, { e: 2, ...ROUGE });
      bouton(g, boutons, 'EXCLURE', W - 70, bas, 66, 16, etat.onExclure, { couleur: '#232a58' });
    } else {
      texte(g, `EN ATTENTE${points(temps)}`, cx, bas + 5, '#6f7aa6', 1, 'c');
    }
  } else {
    g.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(temps * 2.5));
    texte(g, "EN ATTENTE DE L'HOTE", cx, bas + 5, C.or, 1, 'c');
    g.globalAlpha = 1;
  }
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
  /** Place de ce joueur : 0 = gauche (hôte), 1 = droite (invité). */
  moi: 0 | 1;
  cotes: [CoteChoixLan, CoteChoixLan];
  /** Mon maillot est identique à celui de l'adversaire déjà prêt : impossible de valider. */
  maillotPris: boolean;
  onPrecedent: () => void;
  onSuivant: () => void;
  onToggleMaillot: () => void;
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
  texte(g, etat.etape === 'equipes' ? 'CHOIX DES EQUIPES' : 'CHOIX DES MAILLOTS', cx, 2, C.blanc, 1, 'c');
  px(g, moitie - 1, 12, 1, bas - 16, '#2a3160');

  const autre = etat.cotes[etat.moi === 0 ? 1 : 0];
  for (const place of [0, 1] as const) {
    const c = etat.cotes[place];
    const x = place === 0 ? 0 : moitie;
    const w = place === 0 ? moitie : W - moitie;
    const actif = place === etat.moi && !c.pret;
    if (etat.etape === 'equipes') {
      dessinePanneauEquipe(g, boutons, x, w, H, c.nom, c.carte, actif ? etat.onPrecedent : null, actif ? etat.onSuivant : null, {
        echelleLogo: 0.42,
        hauteurNotes: 0.63,
      });
    } else {
      dessinePanneauMaillot(g, boutons, sprites, x, w, H, c.nom, { def: c.carte.def, variante: c.variante }, place === 0, actif ? etat.onToggleMaillot : null);
    }
    const sx = x + w / 2;
    const sy = bas - 12;
    if (c.pret) {
      texte(g, 'PRET !', sx, sy, VERT, 1, 'c');
    } else if (place === etat.moi && etat.maillotPris) {
      texte(g, 'MAILLOT DEJA PRIS', sx, sy, '#ff9a5c', 1, 'c');
    } else {
      g.globalAlpha = place === etat.moi ? 1 : 0.5 + 0.5 * Math.abs(Math.sin(temps * 2.5));
      texte(g, place === etat.moi ? 'A VOUS DE CHOISIR' : `CHOISIT${points(temps)}`, sx, sy, C.gris, 1, 'c');
      g.globalAlpha = 1;
    }
  }

  const moi = etat.cotes[etat.moi];
  bouton(g, boutons, '< QUITTER', 4, bas, 66, 16, etat.onQuitter, { couleur: '#232a58' });
  if (!moi.pret) {
    if (etat.maillotPris) texte(g, 'CHANGEZ DE MAILLOT', cx, bas + 5, '#ff9a5c', 1, 'c');
    else bouton(g, boutons, 'PRET', cx - 45, bas, 90, 16, () => etat.onPret(true), { e: 2, ...ROUGE });
  } else {
    bouton(g, boutons, 'MODIFIER', cx - 40, bas, 80, 16, () => etat.onPret(false), { couleur: '#232a58' });
    if (!autre.pret) texte(g, `EN ATTENTE DE ${autre.nom}`, W - 6, bas + 5, C.or, 1, 'd');
  }
}

// ======================================================== pause partagée ==

export interface EtatPauseLan {
  /** Nom du joueur qui a demandé la pause. */
  par: string;
  onReprendre: () => void;
  onQuitter: () => void;
}

export function dessinePauseLan(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, etat: EtatPauseLan): void {
  g.fillStyle = 'rgba(7,9,20,0.6)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  texte(g, 'PAUSE', cx, cy - 58, C.blanc, 3, 'c');
  texte(g, `DEMANDEE PAR ${etat.par}`, cx, cy - 22, C.or, 1, 'c');
  texte(g, 'LE MATCH EST FIGE SUR LES DEUX ECRANS', cx, cy - 12, '#6f7aa6', 1, 'c');
  bouton(g, boutons, 'REPRENDRE', cx - 55, cy + 2, 110, 18, etat.onReprendre, BLEU);
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

// ================================================================== fin ==

export interface EtatFinLan {
  score: [number, number];
  tirs: [number, number];
  prolong: boolean;
  moi: 0 | 1;
  couleurAdverse: string;
  monVote: 'rejouer' | 'equipes' | null;
  voteAdverse: 'rejouer' | 'equipes' | null;
  nomAdverse: string;
  onVote: (v: 'rejouer' | 'equipes' | null) => void;
  onQuitter: () => void;
}

/** Fin de match en réseau : on ne relance que si les deux joueurs votent la même chose. */
export function dessineFinLan(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, fin: EtatFinLan): void {
  g.fillStyle = 'rgba(7,9,20,0.62)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  const eux = fin.moi === 0 ? 1 : 0;
  const gagne = fin.score[fin.moi] > fin.score[eux];
  const nul = fin.score[0] === fin.score[1];
  const titre = nul ? 'MATCH NUL' : gagne ? 'VICTOIRE !' : 'DEFAITE';
  texte(g, titre, cx, cy - 66 + Math.round(Math.sin(temps * 4) * 1.5), gagne ? C.or : nul ? C.blanc : fin.couleurAdverse, 3, 'c');
  texte(g, `${fin.score[0]} - ${fin.score[1]}${fin.prolong ? '  PROL.' : ''}`, cx, cy - 38, C.blanc, 2, 'c');
  texte(g, `TIRS CADRES  ${fin.tirs[0]} - ${fin.tirs[1]}`, cx, cy - 20, C.gris, 1, 'c');

  const choix = (v: 'rejouer' | 'equipes', label: string, x: number, w: number, style: typeof ROUGE) => {
    const choisi = fin.monVote === v;
    bouton(g, boutons, choisi ? `> ${label} <` : label, x, cy - 4, w, 20, () => fin.onVote(choisi ? null : v), choisi ? style : { couleur: '#232a58' });
  };
  choix('rejouer', 'REJOUER', cx - 124, 110, ROUGE);
  choix('equipes', "CHANGER D'EQUIPES", cx + 4, 120, BLEU);

  const lib = (v: 'rejouer' | 'equipes' | null) => (v === 'rejouer' ? 'VEUT REJOUER' : v === 'equipes' ? "VEUT CHANGER D'EQUIPES" : `REFLECHIT${points(temps)}`);
  texte(g, `${fin.nomAdverse} ${lib(fin.voteAdverse)}`, cx, cy + 24, fin.voteAdverse ? C.or : C.gris, 1, 'c');
  if (fin.monVote && fin.voteAdverse && fin.monVote !== fin.voteAdverse) {
    texte(g, 'VOUS N\'ETES PAS D\'ACCORD : CHOISISSEZ LA MEME OPTION', cx, cy + 35, '#ff9a5c', 1, 'c');
  } else if (fin.monVote && !fin.voteAdverse) {
    texte(g, 'ON RELANCE DES QUE VOUS ETES D\'ACCORD', cx, cy + 35, '#6f7aa6', 1, 'c');
  }
  bouton(g, boutons, 'QUITTER', cx - 40, cy + 48, 80, 16, fin.onQuitter, { couleur: '#232a58' });
}
