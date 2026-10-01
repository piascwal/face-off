import { DEF_POUVOIRS, POUVOIRS, TIRAGE_S } from '@core/pouvoirs';
import type { EtatPouvoirs, MatchState, PouvoirId, TeamId } from '@core/types';
import { dessineIconeBonus } from './icones-bonus';
import { largeurTexte, texte } from './pixel-font';
import { px } from './primitives';
import { C } from './theme';

const BLEU = '#3a4590';
const VIDE = '#2a3160';

/**
 * Case du bonus (20×20) : « ? » tant que rien n'est tiré, les icônes qui
 * défilent pendant le tirage, puis l'icône du bonus obtenu.
 */
function caseBonus(g: CanvasRenderingContext2D, x: number, y: number, pv: EtatPouvoirs, temps: number): void {
  const id = pv.actif ?? pv.pret;
  // les dernières secondes du bonus : le cadre clignote
  const fin = pv.actif !== null && pv.reste < 2 && Math.floor(temps * 8) % 2 === 1;
  px(g, x - 1, y - 1, 22, 22, fin ? C.blanc : id ? C.or : BLEU);
  px(g, x, y, 20, 20, '#141939');
  if (pv.tirage > 0 && pv.pret) {
    // tirage : la roue d'icônes ralentit puis s'arrête sur le bonus tiré
    // la roue ne montre que les bonus qui peuvent sortir
    const roue = POUVOIRS.filter((id) => DEF_POUVOIRS[id].dispo || id === pv.pret);
    const n = roue.length;
    const cible = 2 * n + roue.indexOf(pv.pret);
    const u = 1 - pv.tirage / TIRAGE_S;
    const pos = cible * (1 - Math.pow(1 - u, 3));
    g.save();
    g.beginPath();
    g.rect(x, y, 20, 20);
    g.clip();
    for (let d = -1; d <= 1; d++) {
      const i = Math.floor(pos) + d;
      dessineIconeBonus(g, roue[((i % n) + n) % n]!, x + 10, y + 10 + (i - pos) * 20, 14);
    }
    g.restore();
    return;
  }
  dessineIconeBonus(g, id ?? 'inconnu', x + 10, y + 10, 14);
}

/** Temps restant d'un bonus en cours (0..1). */
function resteRelatif(pv: EtatPouvoirs): number {
  if (!pv.actif) return 0;
  return Math.max(0, Math.min(1, pv.reste / DEF_POUVOIRS[pv.actif].duree));
}

/**
 * Jauge des bonus d'une équipe. Version complète (en haut à gauche, pour le
 * joueur) : la case, puis les pastilles des passes, ou le nom du bonus en
 * cours et son temps restant. Version compacte (en haut à droite, pour
 * l'adversaire) : la case, et dessous les passes ou le temps restant.
 */
export function dessineJaugeBonus(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  pv: EtatPouvoirs,
  temps: number,
  compacte: boolean,
): void {
  const id: PouvoirId | null = pv.actif;
  const nom = id ? DEF_POUVOIRS[id].nom : '';
  if (compacte) {
    // x : bord droit
    const x0 = x - 20;
    caseBonus(g, x0, y, pv, temps);
    const r = resteRelatif(pv);
    if (pv.actif) {
      px(g, x0, y + 23, 20, 2, VIDE);
      px(g, x0, y + 23, Math.round(20 * r), 2, C.or);
    } else if (!pv.pret) texte(g, `${pv.passes}/${pv.seuil}`, x0 + 10, y + 23, C.gris, 1, 'c');
    return;
  }
  const larg = 26 + Math.max(id ? largeurTexte(nom) : 0, pv.seuil * 7);
  g.fillStyle = 'rgba(7,9,20,0.6)';
  g.fillRect(x - 3, y - 3, larg + 3, 26);
  caseBonus(g, x, y, pv, temps);
  const tx = x + 25;
  if (pv.actif) {
    texte(g, nom, tx, y + 2, C.or, 1, 'g');
    const w = larg - 27;
    px(g, tx, y + 13, w, 3, VIDE);
    px(g, tx, y + 13, Math.round(w * resteRelatif(pv)), 3, pv.reste < 2 && Math.floor(temps * 8) % 2 ? C.blanc : C.or);
    return;
  }
  // jauge des passes (pastilles pleines pour les passes faites), ou tirage en cours
  for (let i = 0; i < pv.seuil; i++) {
    const plein = pv.pret !== null || i < pv.passes;
    px(g, tx + i * 7, y + 7, 5, 5, plein ? C.or : VIDE);
  }
  texte(g, pv.pret ? 'TIRAGE...' : 'PASSES', tx, y + 15, pv.pret ? C.or : '#6f7aa6', 1, 'g');
}

/**
 * Les jauges du match : celle de l'équipe de cet écran en haut à gauche,
 * celle de l'adversaire (compacte) en haut à droite, sous le bouton pause.
 * Spectateur (`eqLocal` null) : l'équipe 0 à gauche, l'équipe 1 à droite.
 */
export function dessineJaugesBonus(g: CanvasRenderingContext2D, W: number, state: MatchState, eqLocal: TeamId | null, temps: number): void {
  const pv = state.pouvoirs;
  if (!pv) return;
  const moi: TeamId = eqLocal ?? 0;
  const eux: TeamId = moi === 0 ? 1 : 0;
  dessineJaugeBonus(g, 6, 5, pv[moi], temps, false);
  // en entraînement, l'adversaire n'a pas de bonus
  if (!state.entrainement) dessineJaugeBonus(g, W - 6, 24, pv[eux], temps, true);
}
