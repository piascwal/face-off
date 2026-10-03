"""Planche de patinage : découpe en images, crosses séparées du joueur voisin."""
from sources.commun import *  # noqa: F401,F403


# --- Planche de patinage -----------------------------------------------------

# Un point dans le haut du corps de chaque image de la planche (4 par ligne).
GRAINES = [(200, 150), (540, 150), (880, 170), (1220, 160), (200, 500), (530, 500), (860, 500), (1200, 500)]
# Images retenues pour le cycle de patinage, dans l'ordre ; la première sert
# aussi de pose à l'arrêt. (Les images 1, 6 et 7 de la planche sont écartées :
# posture à part, ou patin caché par la crosse de l'image voisine.)
CYCLE = [4, 1, 2, 3]
# Par image (coordonnées du dessin recadré) : boîtes des deux gants, manche
# (main haute → main basse) et crosse hors du corps (segments épais).
CROSSES = {
    1: {'gants': [(26, 31, 43, 53), (64, 52, 82, 72)], 'manche': (26, 38, 82, 69),
        'dehors': [(80, 72, 100, 80), (98, 80, 112, 82), (112, 82, 119, 63)]},
    2: {'gants': [(14, 26, 30, 46), (52, 50, 71, 70)], 'manche': (14, 30, 52, 59),
        'dehors': [(71, 72, 84, 86), (82, 86, 98, 88), (98, 88, 107, 80)]},
    3: {'gants': [(10, 28, 28, 46), (52, 50, 70, 70)], 'manche': (10, 37, 54, 64),
        'dehors': [(71, 72, 88, 85), (86, 85, 104, 88), (104, 88, 115, 70)]},
    4: {'gants': [(6, 32, 22, 50), (58, 54, 74, 76)], 'manche': (7, 37, 69, 74),
        'dehors': [(74, 78, 96, 92), (94, 92, 106, 88), (105, 88, 116, 74)]},
}


def decoupe_planche():
    im = np.asarray(Image.open(SRC / 'planche-patinage.jpg').convert('RGB')).astype(float)
    H, W = im.shape[:2]
    fond = np.median(im[:30, :30].reshape(-1, 3), 0)
    m = ndimage.binary_opening(np.linalg.norm(im - fond, axis=2) > 70, iterations=1)
    # chaque pixel du dessin revient à l'image dont la graine est la plus proche
    # en restant dans le dessin (les crosses touchent le joueur voisin)
    own = np.full((H, W), -1)
    q = deque()
    for k, (x, y) in enumerate(GRAINES):
        for dy in range(-40, 41):
            for dx in range(-40, 41):
                if m[y + dy, x + dx] and own[y + dy, x + dx] < 0:
                    own[y + dy, x + dx] = k
                    q.append((y + dy, x + dx))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and own[yy, xx] < 0:
                own[yy, xx] = own[y, x]
                q.append((yy, xx))
    # le bout de palette de l'image 5 recouvre le patin arrière de l'image 6
    X, Y = np.arange(W)[None, :], np.arange(H)[:, None]
    zone = ((own == 4) | (own == 5)) & (X >= 360) & (X <= 440) & (Y >= 600) & (Y <= 705)
    cote5 = (X <= 421) | ((X <= 427) & (Y < 658))
    own[zone & cote5] = 4
    own[zone & ~cote5] = 5
    P = PERIODE_PLANCHE
    dessins = []
    for k in CYCLE:
        ys, xs = np.where(own == k)
        y0, y1, x0, x1 = ys.min() - 3, ys.max() + 4, xs.min() - 3, xs.max() + 4
        dessins.append(pixelise(im[y0:y1, x0:x1], own[y0:y1, x0:x1] == k, P))
    return quantifie(dessins), P


def roles_joueur(a, k):
    H, W = a.shape[:2]
    top, cx = haut(a)
    c = CROSSES[k]
    g1, g2 = c['gants']
    px, py, qx, qy = c['manche']
    manche = (px - (qx - px) * 0.3, py - (qy - py) * 0.3, qx, qy)
    lab = np.zeros((H, W), np.uint8)
    for y in range(H):
        for x in range(W):
            if not a[y, x, 3]:
                continue
            h, s, v = hsv(a[y, x, :3])
            r = role_couleur(h, s, v, y <= top + 13)
            if r == R['contour']:
                pass
            elif top + 9 < y <= top + 31 and cx - 10 <= x <= cx + 13 and r not in (R['casque'], R['casque-bande']):
                # visage : peau et barbe (variantes par joueur), le reste tel quel
                chaud = h <= 40 or h >= 330
                if (h >= 345 or h <= 8) and s > 0.8 and v > 0.35:
                    r = R['maillot']  # col du maillot, sous la barbe
                elif chaud and 0.2 <= v < 0.5 and s >= 0.3:
                    r = R['barbe']
                elif chaud and v >= 0.4 and s >= 0.12:
                    r = R['peau']
                else:
                    r = R['garde']
            elif (x > g2[2] and y >= g2[3] - 6) or any(dist_seg(x, y, *seg) <= 5.5 for seg in c['dehors']):
                r = R['garde']  # la crosse hors du corps garde ses couleurs
            elif dist_seg(x, y, *manche) <= 2.4 and 8 <= h <= 35:
                r = R['garde']  # le manche, là où il passe devant le corps
            elif any(b[0] <= x <= b[2] and b[1] <= y <= b[3] for b in c['gants']) and 8 <= h <= 35 and v < 0.72 \
                    and r != R['bande']:
                r = R['gants']
            elif y >= H - 12 and r in (R['blanc'], R['maillot'], R['bande']):
                r = R['garde']  # patins : lames, lacets et surpiqûres gardent leurs couleurs
            lab[y, x] = r
    zone_ecusson(a, lab, top, cx, 30, 62)
    nettoie(lab)
    return lab
