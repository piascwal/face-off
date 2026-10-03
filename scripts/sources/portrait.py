"""Portrait (écran des maillots) : le joueur de face."""
from sources.commun import *  # noqa: F401,F403


# --- Portrait (écran des maillots) ----------------------------------------------

# Joueur de face, crosse à droite (x > 70), gant droit sur la crosse.
PORTRAIT_GANTS = [(8, 52, 34, 72), (69, 38, 87, 60)]


def portrait():
    im = np.asarray(Image.open(SRC / 'portrait.jpg').convert('RGB')).astype(float)
    fond = np.median(im[:30, :30].reshape(-1, 3), 0)
    fg = ndimage.binary_opening(np.linalg.norm(im - fond, axis=2) > 70, iterations=1)
    lab, n = ndimage.label(fg)
    fg = lab == (np.argmax(ndimage.sum(fg, lab, range(1, n + 1))) + 1)
    a = quantifie([pixelise(im, fg, PERIODE_GARDIEN)])[0]
    H, W = a.shape[:2]
    top, cx = haut(a)
    roles = np.zeros((H, W), np.uint8)
    for y in range(H):
        for x in range(W):
            if not a[y, x, 3]:
                continue
            h, s_, v = hsv(a[y, x, :3])
            r = role_couleur(h, s_, v, y <= top + 13)
            dans_gant = any(b[0] <= x <= b[2] and b[1] <= y <= b[3] for b in PORTRAIT_GANTS)
            if r == R['contour']:
                pass
            elif top + 12 < y <= top + 30 and cx - 12 <= x <= cx + 12 and r not in (R['casque'], R['casque-bande']):
                r = R['garde']  # visage
            elif x >= 70 and not dans_gant:
                r = R['garde']  # crosse
            elif dans_gant and 8 <= h <= 35 and v < 0.72 and r != R['bande']:
                r = R['gants']
            elif y >= H - 12 and r in (R['blanc'], R['maillot'], R['bande']):
                r = R['garde']  # patins
            elif 70 <= y <= 96 and r == R['maillot'] and 12 < h < 26:
                r = R['garde']  # ombres brun-orangé de la culotte (le vrai rouge des bandes reste)
            roles[y, x] = r
    zone_ecusson(a, roles, top, cx, 40, 70)
    nettoie(roles)
    return a, roles
