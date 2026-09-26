import { DUREES, EFFECTIFS } from '@core/constants';
import { texte } from './pixel-font';
import { px } from './primitives';
import { dessinePanneauEquipe, type CarteEquipe } from './team-select';
import type { TeamDef } from './team-visuals';
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

// =========================================================== salle d'attente ==

export interface EtatSalon {
  role: 'hote' | 'client';
  hote: { nom: string; carte: CarteEquipe };
  invite: { nom: string; carte: CarteEquipe } | null;
  /** Un appareil est en train de rejoindre (liaison pas encore ouverte). */
  connexionEnCours: boolean;
  effectifIdx: number;
  dureeIdx: number;
  /** Code de vérification identique sur les deux écrans (voir net/liaison). */
  code: string | null;
  latenceMs: number | null;
  message: string | null;
  onPrecedent: () => void;
  onSuivant: () => void;
  onLancer: () => void;
  onExclure: () => void;
  onQuitter: () => void;
}

export function dessineSalon(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, etat: EtatSalon): void {
  g.fillStyle = 'rgba(7,9,20,0.84)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const moitie = Math.floor(W / 2);
  const hote = etat.role === 'hote';
  texte(g, "SALLE D'ATTENTE", cx, 2, C.blanc, 1, 'c');
  const bas = H - 22;
  px(g, moitie - 1, 12, 1, bas - 30, '#2a3160');

  const opts = { echelleLogo: 0.36, hauteurNotes: 0.6 };
  dessinePanneauEquipe(
    g,
    boutons,
    0,
    moitie,
    H,
    etat.hote.nom,
    etat.hote.carte,
    hote ? etat.onPrecedent : null,
    hote ? etat.onSuivant : null,
    opts,
  );
  if (etat.invite) {
    dessinePanneauEquipe(
      g,
      boutons,
      moitie,
      W - moitie,
      H,
      etat.invite.nom,
      etat.invite.carte,
      hote ? null : etat.onPrecedent,
      hote ? null : etat.onSuivant,
      opts,
    );
  } else {
    const ccx = moitie + (W - moitie) / 2;
    const cy = Math.round(H * 0.3);
    for (let i = 0; i < 3; i++) {
      const a = 0.3 + 0.7 * Math.max(0, Math.sin(temps * 4 - i * 0.8));
      g.globalAlpha = a;
      px(g, ccx - 10 + i * 8, cy, 4, 4, C.or);
    }
    g.globalAlpha = 1;
    texte(g, etat.connexionEnCours ? "UN JOUEUR ARRIVE" : "EN ATTENTE D'UN JOUEUR", ccx, cy + 14, C.blanc, 1, 'c');
    texte(g, 'SUR LE MEME WIFI :', ccx, cy + 30, '#6f7aa6', 1, 'c');
    texte(g, 'MULTI WIFI > ACTUALISER', ccx, cy + 40, '#6f7aa6', 1, 'c');
  }

  const n = EFFECTIFS[etat.effectifIdx] ?? 3;
  const iy = bas - 13;
  texte(g, `${n} C ${n}   ${(DUREES[etat.dureeIdx] ?? 180) / 60} MIN`, moitie - 8, iy, C.gris, 1, 'd');
  if (etat.code) {
    const ms = etat.latenceMs !== null ? `   ${Math.max(1, Math.round(etat.latenceMs))} MS` : '';
    texte(g, `CODE ${etat.code}${ms}`, moitie + 8, iy, C.or, 1, 'g');
  }
  if (etat.message) texte(g, etat.message, cx, iy - 11, '#ff9a5c', 1, 'c');

  bouton(g, boutons, '< QUITTER', 4, bas, 66, 16, etat.onQuitter, { couleur: '#232a58' });
  if (hote) {
    if (etat.invite) {
      bouton(g, boutons, 'LANCER', cx - 45, bas, 90, 16, etat.onLancer, { e: 2, couleur: '#d12f4c', clair: '#ff7a90', fonce: '#8c1b3a' });
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
