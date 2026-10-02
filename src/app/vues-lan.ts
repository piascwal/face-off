import { DUREES, EFFECTIFS, NIVEAUX } from '@core/constants';
import { trouveEquipe } from '@core/teams';
import { BONUS_EQUIPE, type MatchState } from '@core/types';
import { maillotsIdentiques, type ConfigLan, type EtatPartieLan, type JoueurLan } from '@net/partie';
import {
  C,
  dessineAttenteSpectateur,
  dessineBarreReactions,
  dessineChoixLan,
  dessineConfigLan,
  dessineCoupureLan,
  dessineFinLan,
  dessineFinSpectateur,
  dessineLan,
  dessinePauseLan,
  dessineReactions,
  dessineRepriseLan,
  dessineSalon,
  texte,
  trouveTeamDef,
  type CarteEquipe,
  type CoteChoixLan,
  type EtatChoixLan,
  type EtatConfigLan,
  type EtatFinLan,
  type EtatLan,
  type EtatSalon,
  type ResumeConfig,
} from '@render/index';
import type { GameApp } from './game-app';
import type { ParcoursLan } from './parcours-lan';
import { sauvePreferences } from './preferences';

function carteDe(id: string): CarteEquipe {
  const def = trouveTeamDef(id);
  return { def, profil: trouveEquipe(def.id) };
}

/**
 * Écrans du multijoueur Wi-Fi (voir parcours-lan.ts pour leur enchaînement) :
 * liste des parties, configuration, salle d'attente, choix des équipes et
 * maillots, attente du spectateur, fin de match et votes, et par-dessus le
 * match : latence, pause partagée, coupure, réactions.
 */
export class VuesLan {
  constructor(
    private readonly app: GameApp,
    private readonly lan: ParcoursLan,
  ) {}

