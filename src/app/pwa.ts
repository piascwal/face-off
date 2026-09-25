/**
 * Tente le plein écran + verrouillage paysage au lancement d'un match.
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
 */
export function demandePleinEcranPaysage(): void {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  const dejaPlein = document.fullscreenElement ?? (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement;
  const verrouille = () => {
    try {
      const orientation = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
      orientation?.lock?.('landscape')?.catch(() => {
        /* refusé (desktop, ou pas encore plein écran) : tant pis */
      });
    } catch {
      /* API indisponible */
    }
  };
  if (!req || dejaPlein) {
    verrouille();
    return;
  }
  try {
    const r = req({ navigationUI: 'hide' } as FullscreenOptions);
    if (r && typeof (r as Promise<void>).then === 'function') {
      (r as Promise<void>).then(verrouille).catch(() => {
        /* plein écran refusé (ex. iPhone) : tant pis, on retente le verrou quand même */
      });
    } else {
      verrouille();
    }
  } catch {
    /* pas de plein écran possible : tant pis */
  }
}

export function estAutonome(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
