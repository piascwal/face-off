/**
 * Charge les feuilles de sprites PNG pixel art générées hors-ligne par
 * `scripts/generate-sprites.mjs` : joueurs et gardiens illustrés, repeints
 * aux couleurs de chaque équipe (voir `scripts/sprites-illustres.mjs`), et
 * le calque commun des variantes de visage.
 *
 * Une équipe par maillot : chaque équipe jouable a sa propre feuille (voir
 * `team-visuals.ts` pour la liste des id), chargées à la demande la première
 * fois qu'un match les utilise plutôt que toutes d'un coup. La grille et les
 * ancrages sont lus dans `public/sprites/meta.json`.
 */

interface Point {
  x: number;
  y: number;
}

/** Grille des feuilles, écrite par scripts/generate-sprites.mjs dans public/sprites/meta.json. */
export interface MetaSprites {
  /**
   * `echelle` : taille d'un pixel de sprite en pixels logiques du jeu (< 1 :
   * le dessin est plus fin que la grille du jeu). `pied` : point de la case
   * posé sur la position du joueur. `tete` : haut du casque dans la case.
   * `decalage` : en jeu, le dessin est reculé (> 0) ou avancé (< 0) d'autant
   * de pixels de sprite par rapport à `pied`, dans le sens où regarde le joueur.
   */
  joueur: { tileW: number; tileH: number; images: number; arret: number; pied: Point; tete: number; echelle: number; decalage: number };
  gardien: { tileW: number; tileH: number; pied: Point; echelle: number; decalage: number };
  /** Joueur de face de l'écran des maillots (crosse à droite, puis en miroir). */
  portrait: { tileW: number; tileH: number };
  /**
   * Défenseur esquivé, au sol : plongeon puis allongé (tête vers la droite,
   * puis en miroir). `pied` : centre du corps ; `tete` : centre du casque, par image.
   */
  chute: { tileW: number; tileH: number; images: number; pied: Point; tete: Point[]; echelle: number };
  /** Célébrations de l'écran de but (de face), une case par dessin, posées sur le bas de la case. */
  celebration: { tileW: number; tileH: number; images: number };
  /** Nombre de variantes de visage dans visages.png. */
  visages: number;
  teamIds: string[];
}

