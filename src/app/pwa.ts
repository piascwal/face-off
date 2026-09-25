/**
 * Tente le plein écran + verrouillage paysage. Appelé dès le premier geste
 * de l'utilisateur (voir `PleinEcranAuPremierGeste`) : les navigateurs
 * refusent le plein écran sans geste (clic, touche, fin de toucher), on ne
 * peut donc pas le déclencher au simple chargement de la page.
 *
 * Sur le web ouvert (pas installé), l'API Fullscreen masque la barre
 * d'adresse sur les navigateurs qui la supportent (Chrome/Edge Android) —
 * mais Safari iOS ne l'implémente pas du tout pour un <canvas>, ce qui est la
 * cause du "le jeu ne passe pas en plein écran en paysage" observé sur
 * iPhone. La solution robuste sur toutes les plateformes est le manifeste PWA
 * (`vite.config.ts`) avec `display: "fullscreen"` : une fois l'app ajoutée à
 * l'écran d'accueil, elle s'ouvre sans barre de navigateur du tout, y compris
 * sur iOS. On tente donc les deux : le meilleur des deux mondes selon
 * comment le jeu est ouvert.
 *
 * Résout `true` si l'écran est (ou était déjà) en plein écran.
 */
export async function demandePleinEcranPaysage(): Promise<boolean> {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  if (estPleinEcran()) return true;
  if (!req) return false;
  try {
    await req({ navigationUI: 'hide' } as FullscreenOptions);
  } catch {
    // refusé : pas de geste utilisateur valable (ex. pointerdown d'un doigt,
    // l'activation n'arrive qu'au pointerup) ou navigateur sans support (iPhone)
    return false;
  }
  try {
    const orientation = screen.orientation as
      (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
    await orientation?.lock?.('landscape');
  } catch {
    /* verrou refusé (desktop) ou API indisponible : tant pis */
  }
  return estPleinEcran();
}

function estPleinEcran(): boolean {
  return Boolean(
    document.fullscreenElement ??
    (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement,
  );
}

/**
 * Passe en plein écran au tout premier geste possible, puis se tait : si le
 * joueur quitte volontairement le plein écran, on ne le lui réimpose pas à
 * chaque clic (seulement au lancement d'un match).
 */
export class PleinEcranAuPremierGeste {
  private obtenu = estAutonome();
  private enCours = false;

  tente(): void {
    if (this.obtenu || this.enCours) return;
    this.enCours = true;
    void demandePleinEcranPaysage().then((ok) => {
      this.enCours = false;
      if (ok) this.obtenu = true;
    });
  }
}

export function estAutonome(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
