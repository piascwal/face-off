import { repeintImageFin, type EquipeVisuelle } from '@render/index';

/** Durée d'affichage de l'image de victoire / défaite avant les statistiques (s). */
export const IMAGE_FIN_S = 2;

/**
 * Image de fin de match (victoire ou défaite), repeinte aux couleurs de
 * l'équipe du joueur : seule à l'écran pendant `IMAGE_FIN_S` secondes (ou
 * jusqu'à un appui), puis en fond derrière les statistiques.
 */
export class ImageFinMatch {
  private readonly images = { victoire: new Image(), defaite: new Image() };
  /** Cartes de rôles (maillot, bandes, empiècements), pour repeindre les images. */
  private readonly roles = { victoire: new Image(), defaite: new Image() };
  /** Dernière image repeinte (mise en cache par image et équipe). */
  private repeinte: { cle: string; c: HTMLCanvasElement } | null = null;
  private courante: { gagne: boolean; t0: number; stats: boolean } | null = null;

  charge(): void {
    const base = import.meta.env.BASE_URL;
    this.images.victoire.src = `${base}fins/victoire.jpg`;
    this.images.defaite.src = `${base}fins/defaite.jpg`;
    this.roles.victoire.src = `${base}fins/victoire-roles.png`;
    this.roles.defaite.src = `${base}fins/defaite-roles.png`;
  }

  /** Nouveau match terminé : victoire ou défaite de ce joueur-ci. */
  montre(gagne: boolean): void {
    this.courante = { gagne, t0: performance.now() / 1000, stats: false };
  }

  /** Pas d'image (match nul, spectateur, retour au menu). */
  efface(): void {
    this.courante = null;
  }

  /** Passe à l'affichage des statistiques (un appui sur l'image). */
  passe(): void {
    if (this.courante) this.courante.stats = true;
  }

  /** L'image est seule à l'écran (avant que les statistiques s'y superposent). */
  seule(): boolean {
    const f = this.courante;
    if (!f || f.stats) return false;
    if (performance.now() / 1000 - f.t0 > IMAGE_FIN_S) f.stats = true;
    return !f.stats;
  }

  /**
   * Dessine l'image plein écran (recadrée pour couvrir l'écran, calée en bas).
   * Renvoie false s'il n'y a pas d'image à montrer.
   */
  dessine(g: CanvasRenderingContext2D, W: number, H: number, equipe: EquipeVisuelle): boolean {
    const f = this.courante;
    if (!f) return false;
    const t = performance.now() / 1000 - f.t0;
    const brute = f.gagne ? this.images.victoire : this.images.defaite;
    if (!brute.complete || brute.naturalWidth === 0) return false;
    // aux couleurs de l'équipe du joueur (l'image d'origine tant que ce n'est pas prêt)
    const img: CanvasImageSource = this.repeint(f.gagne, equipe) ?? brute;
    g.fillStyle = '#05060d';
    g.fillRect(0, 0, W, H);
    const k = Math.max(W / brute.naturalWidth, H / brute.naturalHeight);
    const w = brute.naturalWidth * k;
    const h = brute.naturalHeight * k;
    g.save();
    g.globalAlpha = Math.min(1, t / 0.15);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    // calé en bas : on garde les joueurs, quitte à couper les banderoles du haut
    g.drawImage(img, (W - w) / 2, H - h, w, h);
    g.restore();
    return true;
  }

  private repeint(gagne: boolean, eq: EquipeVisuelle): HTMLCanvasElement | null {
    const nom = gagne ? 'victoire' : 'defaite';
    const cle = `${nom}:${eq.id}`;
    if (this.repeinte?.cle === cle) return this.repeinte.c;
    const c = repeintImageFin(nom, this.images[nom], this.roles[nom], eq);
    if (c) this.repeinte = { cle, c };
    return c;
  }
}
