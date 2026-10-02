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
  /**
   * Geste de tir : armé, descente, impact, accompagnement (rangée 0 vers la
   * droite, 1 vers la gauche). Même échelle que le patinage ; `tete` : haut du
   * casque dans la case, par image.
   */
  tir: { tileW: number; tileH: number; images: number; pied: Point; tete: number[]; echelle: number; decalage: number };
  /** Mise en échec (coup d'épaule) : une seule image, rangée 0 vers la droite, 1 vers la gauche. */
  echec: { tileW: number; tileH: number; images: number; pied: Point; tete: number; echelle: number; decalage: number };
  /** Supporters du bonus envahissement, aux couleurs de l'équipe : une case par dessin (rangée 0 vers la droite, 1 en miroir). */
  supporters: { tileW: number; tileH: number; images: number; pied: Point; echelle: number };
  /** Joueur de face de l'écran des maillots (crosse à droite, puis en miroir). */
  portrait: { tileW: number; tileH: number };
  /**
   * Défenseur esquivé, au sol : plongeon puis allongé (tête vers la droite,
   * puis en miroir). `pied` : centre du corps ; `tete` : centre du casque, par image.
   */
  chute: { tileW: number; tileH: number; images: number; pied: Point; tete: Point[]; echelle: number };
  /**
   * Célébrations de l'écran de but (de face), une case par dessin, posées sur
   * le bas de la case. `reference` : hauteur du premier dessin (échelle commune :
   * un joueur à genou reste plus petit qu'un joueur debout).
   */
  celebration: { tileW: number; tileH: number; images: number; reference: number };
  /** Nombre de variantes de visage dans visages.png. */
  visages: number;
  teamIds: string[];
}

const META_DEFAUT: MetaSprites = {
  joueur: { tileW: 133, tileH: 105, images: 4, arret: 0, pied: { x: 52, y: 101 }, tete: 0, echelle: 0.28, decalage: 10 },
  gardien: { tileW: 137, tileH: 109, pied: { x: 75.8, y: 107 }, echelle: 0.2, decalage: -41 },
  tir: { tileW: 153, tileH: 120, images: 4, pied: { x: 72.9, y: 119 }, tete: [18, 18, 19, 19], echelle: 0.28, decalage: 10 },
  echec: { tileW: 138, tileH: 109, images: 1, pied: { x: 63.1, y: 108 }, tete: 2, echelle: 0.28, decalage: 10 },
  supporters: { tileW: 115, tileH: 123, images: 6, pied: { x: 57.5, y: 122 }, echelle: 0.28 },
  portrait: { tileW: 92, tileH: 116 },
  chute: { tileW: 176, tileH: 102, images: 2, pied: { x: 88, y: 43 }, tete: [{ x: 114, y: 31 }, { x: 125, y: 39 }], echelle: 0.22 },
  celebration: { tileW: 134, tileH: 148, images: 4, reference: 122 },
  visages: 1,
  teamIds: [],
};

export interface Rect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Dégradé doré (du plus sombre au plus clair) : le joueur doré d'un bonus garde son modelé. */
const RAMPE_OR: [number, number, number][] = [
  [70, 40, 5],
  [150, 95, 10],
  [225, 170, 35],
  [255, 220, 90],
  [255, 248, 200],
];

