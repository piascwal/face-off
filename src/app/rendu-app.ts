/** Rendu d'une image de l'application : scène, effets d'écran, tableau, écrans des parcours, et par-dessus le match. */

import { dessineMiseAJour, dessineRappelMiseAJour } from '@render/mise-a-jour-vue';
import { menaceEchec } from '@core/actions';
import { boutonBonus, DEF_POUVOIRS, TREMBLEMENT_CHUTE } from '@core/pouvoirs';
import { dessineLoupe } from '@render/loupe-ecran';
import { type MatchState } from '@core/types';
import {
  C,
  dessineBanniere,
  dessineCelebration,
  dessineCommandes,
  dessineJaugesBonus,
  dessineJaugeTir,
  dessineLogoBut,
  dessinePortrait,
  dessineRalenti,
  dessineScene,
  dessineTableau,
  texte,
} from '@render/index';
import { ECRANS_MENU } from './ecrans';
import type { GameApp } from './game-app';

export function rendu(app: GameApp): void {
  app.boutons = [];
  const g = app.g;
  const E = app.ECHELLE;
  g.setTransform(E, 0, 0, E, 0, 0);
  g.imageSmoothingEnabled = false;
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  const temps = performance.now() / 1000;

  if (app.portrait || !app.state || !app.rink || !app.decor) {
    dessinePortrait(g, app.W, app.H, temps);
    return;
  }
  const state = app.state;
  const lan = app.lan;
  g.fillStyle = C.nuit;
  g.fillRect(0, 0, app.W, app.H);
  secousseTremblement(app, state);
  const s = app.effets.secousse;
  const sx = s > 0.2 ? Math.round((Math.random() * 2 - 1) * s) : 0;
  const sy = s > 0.2 ? Math.round((Math.random() * 2 - 1) * s) : 0;
  g.setTransform(E, 0, 0, E, sx * E, sy * E);
  const ralenti = app.ralenti.actif && !!app.etatRalenti && app.ecranUI === 'jeu';
  const vue = ralenti ? app.etatRalenti! : state;
  dessineScene(
    g,
    app.rink,
    vue,
    app.decor,
    app.sprites,
    app.effets,
    app.ecranUI,
    app.equipesActuelles,
    lan.spectateur ? null : lan.eqLocal,
    lan.pilote(vue),
  );
  g.setTransform(E, 0, 0, E, 0, 0);
  // bonus « givre » : l'écran de tout le monde gèle (la patinoire seulement, pas le tableau ni les commandes)
  if (!ralenti) app.givre.dessine(g, app.ecran, app.W, app.H, E, forceBonus(state, 'givre', 0.5, 1), temps);
  const enMatch = !ECRANS_MENU.includes(app.ecranUI);
  // empilement lors d'un but : patinoire, écusson géant, puis tableau et bandeau
  if (enMatch) {
    if (!ralenti) dessineLogoBut(g, app.W, app.H, app.rink, app.effets.banniere, app.ecranUI, temps);
    if (!ralenti) dessineJaugesBonus(g, app.W, state, lan.spectateur ? null : lan.eqLocal, temps);
    dessineTableau(g, app.W, state, app.ecranUI, app.equipesActuelles);
  }
  if (!ralenti && (app.ecranUI === 'menu' || enMatch)) dessineBanniere(g, app.W, app.rink, app.effets.banniere, app.ecranUI);
  // le buteur qui fête son but passe au premier plan, devant l'écusson et le bandeau
  if (!ralenti && enMatch) dessineCelebration(g, app.W, app.H, app.sprites, app.effets.banniere, app.ecranUI);
  if (enMatch) lan.vues.dessineEtatReseau(g, temps);

  if (app.ecranUI === 'jeu') dessineSurMatch(app, g, temps, state, ralenti);
  else if (app.ecranUI === 'fin' && app.imageFin.dessine(g, app.W, app.H, app.equipesActuelles[lan.eqLocal]) && app.imageFin.seule()) {
    // image de victoire / défaite seule, avant que les statistiques s'y superposent
  } else {
    // chaque parcours dessine ses écrans (le Wi-Fi d'abord : il a aussi sa fin de match)
    void (lan.vues.dessine(g, temps, state) || app.coupe.dessine(g, temps) || app.solo.dessine(g, temps, state));
  }
  // loupé complet : le palet frappe la caméra, l'écran se brise (par-dessus tout le jeu)
  if (enMatch && !ralenti) dessineLoupe(g, app.W, app.H, state);
  lan.vues.dessineCoupure(g, temps);
  lan.vues.dessineReactions(g, temps);
  if (app.effets.flash > 0) {
    g.fillStyle = `rgba(255,255,255,${app.effets.flash * 0.5})`;
    g.fillRect(0, 0, app.W, app.H);
  }
  if (app.ecranUI === 'menu') {
    if (app.attenteDemarrage) dessineEcranDemarrage(app, g, temps);
    else if (app.maj.proposee)
      dessineMiseAJour(g, app.boutons, app.W, app.H, {
        version: app.maj.version,
        onMaj: () => app.maj.accepte(),
        onPlusTard: () => app.maj.plusTard(),
      });
    else if (app.maj.refusee) dessineRappelMiseAJour(g, app.boutons, () => app.maj.rouvre());
  }
}

