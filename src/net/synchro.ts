import type { GameEvent, MatchState, Rink } from '@core/types';
import { appliqueInstantane, lisEvenement, type Instantane } from './protocole';

const DELAI_MIN = 0.025;
const DELAI_MAX = 0.2;
const TAMPON_MAX = 40;

/**
 * Côté client : met en file les instantanés de l'hôte et en tire, à chaque
 * image, un état interpolé affiché avec un léger retard. Le retard s'adapte
 * à la régularité du Wi-Fi (gigue mesurée) : ~30 ms sur un réseau calme,
 * davantage s'il hoquette — plutôt qu'un personnage qui saccade. Les
 * évènements (sons, particules, annonces) sont datés et joués au moment où
 * l'image correspondante s'affiche.
 */
export class SynchroClient {
  private tampon: Instantane[] = [];
  private evenements: { k: number; l: unknown[] }[] = [];
  private tRendu: number | null = null;
  private gigue = 0.004;
  private delai = 0.045;
  private arriveeDerniere = 0;

  /** Les instantanés d'un match précédent (numérotés avant `seqMin`) sont ignorés. */
  constructor(private readonly seqMin = 0) {}

  get rinkHote(): Instantane['rink'] | null {
    return this.tampon.at(-1)?.rink ?? null;
  }

  get delaiAffichage(): number {
    return this.delai;
  }

  /** Secondes écoulées depuis le dernier instantané reçu. */
  silence(maintenant: number): number {
    return this.tampon.length ? maintenant - this.arriveeDerniere : 0;
  }

  recoit(inst: Instantane, maintenant: number): void {
    if (inst.seq < this.seqMin) return;
    const dernier = this.tampon.at(-1);
    if (dernier) {
      // arrivé en retard, dépassé par un plus récent : inutile
      if (inst.seq <= dernier.seq) return;
      const ecart = Math.abs(maintenant - this.arriveeDerniere - (inst.temps - dernier.temps));
      this.gigue = this.gigue * 0.92 + Math.min(0.25, ecart) * 0.08;
      this.delai = Math.min(DELAI_MAX, Math.max(DELAI_MIN, 1 / 60 + this.gigue * 3));
    }
    this.tampon.push(inst);
    if (this.tampon.length > TAMPON_MAX) this.tampon.shift();
    this.arriveeDerniere = maintenant;
  }

  recoitEvenements(k: number, l: unknown[]): void {
    this.evenements.push({ k, l });
    if (this.evenements.length > 120) this.evenements.shift();
  }

  /**
   * Avance l'horloge d'affichage de `dt`, écrit l'état interpolé dans
   * `state` et renvoie les évènements dont l'heure est venue.
   */
  avance(state: MatchState, local: Rink, dt: number, maintenant: number): GameEvent[] {
    const dernier = this.tampon.at(-1);
    if (!dernier) return [];
    // où en est l'hôte « maintenant », moins le retard d'affichage
    const cible = dernier.temps + (maintenant - this.arriveeDerniere) - this.delai;
    if (this.tRendu === null || Math.abs(this.tRendu - cible) > 0.25) this.tRendu = cible;
    else this.tRendu += dt + (cible - this.tRendu) * 0.08;
    const t = this.tRendu;

    let a = this.tampon[0]!;
    let b = a;
    for (let i = 0; i < this.tampon.length; i++) {
      const s = this.tampon[i]!;
      if (s.temps <= t) {
        a = s;
        b = this.tampon[i + 1] ?? s;
      }
    }
    if (t < a.temps) b = a;
    const alpha = b.temps > a.temps ? Math.min(1, Math.max(0, (t - a.temps) / (b.temps - a.temps))) : 1;
    appliqueInstantane(state, a, b, alpha, local);
    // on garde `a` (et ce qui suit) pour l'image suivante
    const ia = this.tampon.indexOf(a);
    if (ia > 0) this.tampon.splice(0, ia);

    const r = dernier.rink;
    const kx = local.w / r.w;
    const ky = local.h / r.h;
    const versLocal = (x: number, y: number): [number, number] => [local.x + (x - r.x) * kx, local.y + (y - r.y) * ky];
    const prets: GameEvent[] = [];
    while (this.evenements.length && (this.evenements[0]!.k <= t || this.evenements[0]!.k < dernier.temps - 0.5)) {
      for (const o of this.evenements.shift()!.l) {
        const ev = lisEvenement(o, versLocal, [kx, ky]);
        if (ev) prets.push(ev);
      }
    }
    return prets;
  }
}
