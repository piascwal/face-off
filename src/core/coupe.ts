/**
 * Mode coupe : un tableau à élimination directe de 8 équipes (quarts,
 * demi-finales, finale). Le joueur joue ses matchs ; les autres se jouent en
 * simulation rapide, selon le profil des équipes (voir teams.ts). La
 * difficulté monte d'un cran à chaque tour. Module pur (aucun DOM) : l'état
 * se sauvegarde tel quel (JSON) pour reprendre la coupe plus tard.
 */
import { NIVEAUX } from './constants';
import { EQUIPES_JOUABLES, trouveEquipe } from './teams';

export interface MatchCoupe {
  a: string;
  b: string;
  /** Scores (null tant que le match n'est pas joué). */
  sa: number | null;
  sb: number | null;
  /** Décidé en prolongation (but en or). */
  prol: boolean;
}

export interface EtatCoupe {
  /** Équipe du joueur et son maillot. */
  equipe: string;
  variante: 'interieur' | 'exterieur';
  /** Niveau de difficulté choisi au lancement (celui des quarts). */
  niveau: number;
  /** Quarts (4 matchs), demi-finales (2), finale (1) ; un tour pas encore tiré est vide. */
  tours: MatchCoupe[][];
  /** Tour que le joueur doit jouer (0 quarts, 1 demies, 2 finale) ; 3 = coupe terminée. */
  tour: number;
  elimine: boolean;
}

export const NOMS_TOURS = ['QUARTS DE FINALE', 'DEMI-FINALES', 'FINALE'];
export const NB_TOURS = 3;

type Alea = () => number;

function melange<T>(t: T[], alea: Alea): T[] {
  const r = [...t];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
}

/** Nouvelle coupe : le joueur et 7 adversaires tirés au sort ; il ouvre le tableau (premier quart). */
export function creeCoupe(equipe: string, variante: 'interieur' | 'exterieur', niveau: number, alea: Alea = Math.random): EtatCoupe {
  const autres = melange(
    EQUIPES_JOUABLES.map((e) => e.id).filter((id) => id !== equipe),
    alea,
  ).slice(0, 7);
  const ordre = [equipe, ...autres];
  const quarts: MatchCoupe[] = [];
  for (let i = 0; i < 8; i += 2) quarts.push({ a: ordre[i]!, b: ordre[i + 1]!, sa: null, sb: null, prol: false });
  return { equipe, variante, niveau, tours: [quarts, [], []], tour: 0, elimine: false };
}

export function vainqueur(m: MatchCoupe): string | null {
  if (m.sa === null || m.sb === null || m.sa === m.sb) return null;
  return m.sa > m.sb ? m.a : m.b;
}

export function coupeTerminee(c: EtatCoupe): boolean {
  return c.elimine || c.tour >= NB_TOURS;
}

/** Vainqueur de la coupe (une fois la finale jouée ou simulée). */
export function champion(c: EtatCoupe): string | null {
  const f = c.tours[NB_TOURS - 1]?.[0];
  return f ? vainqueur(f) : null;
}

/** Match que le joueur doit jouer maintenant, et son côté (a ou b). */
export function matchDuJoueur(c: EtatCoupe): { m: MatchCoupe; adversaire: string } | null {
  if (coupeTerminee(c)) return null;
  const m = c.tours[c.tour]?.find((x) => x.a === c.equipe || x.b === c.equipe);
  if (!m) return null;
  return { m, adversaire: m.a === c.equipe ? m.b : m.a };
}

/** Difficulté du match du joueur : un cran de plus à chaque tour (plafonnée au niveau le plus dur). */
export function niveauDuTour(c: EtatCoupe): number {
  return Math.min(NIVEAUX.length - 1, c.niveau + Math.min(c.tour, NB_TOURS - 1));
}

/** Tirage de Poisson (nombre de buts d'une équipe en un match). */
function poisson(lambda: number, alea: Alea): number {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= alea();
  } while (p > l && k < 20);
  return k - 1;
}

/**
 * Match entre deux équipes de l'ordinateur, en simulation rapide : buts
 * attendus selon l'attaque de l'un (tir, vitesse) et la défense de l'autre
 * (défense, gardien) ; à égalité, but en or pour l'un des deux.
 */
export function simuleMatch(a: string, b: string, alea: Alea = Math.random): Pick<MatchCoupe, 'sa' | 'sb' | 'prol'> {
  const pa = trouveEquipe(a);
  const pb = trouveEquipe(b);
  const att = (p: typeof pa) => p.tir * 0.6 + p.vit * 0.4;
  const def = (p: typeof pa) => p.defense * 0.4 + p.gardien * 0.6;
  const la = (2.6 * att(pa)) / def(pb);
  const lb = (2.6 * att(pb)) / def(pa);
  let sa = poisson(la, alea);
  let sb = poisson(lb, alea);
  let prol = false;
  if (sa === sb) {
    prol = true;
    if (alea() < la / (la + lb)) sa++;
    else sb++;
  }
  return { sa, sb, prol };
}

