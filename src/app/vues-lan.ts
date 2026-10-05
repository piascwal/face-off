import { DUREES, EFFECTIFS, NIVEAUX } from '@core/constants';
import { trouveEquipe } from '@core/teams';
import { BONUS_EQUIPE, type MatchState } from '@core/types';
import {
  campDe,
  hoteChoisit,
  joueursAssis,
  joueursDuCamp,
  maillotsIdentiques,
  peutLancer,
  PLACES_FORMAT,
  siegesLibres,
  SPECTATEURS_MAX,
  FORMATS,
  type Camp,
  type ConfigLan,
  type EtatPartieLan,
  type Siege,
} from '@net/partie';
import {
  C,
  dessineAttenteSpectateur,
  dessineBarreReactions,
  dessineChoixLan,
  dessineChoixRole,
  dessineConfigLan,
  dessineCoupureLan,
  dessineFinLan,
  dessineFinSpectateur,
  dessineLan,
  dessineLigne,
  dessineMulti,
  dessinePauseLan,
  dessineReactions,
  dessineRepriseLan,
  dessineSalon,
  px,
  texte,
  trouveTeamDef,
  type CarteEquipe,
  type CoteChoixLan,
  type EtatChoixLan,
  type EtatChoixRole,
  type EtatConfigLan,
  type PlaceSalon,
  type EtatFinLan,
  type EtatLan,
  type EtatSalon,
  type ResumeConfig,
} from '@render/index';
import { qualitePing, texteLatence } from '@piascwal/lan-kit';
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
    // le ping de chaque joueur, vu par l'hôte ; sans cela (spectateur), le sien
    const e = this.lan.partie;
    const pings = this.lan.pings();
    const joueurs = e ? e.sieges.flatMap((j, s) => (j && s > 0 ? [{ nom: j.nom, ms: pings[s] ?? null, moi: j.appareil === this.app.pref.appareil }] : [])) : [];
    if (!joueurs.length && ms !== null) joueurs.push({ nom: 'VOUS', ms, moi: true });
    joueurs.forEach((p, i) => {
      const q = qualitePing(p.ms);
      const couleur = q === 'bon' ? '#5cf08a' : q === 'moyen' ? C.or : q === 'mauvais' ? '#ff7a90' : '#6f7aa6';
      px(g, 4, y + i * 9 + 2, 3, 3, couleur);
      texte(g, `${p.nom.slice(0, 10)} ${texteLatence(p.ms)}`, 10, y + i * 9, p.moi ? C.blanc : '#6f7aa6', 1, 'g');
    });
    // spectateurs connectés (et, chez eux, le rappel qu'ils regardent seulement)
    const nb = e ? e.spectateurs.length + e.indecis.length : 0;
    const yS = y + Math.max(1, joueurs.length) * 9;
    if (this.lan.spectateur) texte(g, 'SPECTATEUR', 4, yS, '#8fe3ff', 1, 'g');
    else if (nb > 0) texte(g, `${nb} SPECT.`, 4, yS, '#6f7aa6', 1, 'g');
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
        par: partie.sieges[partie.pause]?.nom ?? '',
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
      case 'multi':
        dessineMulti(g, boutons, W, H, this.lan.ligne.vueMulti());
        return true;
      case 'lanLigne':
        dessineLigne(g, boutons, W, H, temps, this.lan.ligne.vueLigne());
        return true;
      case 'lan':
        dessineLan(g, boutons, W, H, temps, this.lanProps());
        return true;
      case 'lanConfig':
        dessineConfigLan(g, boutons, W, H, this.configProps());
        return true;
      case 'lanSpect':
        if (!partie) return true;
        dessineAttenteSpectateur(g, boutons, W, H, temps, {
          camps: [joueursDuCamp(partie, 0).map((j) => j.nom), joueursDuCamp(partie, 1).map((j) => j.nom)],
          sous:
            partie.phase === 'attente'
              ? 'LES JOUEURS SE PREPARENT'
              : partie.phase === 'fin'
                ? 'LES JOUEURS VOTENT POUR LA SUITE'
                : 'LES JOUEURS CHOISISSENT LEURS EQUIPES',
          spect: partie.spectateurs.length + partie.indecis.length,
          onQuitter: () => this.lan.ouvre(),
        });
        return true;
      case 'salon':
        if (partie) dessineSalon(g, boutons, app.sprites, W, H, temps, this.salonProps(partie));
        return true;
      case 'lanRole':
        if (partie) dessineChoixRole(g, boutons, app.sprites, W, H, temps, this.roleProps(partie));
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
            noms: this.nomsDesCamps(partie),
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
        sous: `EN ATTENTE DE ${e.absents.map((s) => e.sieges[s]?.nom ?? '').join(' ET ')}`,
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
        enCours: p.enCours,
        format: p.format,
        joueurs: p.joueurs,
        places: PLACES_FORMAT[p.format][0] + PLACES_FORMAT[p.format][1],
        adverse: p.adverse ? trouveTeamDef(p.adverse) : null,
        score: p.score,
        spect: p.spect,
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
    const bascule = (cle: 'assistTir' | 'assistPasse' | 'changementAuto' | 'ralentiButs' | 'bonus') => () => {
      pref[cle] = !pref[cle];
      sauvePreferences(pref);
    };
    return {
      format: pref.formatWifi,
      niveauIdx: pref.niveau,
      onFormat: () => {
        pref.formatWifi = FORMATS[(FORMATS.indexOf(pref.formatWifi) + 1) % FORMATS.length]!;
        sauvePreferences(pref);
      },
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
      format: c.format,
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

  /** « VOS DUELS : 5 V - 3 D » contre l'adversaire (1 contre 1 seulement), ou null si vous ne vous êtes jamais affrontés. */
  private bilanContre(e: EtatPartieLan): string | null {
    if (e.config.format !== '1v1') return null;
    const adv = joueursAssis(e).find((j) => j.appareil !== this.app.pref.appareil);
    const b = adv ? this.app.pref.duels[adv.appareil] : undefined;
    if (!b) return null;
    return `VOS DUELS : ${b.v} V - ${b.d} D${b.n ? ` - ${b.n} N` : ''}`;
  }

  /** Noms des joueurs de chaque camp, pour les écrans de spectateur et de fin. */
  private nomsDesCamps(e: EtatPartieLan): [string, string] {
    const noms = (camp: Camp) => joueursDuCamp(e, camp).map((j) => j.nom).join(' ET ');
    return [noms(0), noms(1) || 'LE CPU'];
  }

  /** Portrait de chaque camp dans la salle : l'équipe de l'hôte à gauche, l'adversaire (ou son maillot extérieur) à droite. */
  private maillotsSalle(e: EtatPartieLan): [string, string] {
    const [a, b] = e.camps;
    return [`${a.equipe}-${a.variante}`, `${b.equipe}-${b.equipe === a.equipe && b.variante === a.variante ? 'exterieur' : b.variante}`];
  }

  private salonProps(e: EtatPartieLan): EtatSalon {
    const maintenant = performance.now() / 1000;
    const message = this.lan.salonMessage && this.lan.salonMessage.jusqua > maintenant ? this.lan.salonMessage.txt : null;
    const session = this.lan.hote ?? this.lan.client;
    const hote = !!this.lan.hote;
    const moiRole = this.lan.client?.role ?? { t: 'siege' as const, siege: 0 as Siege };
    const libres = siegesLibres(e);
    const pings = this.lan.pings();
    const placeDe = (s: Siege): PlaceSalon | null => {
      const [n0, n1] = PLACES_FORMAT[e.config.format];
      if ((s >> 1 === 0 ? n0 : n1) <= (s & 1)) return null;
      const j = e.sieges[s];
      return {
        joueur: j ? { nom: j.nom, moi: j.appareil === this.app.pref.appareil, hote: s === 0, ping: pings[s] ?? null } : null,
        // le siège libre se prend d'un toucher ; l'hôte, assis d'office, ne bouge pas
        onPrendre: !j && !hote && libres.includes(s) ? () => this.lan.prendSiege(s) : null,
        onExclure: hote && j && s !== 0 ? () => this.lan.hote?.exclut(j.appareil) : null,
      };
    };
    const regardeurs = [
      ...e.spectateurs.map((m) => ({ nom: m.nom, moi: m.appareil === this.app.pref.appareil, indecis: false })),
      ...e.indecis.map((m) => ({ nom: m.nom, moi: m.appareil === this.app.pref.appareil, indecis: true })),
    ];
    const codeHote = hote ? (joueursAssis(e).map((j) => this.lan.hote?.codeDe(j.appareil)).find(Boolean) ?? null) : null;
    return {
      hote,
      nomHote: e.sieges[0]!.nom,
      format: e.config.format,
      onFormat: hote ? () => this.lan.hote?.agit({ a: 'format', format: FORMATS[(FORMATS.indexOf(e.config.format) + 1) % FORMATS.length]! }) : null,
      maillots: this.maillotsSalle(e),
      places: [placeDe(0), placeDe(1), placeDe(2), placeDe(3)],
      spectateurs: regardeurs,
      spectateursMax: SPECTATEURS_MAX,
      config: this.resumeConfig(e.config),
      connexionEnCours: this.lan.hote?.connexionEnCours ?? false,
      code: hote ? codeHote : (this.lan.client?.code ?? null),
      latenceMs: session?.latenceMs ?? null,
      ligne: this.lan.canal.type === 'ligne' && this.lan.canal.code ? this.salonEnLigne(this.lan.canal.code) : null,
      message,
      bonus: e.bonus,
      onBonus: hote
        ? (camp) => {
            const i = BONUS_EQUIPE.indexOf(e.bonus[camp]);
            this.lan.agit({ a: 'bonus', camp, bonus: BONUS_EQUIPE[(i + 1) % BONUS_EQUIPE.length]! });
          }
        : null,
      bilan: this.bilanContre(e),
      moi: moiRole.t,
      onLancer: hote ? () => this.lan.agit({ a: 'lancer' }) : null,
      peutLancer: peutLancer(e),
      onRegarder: !hote && moiRole.t === 'siege' ? () => this.lan.regarde() : null,
      onQuitter: () => this.lan.ouvre(),
    };
  }

  /** Le code du salon en ligne et le partage de son lien, pour la salle d'attente. */
  private salonEnLigne(code: string): { code: string; copie: boolean; onPartage: () => void } {
    return { code, copie: this.lan.ligne.copie, onPartage: () => this.lan.ligne.partage(code) };
  }

  private roleProps(e: EtatPartieLan): EtatChoixRole {
    const [n0, n1] = PLACES_FORMAT[e.config.format];
    return {
      nomHote: e.sieges[0]!.nom,
      joueurs: joueursAssis(e).length,
      places: n0 + n1,
      spectateurs: e.spectateurs.length + e.indecis.length,
      spectateursMax: SPECTATEURS_MAX,
      siegeLibre: siegesLibres(e).length > 0,
      maillot: this.maillotsSalle(e)[0],
      onJouer: () => this.lan.veutJouer(),
      onRegarder: () => this.lan.regarde(),
      onQuitter: () => this.lan.ouvre(),
    };
  }

  private choixProps(e: EtatPartieLan): EtatChoixLan | null {
    const siege = this.lan.siege;
    if (siege === null || (e.phase !== 'equipes' && e.phase !== 'maillots')) return null;
    const moi = campDe(siege);
    const auChoix = hoteChoisit(e.config);
    const hote = !!this.lan.hote;
    const coop = e.config.format === 'coop';
    const hotePret = e.sieges[0]!.pret;
    const cote = (camp: Camp): CoteChoixLan => {
      const joueurs = joueursDuCamp(e, camp);
      return {
        nom: joueurs.map((j) => j.nom).join(' ET ') || 'CPU',
        // l'hôte valide pour tout le monde dès qu'il y a plusieurs joueurs ; en 1 contre 1, chacun valide pour soi
        pret: auChoix ? hotePret : joueurs.every((j) => j.pret),
        carte: carteDe(e.camps[camp].equipe),
        variante: e.camps[camp].variante,
      };
    };
    const autre = joueursAssis(e).find((j) => j.appareil !== this.app.pref.appareil);
    return {
      etape: e.phase,
      coop,
      hoteChoisit: auChoix,
      hote,
      nomHote: e.sieges[0]!.nom,
      moi,
      cotes: [cote(0), cote(1)],
      maillotPris: e.phase === 'maillots' && (auChoix || !!autre?.pret) && maillotsIdentiques(e),
      onPrecedent: (c) => this.lan.tourneEquipe(-1, c),
      onSuivant: (c) => this.lan.tourneEquipe(1, c),
      onToggleMaillot: (c) => this.lan.tourneEquipe(1, c),
      onPret: (pret) => this.lan.agit({ a: 'pret', pret }),
      onQuitter: () => this.lan.ouvre(),
    };
  }

  private finProps(state: MatchState, e: EtatPartieLan): EtatFinLan {
    const siege = this.lan.siege;
    const moi = siege === null ? null : e.sieges[siege];
    return {
      score: state.score,
      tirs: state.tirs,
      stats: state.stats,
      bilan: e.config.format === 'coop' ? 'ENSEMBLE CONTRE LE CPU' : this.bilanContre(e),
      prolong: state.prolong,
      // l'équipe de ce joueur, pour lire victoire ou défaite
      moi: this.lan.eqLocal,
      monVote: moi?.vote ?? null,
      autres: joueursAssis(e)
        .filter((j) => j !== moi)
        .map((j) => ({ nom: j.nom, vote: j.vote })),
      onVote: (vote) => this.lan.agit({ a: 'vote', vote }),
      onQuitter: () => this.lan.ouvre(),
    };
  }
}