/** Copie d'une feuille de sprites repeinte en or : chaque pixel suit le dégradé selon sa luminosité. */
function feuilleDoree(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return c;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const n = RAMPE_OR.length - 1;
  for (let i = 0; i < d.data.length; i += 4) {
    if (!d.data[i + 3]) continue;
    const l = (0.3 * d.data[i]! + 0.59 * d.data[i + 1]! + 0.11 * d.data[i + 2]!) / 255;
    const u = Math.min(0.999, l * 1.15) * n;
    const a = RAMPE_OR[Math.floor(u)]!;
    const b = RAMPE_OR[Math.floor(u) + 1]!;
    const f = u - Math.floor(u);
    for (let k = 0; k < 3; k++) d.data[i + k] = a[k]! + (b[k]! - a[k]!) * f;
  }
  g.putImageData(d, 0, 0);
  return c;
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
  private tirs = new Map<string, HTMLImageElement>();
  private visagesTir: HTMLImageElement | null = null;
  private echecs = new Map<string, HTMLImageElement>();
  private supporters = new Map<string, HTMLImageElement>();
  private visagesEchec: HTMLImageElement | null = null;
  private celebrations = new Map<string, HTMLImageElement>();
  private visages: HTMLImageElement | null = null;
  private dores = new Map<string, HTMLCanvasElement>();
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
    chargeImage(`${base}/visages-tir.png`).then(
      (img) => (this.visagesTir = img),
      () => undefined,
    );
    chargeImage(`${base}/visages-echec.png`).then(
      (img) => (this.visagesEchec = img),
      () => undefined,
    );
  }

  /** Précharge les feuilles d'une équipe (idempotent) — à appeler avant un match. */
  async precharge(teamId: string): Promise<void> {
    if (this.skaters.has(teamId)) return;
    const enCours = this.enCours.get(teamId);
    if (enCours) return enCours;
    const p = (async () => {
      // le geste de tir arrive à part : sans lui, le joueur garde sa pose de patinage
      chargeImage(`${this.base}/tir-${teamId}.png`).then(
        (img) => this.tirs.set(teamId, img),
        () => undefined,
      );
      chargeImage(`${this.base}/supporters-${teamId}.png`).then(
        (img) => this.supporters.set(teamId, img),
        () => undefined,
      );
      chargeImage(`${this.base}/echec-${teamId}.png`).then(
        (img) => this.echecs.set(teamId, img),
        () => undefined,
      );
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

  /** Même image que `spriteJoueur`, en or (bonus) ; la feuille dorée est calculée une fois par équipe. */
  spriteJoueurDore(teamId: string, frame: number, gauche: boolean): { img: HTMLCanvasElement; rect: Rect } | null {
    return this.dore(`joueur:${teamId}`, this.spriteJoueur(teamId, frame, gauche));
  }

  /** Image `frame` du geste de tir (0 armé, 1 descente, 2 impact, 3 accompagnement). */
  spriteTir(teamId: string, frame: number, gauche: boolean): { img: HTMLImageElement; rect: Rect } | null {
    const img = this.tirs.get(teamId);
    if (!img) return null;
    const { tileW, tileH, images } = this.meta.tir;
    const col = Math.min(images - 1, Math.max(0, frame));
    return { img, rect: { sx: col * tileW, sy: (gauche ? 1 : 0) * tileH, sw: tileW, sh: tileH } };
  }

  spriteTirDore(teamId: string, frame: number, gauche: boolean): { img: HTMLCanvasElement; rect: Rect } | null {
    return this.dore(`tir:${teamId}`, this.spriteTir(teamId, frame, gauche));
  }

  /** Calque du visage `variante` sur l'image `frame` du geste de tir. */
  spriteVisageTir(variante: number, frame: number, gauche: boolean): { img: HTMLImageElement; rect: Rect } | null {
    const img = this.visagesTir;
    const n = this.meta.visages;
    if (!img || n < 2) return null;
    const { tileW, tileH, images } = this.meta.tir;
    const col = Math.min(images - 1, Math.max(0, frame));
    const rang = (((variante % n) + n) % n) + (gauche ? n : 0);
    return { img, rect: { sx: col * tileW, sy: rang * tileH, sw: tileW, sh: tileH } };
  }

  /** Supporter `n` (modulo leur nombre) aux couleurs de l'équipe. */
  spriteSupporter(teamId: string, n: number, gauche: boolean): { img: HTMLImageElement; rect: Rect } | null {
    const img = this.supporters.get(teamId);
    if (!img) return null;
    const { tileW, tileH, images } = this.meta.supporters;
    const col = ((n % images) + images) % images;
    return { img, rect: { sx: col * tileW, sy: (gauche ? 1 : 0) * tileH, sw: tileW, sh: tileH } };
  }

  /** La pose de la mise en échec (une seule image). */
  spriteEchec(teamId: string, gauche: boolean): { img: HTMLImageElement; rect: Rect } | null {
    const img = this.echecs.get(teamId);
    if (!img) return null;
    const { tileW, tileH } = this.meta.echec;
    return { img, rect: { sx: 0, sy: (gauche ? 1 : 0) * tileH, sw: tileW, sh: tileH } };
  }

  spriteEchecDore(teamId: string, gauche: boolean): { img: HTMLCanvasElement; rect: Rect } | null {
    return this.dore(`echec:${teamId}`, this.spriteEchec(teamId, gauche));
  }

  /** Calque du visage `variante` sur la pose de mise en échec. */
  spriteVisageEchec(variante: number, gauche: boolean): { img: HTMLImageElement; rect: Rect } | null {
    const img = this.visagesEchec;
    const n = this.meta.visages;
    if (!img || n < 2) return null;
    const { tileW, tileH } = this.meta.echec;
    const rang = (((variante % n) + n) % n) + (gauche ? n : 0);
    return { img, rect: { sx: 0, sy: rang * tileH, sw: tileW, sh: tileH } };
  }

  /** La version dorée d'une case : la feuille entière est repeinte une fois, puis gardée. */
  private dore(cle: string, base: { img: HTMLImageElement; rect: Rect } | null): { img: HTMLCanvasElement; rect: Rect } | null {
    if (!base) return null;
    let img = this.dores.get(cle);
    if (!img) {
      img = feuilleDoree(base.img);
      this.dores.set(cle, img);
    }
    return { img, rect: base.rect };
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