const META_DEFAUT: MetaSprites = {
  joueur: { tileW: 133, tileH: 105, images: 4, arret: 0, pied: { x: 52, y: 101 }, tete: 0, echelle: 0.28, decalage: 10 },
  gardien: { tileW: 132, tileH: 115, pied: { x: 71, y: 113 }, echelle: 0.2, decalage: -41 },
  portrait: { tileW: 92, tileH: 116 },
  chute: { tileW: 176, tileH: 102, images: 2, pied: { x: 88, y: 43 }, tete: [{ x: 114, y: 31 }, { x: 125, y: 39 }], echelle: 0.22 },
  celebration: { tileW: 91, tileH: 123, images: 1 },
  visages: 1,
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
  private portraits = new Map<string, HTMLImageElement>();
  private chutes = new Map<string, HTMLImageElement>();
  private celebrations = new Map<string, HTMLImageElement>();
  private visages: HTMLImageElement | null = null;
  private enCours = new Map<string, Promise<void>>();
  pret = false;

  async charge(base = this.base): Promise<void> {
    this.base = base;
    this.meta = await fetch(`${base}/meta.json`).then((r) => r.json() as Promise<MetaSprites>);
    this.pret = true;
    chargeImage(`${base}/visages.png`).then(
      (img) => (this.visages = img),
      () => undefined, // sans le calque, les joueurs gardent le visage du dessin d'origine
    );
  }

  /** Précharge les feuilles d'une équipe (idempotent) — à appeler avant un match. */
  async precharge(teamId: string): Promise<void> {
    if (this.skaters.has(teamId)) return;
    const enCours = this.enCours.get(teamId);
    if (enCours) return enCours;
    const p = (async () => {
      const [s, g, p, c, ce] = await Promise.all([
        chargeImage(`${this.base}/skater-${teamId}.png`),
        chargeImage(`${this.base}/goalie-${teamId}.png`),
        chargeImage(`${this.base}/portrait-${teamId}.png`),
        chargeImage(`${this.base}/chute-${teamId}.png`),
        chargeImage(`${this.base}/celebration-${teamId}.png`),
      ]);
      this.celebrations.set(teamId, ce);
      this.skaters.set(teamId, s);
      this.goalies.set(teamId, g);
      this.portraits.set(teamId, p);
      this.chutes.set(teamId, c);
    })();
    this.enCours.set(teamId, p);
    return p;
  }

  /** Image `frame` du cycle de patinage. Rangées de la feuille : 0 vers la droite, 1 vers la gauche. */
  spriteJoueur(teamId: string, frame: number, gauche: boolean): { img: HTMLImageElement; rect: Rect } | null {
    const img = this.skaters.get(teamId);
    if (!img) return null;
    const { tileW, tileH, images } = this.meta.joueur;
    const col = ((frame % images) + images) % images;
    return { img, rect: { sx: col * tileW, sy: (gauche ? 1 : 0) * tileH, sw: tileW, sh: tileH } };
  }

  /** Calque du visage `variante` (teint, barbe), à poser sur l'image `frame` du joueur. */
  spriteVisage(variante: number, frame: number, gauche: boolean): { img: HTMLImageElement; rect: Rect } | null {
    const img = this.visages;
    const n = this.meta.visages;
    if (!img || n < 2) return null;
    const { tileW, tileH, images } = this.meta.joueur;
    const col = ((frame % images) + images) % images;
    const rang = (((variante % n) + n) % n) + (gauche ? n : 0);
    return { img, rect: { sx: col * tileW, sy: rang * tileH, sw: tileW, sh: tileH } };
  }

  /** Joueur de face (écran des maillots) ; `miroir` : crosse à gauche. */
  spritePortrait(teamId: string, miroir: boolean): { img: HTMLImageElement; rect: Rect } | null {
    const img = this.portraits.get(teamId);
    if (!img) return null;
    const { tileW, tileH } = this.meta.portrait;
    return { img, rect: { sx: 0, sy: (miroir ? 1 : 0) * tileH, sw: tileW, sh: tileH } };
  }

  /** Joueur au sol : image 0 plongeon, 1 allongé ; `gauche` : tête vers la gauche. */
  spriteChute(teamId: string, frame: number, gauche: boolean): { img: HTMLImageElement; rect: Rect } | null {
    const img = this.chutes.get(teamId);
    if (!img) return null;
    const { tileW, tileH, images } = this.meta.chute;
    const col = Math.min(images - 1, Math.max(0, frame));
    return { img, rect: { sx: col * tileW, sy: (gauche ? 1 : 0) * tileH, sw: tileW, sh: tileH } };
  }

  /** Célébration de l'écran de but : `tirage` choisit le dessin (modulo leur nombre). */
  spriteCelebration(teamId: string, tirage: number): { img: HTMLImageElement; rect: Rect } | null {
    const img = this.celebrations.get(teamId);
    if (!img) return null;
    const { tileW, tileH, images } = this.meta.celebration;
    const col = ((Math.floor(tirage) % images) + images) % images;
    return { img, rect: { sx: col * tileW, sy: 0, sw: tileW, sh: tileH } };
  }

  spriteGardien(teamId: string, gauche: boolean): { img: HTMLImageElement; rect: Rect } | null {
    const img = this.goalies.get(teamId);
    if (!img) return null;
    const { tileW, tileH } = this.meta.gardien;
    return { img, rect: { sx: 0, sy: (gauche ? 1 : 0) * tileH, sw: tileW, sh: tileH } };
  }
}
