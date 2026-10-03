/** Écrans Wi-Fi d'avant la partie : la liste des parties du réseau, et les réglages de l'hôte. */

import { DUREES, EFFECTIFS, NIVEAUX } from '@core/constants';
import type { FormatLan } from '@net/partie';
import { largeurTexte, texte } from './pixel-font';
import { px } from './primitives';
import { couleurNom, type TeamDef } from './team-visuals';
import { C } from './theme';
import { bouton, panneau, type ZoneBouton } from './widgets';
import { LIBELLES_FORMAT, COURT_FORMAT, oui, points, ROUGE, VERT } from './lan-commun';

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
