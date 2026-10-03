import { DUREES, EFFECTIFS } from '@core/constants';
import { creePartie, type OptionsPartie } from '@core/rules';
import { trouveEquipe } from '@core/teams';
import { INTENT_VIDE, type MatchState, type Rink, type TeamId } from '@core/types';
import { campDe, compositionHumaine, joueursAssis, siegeReel, tousOntPasse, type EtatPartieLan, type Siege } from '@net/partie';
import { angleVersHote, directionVersHote } from '@net/entrees';
import { encodeInstantane } from '@net/instantane';
import { evenementsPourEnvoi, type MsgCtrl } from '@net/protocole';
import { SynchroClient } from '@net/synchro';
import { joueEvenements } from '@audio/sound';
import { C, LIBELLES_FORMAT, resoutEquipe, trouveTeamDef, type EquipeVisuelle } from '@render/index';
import type { GameApp } from './game-app';
import type { ParcoursLan } from './parcours-lan';
import { noteDuel } from './preferences';
import { dureeBut } from './ralenti';
import { demandePleinEcranPaysage } from './pwa';

/**
 * Match en réseau local : l'hôte simule, chaque joueur affiche et envoie ses
 * entrées (le patineur de son siège) ; un spectateur affiche comme les
 * joueurs, sans rien piloter.
 */
export type JeuReseau =
  | { role: 'hote'; eqLocal: TeamId; dernierEnvoi: number }
  | { role: 'client'; eqLocal: TeamId; synchro: SynchroClient; spectateur: boolean };

/**
 * Le match Wi-Fi lui-même (voir parcours-lan.ts pour les écrans autour) :
 * démarrage, chez l'hôte la diffusion (instantanés, évènements, ralenti
 * arbitré) et les entrées des sièges, chez les autres la boucle d'affichage
 * interpolé, et la fin du match.
 */
export class MatchLan {
  /** Numéro du dernier instantané envoyé (hôte). */
  private seqInstantane = 0;
  /** Hôte, pendant un match : le siège de chaque humain du simulateur (indice `équipe * 2 + rang`). */
  private siegesCore: (Siege | null)[] = [null, null, null, null];
  /** Hôte : phase de jeu vue à l'image précédente (détection des buts pour le ralenti). */
  private phaseHote: string | null = null;

  constructor(
    private readonly app: GameApp,
    private readonly lan: ParcoursLan,
  ) {}

  /** Numéro du prochain instantané : un appareil pris en route commence par lui. */
  get prochainInstantane(): number {
    return this.seqInstantane + 1;
  }

  /** Hôte : le siège réel de l'humain `rang` de l'équipe `eq` du simulateur. */
  siegeCore(eq: TeamId, partenaire: boolean): Siege | null {
    return this.siegesCore[eq * 2 + (partenaire ? 1 : 0)] ?? null;
  }

  /** Hôte : tous les joueurs ont validé, le match commence. */
  lanceMatchHote(): void {
    const h = this.lan.hote;
    if (!h) return;
    h.envoieCtrl({ t: 'debut', s0: this.seqInstantane + 1 });
    this.demarreMatch(h.partie, { role: 'hote', eqLocal: 0, dernierEnvoi: 0 });
  }

  private demarreMatch(e: EtatPartieLan, jeu: JeuReseau): void {
    const app = this.app;
    app.audio.init();
    void demandePleinEcranPaysage();
    const [c0, c1] = e.camps;
    const eqs: [EquipeVisuelle, EquipeVisuelle] = [resoutEquipe(trouveTeamDef(c0.equipe), c0.variante), resoutEquipe(trouveTeamDef(c1.equipe), c1.variante)];
    const comp = compositionHumaine(e);
    this.siegesCore = [siegeReel(e, 0, 0), siegeReel(e, 0, 1), siegeReel(e, 1, 0), siegeReel(e, 1, 1)];
    app.equipesActuelles = eqs;
    app.effets.definitEquipes(eqs);
    app.construitDecor();
    const c = e.config;
    const options: OptionsPartie = {
      mode: 'match',
      // versus : coéquipiers CPU au même niveau des deux côtés, seul le talent des humains départage ;
      // coop : le niveau du CPU est celui que l'hôte a réglé
      niveauIdx: c.format === 'coop' ? c.niveau : 1,
      dureeIdx: Math.min(c.duree, DUREES.length - 1),
      effectifIdx: Math.min(c.effectif, EFFECTIFS.length - 1),
      equipeJoueur: trouveEquipe(eqs[0].teamId),
      equipeAdverse: trouveEquipe(eqs[1].teamId),
      assistTir: c.assistTir,
      assistPasse: c.assistPasse,
      changementAuto: c.changementAuto,
      humains: comp.humains,
      duo: comp.duo,
      bonus: c.format === 'coop' ? ['aucun', 'aucun'] : [...e.bonus],
      dureeBut: dureeBut(c.ralenti),
      pouvoirs: c.pouvoirs,
    };
    this.phaseHote = null;
    app.demarreRalenti(options);
    app.state = creePartie(app.rink!, options);
    this.lan.jeu = jeu;
    this.lan.phaseVue = 'match';
    // repris en route (retour après une coupure) : le compte à rebours de reprise est peut-être en cours
    this.lan.finReprise = e.reprise > 0 ? performance.now() / 1000 + e.reprise : null;
    app.cumul = 0;
    app.effets.reinitialise();
    app.entrees.reinitialise();
    app.ecranUI = 'jeu';
    app.enPause = false;
    // repris en route : le compte à rebours de reprise suffit
    if (this.lan.finReprise === null) app.effets.annonce('PRETS ?', c.format === '1v1' ? 'MATCH EN RESEAU' : LIBELLES_FORMAT[c.format], C.blanc, 1.5);
  }