  /** Latence Wi-Fi en coin d'écran, et alerte si l'hôte ne donne plus signe de vie. */
  dessineEtatReseau(g: CanvasRenderingContext2D, temps: number): void {
    const j = this.lan.jeu;
    if (!j) return;
    const { W, H } = this.app;
    const ms = (j.role === 'hote' ? this.lan.hote?.latenceMs : this.lan.client?.latenceMs) ?? null;
    // sous la jauge des bonus quand il y en a une
    const y = this.app.state?.pouvoirs ? 31 : 4;
    if (ms !== null) texte(g, `WIFI ${Math.max(1, Math.round(ms))} MS`, 4, y, ms < 60 ? '#6f7aa6' : '#ff9a5c', 1, 'g');
    // spectateurs connectés (et, chez eux, le rappel qu'ils regardent seulement)
    const nb = this.lan.partie?.spect ?? 0;
    if (this.lan.spectateur) texte(g, 'SPECTATEUR', 4, y + 9, '#8fe3ff', 1, 'g');
    else if (nb > 0) texte(g, `${nb} SPECT.`, 4, y + 9, '#6f7aa6', 1, 'g');
    if (j.role === 'client' && !this.lan.pause && j.synchro.silence(performance.now() / 1000) > 1) {
      const cy = Math.round(H / 2);
      g.fillStyle = 'rgba(7,9,20,0.6)';
      g.fillRect(0, cy - 12, W, 22);
      g.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(temps * 3));
      texte(g, "EN ATTENTE DE L'HOTE...", Math.round(W / 2), cy - 4, C.or, 1, 'c');
      g.globalAlpha = 1;
    }
  }

  /**
   * Match réseau figé : écran de pause (qui l'a demandée) ou compte à rebours
   * de reprise. Renvoie true si le match est figé (plus rien à dessiner dessus).
   */
  dessinePauseMatch(g: CanvasRenderingContext2D): boolean {
    const app = this.app;
    const partie = this.lan.partie;
    if (partie && this.lan.jeu && partie.pause !== null && partie.absent <= 0) {
      dessinePauseLan(g, app.boutons, app.W, app.H, {
        par: partie.joueurs[partie.pause]?.nom ?? '',
        onReprendre: this.lan.spectateur ? undefined : () => this.lan.agit({ a: 'pause', on: false }),
        onQuitter: () => this.lan.ouvre(),
      });
      return true;
    }
    if (!this.lan.pause) return false;
    // (coupure en cours : c'est son voile qui s'affiche, voir dessineCoupure)
    if (!this.lan.client?.reconnexion && !(partie && partie.absent > 0)) dessineRepriseLan(g, app.W, app.H, this.lan.repriseRestante());
    return true;
  }

  /** Dessine l'écran Wi-Fi en cours (y compris la fin d'un match réseau) ; false si ce n'en est pas un. */
  dessine(g: CanvasRenderingContext2D, temps: number, state: MatchState): boolean {
    const app = this.app;
    const { W, H, boutons } = app;
    const partie = this.lan.partie;
    switch (app.ecranUI) {
      case 'lan':
        dessineLan(g, boutons, W, H, temps, this.lanProps());
        return true;
      case 'lanConfig':
        dessineConfigLan(g, boutons, W, H, this.configProps());
        return true;
      case 'lanSpect':
        if (!partie) return true;
        dessineAttenteSpectateur(g, boutons, W, H, temps, {
          joueurs: [partie.joueurs[0].nom, partie.joueurs[1]?.nom ?? null],
          sous:
            partie.phase === 'attente'
              ? 'LES JOUEURS SE PREPARENT'
              : partie.phase === 'fin'
                ? 'LES JOUEURS VOTENT POUR LA SUITE'
                : 'LES JOUEURS CHOISISSENT LEURS EQUIPES',
          spect: partie.spect,
          onQuitter: () => this.lan.ouvre(),
        });
        return true;
      case 'salon':
        if (partie) dessineSalon(g, boutons, W, H, temps, this.salonProps(partie));
        return true;
      case 'lanChoix': {
        const props = partie && this.choixProps(partie);
        if (props) dessineChoixLan(g, boutons, app.sprites, W, H, temps, props);
        return true;
      }
      case 'fin':
        if (!partie || !this.lan.jeu) return false;
        if (this.lan.spectateur) {
          dessineFinSpectateur(g, boutons, W, H, temps, {
            score: state.score,
            tirs: state.tirs,
            stats: state.stats,
            prolong: state.prolong,
            noms: partie.config.coop
              ? [`${partie.joueurs[0].nom} ET ${partie.joueurs[1]?.nom ?? ''}`, 'LE CPU']
              : [partie.joueurs[0].nom, partie.joueurs[1]?.nom ?? ''],
            onQuitter: () => this.lan.ouvre(),
          });
        } else dessineFinLan(g, boutons, W, H, temps, this.finProps(state, partie));
        return true;
      default:
        return false;
    }
  }

  /**
   * Coupure Wi-Fi en cours de partie : chez l'hôte et les spectateurs, la
   * place gardée à l'invité ; chez l'invité, sa reconnexion. Le voile couvre
   * l'écran et remplace ses boutons.
   */
  dessineCoupure(g: CanvasRenderingContext2D, temps: number): void {
    const app = this.app;
    const e = this.lan.partie;
    const rc = this.lan.client?.reconnexion;
    if (rc && this.lan.client?.rejointe) {
      app.boutons = [];
      dessineCoupureLan(g, app.boutons, app.W, app.H, temps, {
        sous: `RECONNEXION A ${this.lan.client.rejointe.nom}...`,
        reste: (rc.limite - performance.now()) / 1000,
        bouton: { libelle: 'QUITTER LA PARTIE', act: () => this.lan.ouvre() },
      });
    } else if (e && e.absent > 0 && (this.lan.hote || this.lan.spectateur)) {
      app.boutons = [];
      const h = this.lan.hote;
      dessineCoupureLan(g, app.boutons, app.W, app.H, temps, {
        sous: `EN ATTENTE DE ${e.joueurs[1]?.nom ?? ''}`,
        reste: e.absent,
        bouton: h ? { libelle: 'NE PLUS ATTENDRE', act: () => h.arreteAttente() } : undefined,
      });
    }
  }

  /** Barre de réactions, puis les réactions qui montent (sur tous les écrans). */
  dessineReactions(g: CanvasRenderingContext2D, temps: number): void {
    const app = this.app;
    if (this.lan.barreReactionsVisible()) {
      dessineBarreReactions(g, app.boutons, Math.round(app.W / 2), app.H - 13, this.lan.logos(), (r) => this.lan.reagit(r), 10);
    }
    if (this.lan.reactions.length && (this.lan.jeu || app.ecranUI === 'lanSpect')) {
      dessineReactions(g, app.W, app.H, this.lan.reactions, temps, this.lan.logos());
    }
  }

  private lanProps(): EtatLan {
    return {
      statut: this.lan.statut,
      message: this.lan.message,
      parties: (this.lan.client?.parties ?? []).map((p) => ({
        nom: p.nom,
        equipe: trouveTeamDef(p.equipe),
        effectifIdx: p.effectif,
        dureeIdx: p.duree,
        plein: p.plein,
        adverse: p.adverse ? trouveTeamDef(p.adverse) : null,
        score: p.score,
        spect: p.spect,
        coop: p.coop,
        onRejoindre: () => this.lan.rejoins(p),
        onRegarder: () => this.lan.rejoins(p, true),
      })),
      pseudo: this.app.pref.pseudo,
      onRetour: () => this.lan.quitte(),
      onActualiser: () => this.lan.actualise(),
      onCreer: () => this.lan.ouvreConfig(),
    };
  }

  private configProps(): EtatConfigLan {
    const pref = this.app.pref;
    const bascule = (cle: 'assistTir' | 'assistPasse' | 'changementAuto' | 'ralentiButs' | 'bonus' | 'coopWifi') => () => {
      pref[cle] = !pref[cle];
      sauvePreferences(pref);
    };
    return {
      coop: pref.coopWifi,
      niveauIdx: pref.niveau,
      onCoop: bascule('coopWifi'),
      onNiveau: () => {
        pref.niveau = (pref.niveau + 1) % NIVEAUX.length;
        sauvePreferences(pref);
      },
      effectifIdx: pref.effectif,
      dureeIdx: pref.duree,
      assistTir: pref.assistTir,
      assistPasse: pref.assistPasse,
      changementAuto: pref.changementAuto,
      ralenti: pref.ralentiButs,
      pouvoirs: pref.bonus,
      onEffectif: () => {
        pref.effectif = (pref.effectif + 1) % EFFECTIFS.length;
        sauvePreferences(pref);
      },
      onDuree: () => {
        pref.duree = (pref.duree + 1) % DUREES.length;
        sauvePreferences(pref);
      },
      onAssistTir: bascule('assistTir'),
      onAssistPasse: bascule('assistPasse'),
      onChangementAuto: bascule('changementAuto'),
      onRalenti: bascule('ralentiButs'),
      onPouvoirs: bascule('bonus'),
      onRetour: () => this.lan.ouvre(),
      onCreer: () => this.lan.creePartie(),
    };
  }

  private resumeConfig(c: ConfigLan): ResumeConfig {
    return {
      coop: c.coop,
      niveauIdx: c.niveau,
      effectifIdx: c.effectif,
      dureeIdx: c.duree,
      assistTir: c.assistTir,
      assistPasse: c.assistPasse,
      changementAuto: c.changementAuto,
      ralenti: c.ralenti,
      pouvoirs: c.pouvoirs,
    };
  }

  /** « VOS DUELS : 5 V - 3 D » contre cet adversaire, ou null si vous ne vous êtes jamais affrontés. */
  private bilanContre(e: EtatPartieLan): string | null {
    const adv = e.joueurs[this.lan.place === 0 ? 1 : 0];
    const b = adv ? this.app.pref.duels[adv.appareil] : undefined;
    if (!b) return null;
    return `VOS DUELS : ${b.v} V - ${b.d} D${b.n ? ` - ${b.n} N` : ''}`;
  }

  private salonProps(e: EtatPartieLan): EtatSalon {
    const maintenant = performance.now() / 1000;
    const message = this.lan.salonMessage && this.lan.salonMessage.jusqua > maintenant ? this.lan.salonMessage.txt : null;
    const session = this.lan.hote ?? this.lan.client;
    return {
      role: this.lan.hote ? 'hote' : 'client',
      hote: e.joueurs[0].nom,
      invite: e.joueurs[1]?.nom ?? null,
      connexionEnCours: this.lan.hote?.connexionEnCours ?? false,
      config: this.resumeConfig(e.config),
      code: session?.code ?? null,
      latenceMs: session?.latenceMs ?? null,
      message,
      bonus: e.bonus,
      bilan: this.bilanContre(e),
      onBonus: (place) => {
        const i = BONUS_EQUIPE.indexOf(e.bonus[place]);
        this.lan.agit({ a: 'bonus', place, bonus: BONUS_EQUIPE[(i + 1) % BONUS_EQUIPE.length]! });
      },
      onLancer: () => this.lan.agit({ a: 'lancer' }),
      onExclure: () => this.lan.hote?.exclut(),
      onQuitter: () => this.lan.ouvre(),
    };
  }

  private choixProps(e: EtatPartieLan): EtatChoixLan | null {
    const [a, b] = e.joueurs;
    if (!b || (e.phase !== 'equipes' && e.phase !== 'maillots')) return null;
    const moi = this.lan.place;
    const cote = (j: JoueurLan): CoteChoixLan => ({ nom: j.nom, pret: j.pret, carte: carteDe(j.equipe), variante: j.variante });
    const autre = moi === 0 ? b : a;
    return {
      etape: e.phase,
      coop: e.config.coop,
      moi,
      cotes: [cote(a), cote(b)],
      maillotPris: e.phase === 'maillots' && autre.pret && maillotsIdentiques(e),
      onPrecedent: () => this.lan.tourneEquipe(-1),
      onSuivant: () => this.lan.tourneEquipe(1),
      onToggleMaillot: () => this.lan.tourneEquipe(1),
      onPret: (pret) => this.lan.agit({ a: 'pret', pret }),
      onQuitter: () => this.lan.ouvre(),
    };
  }

  private finProps(state: MatchState, e: EtatPartieLan): EtatFinLan {
    const moi = this.lan.place;
    const eux = moi === 0 ? 1 : 0;
    return {
      score: state.score,
      tirs: state.tirs,
      stats: state.stats,
      bilan: e.config.coop ? 'A DEUX CONTRE LE CPU' : this.bilanContre(e),
      prolong: state.prolong,
      // l'équipe de ce joueur (la même pour les deux en coop), pour lire victoire ou défaite
      moi: this.lan.eqLocal,
      monVote: e.joueurs[moi]?.vote ?? null,
      voteAdverse: e.joueurs[eux]?.vote ?? null,
      nomAdverse: e.joueurs[eux]?.nom ?? '',
      onVote: (vote) => this.lan.agit({ a: 'vote', vote }),
      onQuitter: () => this.lan.ouvre(),
    };
  }
}