/** Bonus « tremblement » : l'écran tremble fort tant que les joueurs sont au sol. */
function secousseTremblement(app: GameApp, state: MatchState): void {
  for (const pv of state.pouvoirs ?? []) {
    if (pv.actif !== 'tremblement') continue;
    const age = DEF_POUVOIRS.tremblement.duree - pv.reste;
    if (age < TREMBLEMENT_CHUTE) app.effets.secousse = Math.max(app.effets.secousse, 4.5 * (1 - age / TREMBLEMENT_CHUTE) * app.effets.intensiteEcran + 1);
  }
}

/**
 * Premier écran, par-dessus le menu : un seul geste (clic, appui, touche)
 * suffit à passer en plein écran, avant que le joueur touche un vrai
 * bouton. Voir `attenteDemarrage`.
 */
function dessineEcranDemarrage(app: GameApp, g: CanvasRenderingContext2D, temps: number): void {
  const cx = Math.round(app.W / 2);
  const cy = Math.round(app.H / 2);
  g.fillStyle = 'rgba(5,6,13,0.82)';
  g.fillRect(0, 0, app.W, app.H);
  const pulse = Math.sin(temps * 5) > 0;
  texte(g, 'APPUYEZ POUR COMMENCER', cx, cy - 5, pulse ? C.or : C.blanc, 2, 'c');
  texte(g, 'LE JEU PASSE EN PLEIN ECRAN', cx, cy + 15, '#6f7aa6', 1, 'c');
}

/** Par-dessus le match : pause Wi-Fi, ralenti du but, ou commandes tactiles. */
function dessineSurMatch(app: GameApp, g: CanvasRenderingContext2D, temps: number, state: MatchState, ralenti: boolean): void {
  const lan = app.lan;
  if (lan.vues.dessinePauseMatch(g)) return;
  if (ralenti) {
    const partie = lan.partie;
    const enLan = !!partie && !!lan.jeu;
    const siege = lan.siege;
    const passe = enLan && siege !== null && partie!.ralentiPasse[siege];
    // les joueurs qui n'ont pas encore passé le ralenti
    const attendus = partie ? partie.sieges.flatMap((j, i) => (j && !partie.ralentiPasse[i] ? [j.nom] : [])).join(' ET ') : '';
    dessineRalenti(g, app.boutons, app.W, app.H, temps, {
      progression: app.ralenti.progression,
      // le spectateur ne passe pas le ralenti : les joueurs décident
      attente: lan.spectateur ? 'RALENTI DU BUT' : passe ? `EN ATTENTE DE ${attendus}` : null,
      onPasser: () => app.passeRalenti(),
    });
    return;
  }
  // le spectateur n'a pas de commandes : sa barre de réactions est dessinée à part
  if (lan.spectateur) return;
  const pilote = lan.pilote(state);
  const ui = app.entrees.instantaneUI();
  // bonus qui se joue avec un bouton (tir surpuissant) : ce bouton passe en or
  const boutonDore = boutonBonus(state, lan.eqLocal, pilote);
  dessineCommandes(g, app.W, app.H, state.temps, pilote, ui, !!pilote && menaceEchec(state, pilote) !== null, boutonDore);
  if (pilote?.arme) dessineJaugeTir(g, app.H, pilote.charge, state.temps);
}

/**
 * Force (0..1) d'un effet d'écran lié à un bonus en cours, de l'une ou
 * l'autre équipe : il monte en `entree` s, et retombe dans les `sortie`
 * dernières secondes.
 */
function forceBonus(state: MatchState, id: 'givre', entree: number, sortie: number): number {
  let f = 0;
  for (const pv of state.pouvoirs ?? []) {
    if (pv.actif !== id) continue;
    const age = DEF_POUVOIRS[id].duree - pv.reste;
    f = Math.max(f, Math.min(1, age / entree, pv.reste / sortie));
  }
  return f;
}
