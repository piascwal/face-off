/**
 * Charge les feuilles de sprites PNG pixel art générées hors-ligne par
 * `scripts/generate-sprites.mjs` (voir ce script pour le détail du rendu :
 * plus de nuances que le POC, chandails à numéro, visière, lame qui brille...).
 *
 * Une équipe par maillot : chaque équipe jouable a sa propre feuille (voir
 * `team-visuals.ts` pour la liste des id), chargées à la demande la première
 * fois qu'un match les utilise plutôt que les 12 fichiers d'un coup.
 *
 * Une vraie infographiste pourra plus tard remplacer directement les PNG dans
 * `public/sprites/` (même grille, mêmes dimensions dans `meta.json`) sans
 * toucher au code : c'est tout l'intérêt de sortir ces assets du JS.
 */

interface Meta {
  tileW: number;
  tileH: number;
  skaterFrames: number;
  teamIds: string[];
}

export interface Rect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

const chargeImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

export class BanqueSprites {
  private meta: Meta = { tileW: 24, tileH: 32, skaterFrames: 3, teamIds: [] };
  private base = `${import.meta.env.BASE_URL}sprites`;
  private skaters = new Map<string, HTMLImageElement>();
  private goalies = new Map<string, HTMLImageElement>();
  private enCours = new Map<string, Promise<void>>();
  pret = false;

  async charge(base = this.base): Promise<void> {
    this.base = base;
    this.meta = await fetch(`${base}/meta.json`).then((r) => r.json() as Promise<Meta>);
    this.pret = true;
  }

  /** Précharge les feuilles d'une équipe (idempotent) — à appeler avant un match. */
  async precharge(teamId: string): Promise<void> {
    if (this.skaters.has(teamId)) return;
    const enCours = this.enCours.get(teamId);
    if (enCours) return enCours;
    const p = (async () => {
      const [s, g] = await Promise.all([
        chargeImage(`${this.base}/skater-${teamId}.png`),
        chargeImage(`${this.base}/goalie-${teamId}.png`),
      ]);
      this.skaters.set(teamId, s);
      this.goalies.set(teamId, g);
    })();
    this.enCours.set(teamId, p);
    return p;
  }

  get tailleJoueur(): { w: number; h: number } {
    return { w: this.meta.tileW, h: this.meta.tileH };
  }

  spriteJoueur(teamId: string, frame: number, gauche: boolean): { img: HTMLImageElement; rect: Rect } | null {
    const img = this.skaters.get(teamId);
    if (!img) return null;
    const { tileW, tileH, skaterFrames } = this.meta;
    const col = Math.max(0, Math.min(skaterFrames - 1, frame));
    const row = gauche ? 1 : 0;
    return { img, rect: { sx: col * tileW, sy: row * tileH, sw: tileW, sh: tileH } };
  }

  spriteGardien(teamId: string, gauche: boolean): { img: HTMLImageElement; rect: Rect } | null {
    const img = this.goalies.get(teamId);
    if (!img) return null;
    const { tileW, tileH } = this.meta;
    const row = gauche ? 1 : 0;
    return { img, rect: { sx: 0, sy: row * tileH, sw: tileW, sh: tileH } };
  }
}