  surCtrlClient(m: MsgCtrl): void {
    if (m.t === 'debut') {
      const c = this.lan.client;
      const e = c?.partie;
      if (c && e) {
        const s = c.siege;
        this.demarreMatch(e, { role: 'client', eqLocal: s === null ? 0 : campDe(s), synchro: new SynchroClient(m.s0), spectateur: s === null });
      }
    } else if (m.t === 'reaction') {
      this.lan.ajouteReaction(m.r, m.de);
    } else if (m.t === 'ev') {
      if (this.lan.jeu?.role === 'client') this.lan.jeu.synchro.recoitEvenements(m.k, m.l);
    }
  }

  /**
   * Hôte, à chaque image et sur tous les écrans : compte à rebours de
   * reprise, attente d'un invité absent (qui peut tomber hors match aussi),
   * et score du match en cours repris dans l'annonce.
   */
  avanceHote(dt: number, state: MatchState | null): void {
    const h = this.lan.hote;
    if (!h) return;
    h.avance(dt);
    if (this.lan.jeu && state) h.majScore(state.score);
  }

  /** Hôte : évènements du pas (sons, particules...) pour l'invité et les spectateurs. */
  diffuseEvenements(state: MatchState): void {
    if (this.lan.jeu) this.lan.hote?.envoieCtrl({ t: 'ev', k: state.temps, l: evenementsPourEnvoi(state.evenements) });
  }

  /** Hôte : ~60 instantanés/s en jeu ; 4/s suffisent pendant une pause (rien ne bouge). */
  diffuseInstantane(state: MatchState, rink: Rink, t: number): void {
    const j = this.lan.jeu;
    if (!this.lan.hote || j?.role !== 'hote' || t - j.dernierEnvoi < (this.lan.pause ? 250 : 12)) return;
    this.lan.hote.envoieJeu(encodeInstantane(state, rink, ++this.seqInstantane));
    j.dernierEnvoi = t;
  }

  /** Hôte : nouveau but → votes « passer » remis à zéro ; tous ont passé → remise en jeu. */
  arbitreRalenti(state: MatchState): void {
    const h = this.lan.hote;
    if (this.lan.jeu?.role !== 'hote' || !h) return;
    if (state.phase === 'but' && this.phaseHote !== 'but') h.debutRalenti();
    this.phaseHote = state.phase;
    if (state.phase === 'but' && tousOntPasse(h.partie)) state.phaseT = Math.min(state.phaseT, 0.4);
  }

  /** Client : envoie ses entrées, puis affiche l'état interpolé reçu de l'hôte. */
  boucleClient(dt: number): void {
    const app = this.app;
    const j = this.lan.jeu;
    const state = app.state;
    const rink = app.rink;
    const c = this.lan.client;
    if (j?.role !== 'client' || !state || !rink || !c) return;
    const synchro = j.synchro;
    const maintenant = performance.now() / 1000;
    let intent = app.ecranUI === 'jeu' && !this.lan.pause && !this.lan.spectateur ? app.entrees.consomme() : INTENT_VIDE;
    const r = synchro.rinkHote;
    if (r) {
      const kx = r.w / rink.w;
      const ky = r.h / rink.h;
      const [ix, iy] = directionVersHote(intent.ix, intent.iy, kx, ky);
      const visee = intent.viseeManuelle === null ? null : angleVersHote(intent.viseeManuelle, kx, ky);
      intent = { ...intent, ix, iy, viseeManuelle: visee };
    }
    c.envoieEntree(intent);
    const evs = synchro.avance(state, rink, dt, maintenant);
    if (evs.length) {
      joueEvenements(app.audio, evs);
      app.effets.traite(evs);
    }
    app.effets.maj(dt);
    app.majRalenti(state, dt, false);
    if (state.phase === 'fin' && app.ecranUI === 'jeu') app.surFinMatch();
  }

  /** Fin d'un match réseau : place au vote côté hôte, et bilan des duels gardé sur chaque appareil. */
  finMatch(state: MatchState): void {
    if (!this.lan.jeu) return;
    if (this.lan.jeu.role === 'hote') this.lan.hote?.finMatch();
    this.lan.phaseVue = 'fin';
    // le bilan des duels ne compte que le 1 contre 1
    const e = this.lan.partie;
    const adversaire = e && e.config.format === '1v1' ? joueursAssis(e).find((j) => j.appareil !== this.app.pref.appareil) : null;
    if (adversaire && !this.lan.spectateur) {
      const moi = this.lan.eqLocal;
      const eux = moi === 0 ? 1 : 0;
      const sc = state.score;
      noteDuel(this.app.pref, adversaire.appareil, adversaire.nom, sc[moi] > sc[eux] ? 'v' : sc[moi] < sc[eux] ? 'd' : 'n');
    }
  }
}