/** Joue (en simulation) les matchs restants d'un tour, puis tire le tour suivant avec les vainqueurs. */
function completeTour(c: EtatCoupe, t: number, alea: Alea): void {
  for (const m of c.tours[t]!) if (m.sa === null) Object.assign(m, simuleMatch(m.a, m.b, alea));
  if (t + 1 >= NB_TOURS) return;
  const gagnants = c.tours[t]!.map((m) => vainqueur(m)!);
  const suivant: MatchCoupe[] = [];
  for (let i = 0; i < gagnants.length; i += 2) suivant.push({ a: gagnants[i]!, b: gagnants[i + 1]!, sa: null, sb: null, prol: false });
  c.tours[t + 1] = suivant;
}

/**
 * Résultat du match du joueur : les autres matchs du tour se jouent, les
 * vainqueurs avancent. Éliminé, la coupe se termine en simulation. Renvoie
 * les tours qui viennent d'être complétés (à révéler à l'écran).
 */
export function enregistreResultat(c: EtatCoupe, butsJoueur: number, butsAdversaire: number, prol: boolean, alea: Alea = Math.random): number[] {
  const mj = matchDuJoueur(c);
  if (!mj) return [];
  const { m } = mj;
  // la prolongation (but en or) départage toujours ; à défaut, l'adversaire passe
  const bj = butsJoueur;
  const ba = butsJoueur === butsAdversaire ? butsAdversaire + 1 : butsAdversaire;
  if (m.a === c.equipe) Object.assign(m, { sa: bj, sb: ba, prol });
  else Object.assign(m, { sa: ba, sb: bj, prol });
  const t0 = c.tour;
  completeTour(c, t0, alea);
  const reveles = [t0];
  if (vainqueur(m) !== c.equipe) {
    c.elimine = true;
    for (let t = t0 + 1; t < NB_TOURS; t++) {
      completeTour(c, t, alea);
      reveles.push(t);
    }
  }
  c.tour = c.elimine ? NB_TOURS : t0 + 1;
  return reveles;
}

// ------------------------------------------------------------- sauvegarde --

const EQUIPE_SURE = { test: (id: string) => EQUIPES_JOUABLES.some((e) => e.id === id) };
const score = (x: unknown): x is number | null => x === null || (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < 100);

function lisMatch(o: unknown): MatchCoupe | null {
  if (!o || typeof o !== 'object') return null;
  const m = o as Record<string, unknown>;
  if (typeof m.a !== 'string' || !EQUIPE_SURE.test(m.a) || typeof m.b !== 'string' || !EQUIPE_SURE.test(m.b)) return null;
  if (!score(m.sa) || !score(m.sb) || typeof m.prol !== 'boolean') return null;
  return { a: m.a, b: m.b, sa: m.sa, sb: m.sb, prol: m.prol };
}

/** Valide une coupe sauvegardée (stockage local) ; null si elle est abîmée. */
export function lisCoupe(o: unknown): EtatCoupe | null {
  if (!o || typeof o !== 'object') return null;
  const c = o as Record<string, unknown>;
  if (typeof c.equipe !== 'string' || !EQUIPE_SURE.test(c.equipe)) return null;
  if (c.variante !== 'interieur' && c.variante !== 'exterieur') return null;
  if (typeof c.niveau !== 'number' || !Number.isInteger(c.niveau) || c.niveau < 0 || c.niveau >= NIVEAUX.length) return null;
  if (typeof c.tour !== 'number' || !Number.isInteger(c.tour) || c.tour < 0 || c.tour > NB_TOURS) return null;
  if (typeof c.elimine !== 'boolean' || !Array.isArray(c.tours) || c.tours.length !== NB_TOURS) return null;
  const tours: MatchCoupe[][] = [];
  for (let t = 0; t < NB_TOURS; t++) {
    const l = c.tours[t];
    if (!Array.isArray(l) || (l.length !== 0 && l.length !== 4 >> t)) return null;
    const ms = l.map(lisMatch);
    if (ms.some((m) => !m)) return null;
    tours.push(ms as MatchCoupe[]);
  }
  if (tours[0]!.length !== 4) return null;
  return { equipe: c.equipe, variante: c.variante, niveau: c.niveau, tours, tour: c.tour, elimine: c.elimine };
}
