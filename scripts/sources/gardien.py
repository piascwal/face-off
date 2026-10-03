"""Gardien : détourage (glace, ombre, reflet) et rôles."""
from sources.commun import *  # noqa: F401,F403


# --- Gardien ------------------------------------------------------------------


# Zones du dessin pixelisé du gardien (coordonnées de gardien.png) :
# le manche de la crosse en deux tronçons (derrière puis devant les jambières),
# la palette, le visage derrière la grille du masque, le cuir des jambières, du
# blocage et du gant d'attrape (gardé tel quel : il ne prend pas la couleur de
# l'équipe), et la poitrine où se peint l'écusson de l'équipe.
GARDIEN_MANCHES = [(3, 17, 29, 47, 2.6), (48, 62, 70, 98, 3.4)]
GARDIEN_PALETTE = (68, 94)  # x >= 68 et y >= 94 : la lame de la crosse
GARDIEN_VISAGE = (79, 12, 97, 31)
GARDIEN_ECUSSON = (67, 39, 82, 53)


def en_cuir_gardien(x, y):
    """Jambières, blocage et gant d'attrape : le cuir brun-or qui garde sa couleur."""
    if 28 <= x <= 52 and 34 <= y <= 64:
        return True  # blocage
    if y >= 62:
        return True  # jambières
    if x >= 106 and 36 <= y <= 70:
        return True  # gant d'attrape
    return False


def role_gardien(h, s, v, x, y):
    """Maillot, casque et cuir : seul le vrai rouge des jambières (bandes, écussons) prend la couleur de l'équipe."""
    rouge_pur = (h >= 335 or h <= 10) and s > 0.5
    chaud = rouge_pur or (10 < h < 26 and s > 0.5 and v > 0.45)  # avec les ombres orangées du maillot
    dore = 26 <= h <= 50 and s > 0.55 and v > 0.5
    if v < 0.24 or (250 < h < 330 and s > 0.5 and v < 0.3):
        return R['contour']
    if y <= 34 and 70 <= x <= 99:  # casque : base dorée, bande rouge
        return R['casque'] if rouge_pur else (R['casque-bande'] if chaud or dore else R['garde'])
    if en_cuir_gardien(x, y):
        return R['maillot'] if rouge_pur else R['garde']
    if chaud:
        return R['maillot']
    if dore:
        return R['bande']
    if s < 0.3 and v > 0.42:
        return R['blanc']
    return R['garde']


def gardien():
    im = np.asarray(Image.open(SRC / 'gardien.jpg').convert('RGB')).astype(float)
    fond = np.median(im[:30, :30].reshape(-1, 3), 0)
    # le fond est un aplat magenta, y compris entre les jambières et sous le bras : pas de remplissage des trous
    fg = ndimage.binary_opening(np.linalg.norm(im - fond, axis=2) > 70, iterations=1)
    lab, n = ndimage.label(fg)
    fg = lab == (np.argmax(ndimage.sum(fg, lab, range(1, n + 1))) + 1)
    a = quantifie([pixelise(im, fg, PERIODE_GARDIEN)])[0]
    detoure_violet(a)
    Hh, W = a.shape[:2]
    roles = np.zeros((Hh, W), np.uint8)
    for y in range(Hh):
        for x in range(W):
            if not a[y, x, 3]:
                continue
            h, s, v = hsv(a[y, x, :3])
            rr = role_gardien(h, s, v, x, y)
            vx0, vy0, vx1, vy1 = GARDIEN_VISAGE
            if rr == R['contour']:
                pass
            elif any(dist_seg(x, y, x0, y0, x1, y1) < r for x0, y0, x1, y1, r in GARDIEN_MANCHES) and not (s > 0.8 and v > 0.7 and not 8 <= h <= 50):
                rr = R['garde']  # manche de la crosse
            elif x >= GARDIEN_PALETTE[0] and y >= GARDIEN_PALETTE[1]:
                rr = R['garde']  # palette
            elif vx0 <= x <= vx1 and vy0 <= y <= vy1:
                rr = R['garde']  # visage et grille du masque
            roles[y, x] = rr
    # dans le cuir, les reflets rouges isolés (dégradés du dessin) gardent leur couleur : seules les vraies bandes suivent l'équipe
    lab, n = ndimage.label(roles == R['maillot'])
    for i in range(1, n + 1):
        ys, xs = np.where(lab == i)
        if len(ys) < 14 and all(en_cuir_gardien(x, y) for x, y in zip(xs, ys)):
            roles[lab == i] = R['garde']
    # l'écusson de l'équipe, sur la poitrine rouge
    ex0, ey0, ex1, ey1 = GARDIEN_ECUSSON
    for y in range(ey0, ey1 + 1):
        for x in range(ex0, ex1 + 1):
            if a[y, x, 3] and roles[y, x] == R['maillot']:
                roles[y, x] = R['ecusson']
    nettoie(roles)
    return a, roles
