/**
 * Charge les feuilles de sprites PNG pixel art générées hors-ligne par
 * `scripts/generate-sprites.mjs` (joueurs de profil recolorés d'après le
 * sprite de référence `assets/sprites-src/joueur-reference.png`).
 *
 * Une équipe par maillot : chaque équipe jouable a sa propre feuille (voir
 * `team-visuals.ts` pour la liste des id), chargées à la demande la première
 * fois qu'un match les utilise plutôt que toutes d'un coup. La grille et les
 * ancrages (pieds, gants) sont lus dans `public/sprites/meta.json`.
 */

interface Point {
  x: number;
  y: number;
}

/** Grille des feuilles, écrite par scripts/generate-sprites.mjs dans public/sprites/meta.json. */
export interface MetaSprites {
  /** Taille d'un pixel de sprite, en pixels logiques du jeu (détail « double » : < 1). */
  echelle: number;
  joueur: { tileW: number; tileH: number; images: number; bob: number[]; pied: Point; gants: Point };
  gardien: { tileW: number; tileH: number; pied: Point };
  teamIds: string[];
}

const META_DEFAUT: MetaSprites = {
  echelle: 36 / 56,
  joueur: { tileW: 58, tileH: 60, images: 8, bob: [0, 1, 1, 0, 0, 1, 1, 0], pied: { x: 25, y: 57 }, gants: { x: 37, y: 29 } },
  gardien: { tileW: 40, tileH: 43, pied: { x: 16, y: 41 } },
  teamIds: [],
};

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
  meta: MetaSprites = META_DEFAUT;
  private base = `${import.meta.env.BASE_URL}sprites`;
  private skaters = new Map<string, HTMLImageElement>();
  private goalies = new Map<string, HTMLImageElement>();
  private enCours = new Map<string, Promise<void>>();
  pret = false;

  async charge(base = this.base): Promise<void> {
    this.base = base;
    this.meta = await fetch(`${base}/meta.json`).then((r) => r.json() as Promise<MetaSprites>);
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

  /**
   * Image `frame` du cycle de patinage. Rangées de la feuille : 0 corps vers
   * la droite, 1 vers la gauche, 2 et 3 le calque des gants (à redessiner
   * par-dessus le manche de la crosse).
   */
  spriteJoueur(teamId: string, frame: number, gauche: boolean, gants = false): { img: HTMLImageElement; rect: Rect } | null {
    const img = this.skaters.get(teamId);
    if (!img) return null;
    const { tileW, tileH, images } = this.meta.joueur;
    const col = ((frame % images) + images) % images;
    const row = (gants ? 2 : 0) + (gauche ? 1 : 0);
    return { img, rect: { sx: col * tileW, sy: row * tileH, sw: tileW, sh: tileH } };
  }

  spriteGardien(teamId: string, gauche: boolean): { img: HTMLImageElement; rect: Rect } | null {
    const img = this.goalies.get(teamId);
    if (!img) return null;
    const { tileW, tileH } = this.meta.gardien;
    return { img, rect: { sx: 0, sy: (gauche ? 1 : 0) * tileH, sw: tileW, sh: tileH } };
  }
}
