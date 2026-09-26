#!/usr/bin/env python3
"""
Convertit les illustrations sources (assets/sprites-src/*.jpg) en vrai pixel
art, prêt à être recoloré pour chaque équipe par `generate-sprites.mjs`.

Les sources sont des images « façon pixel art » agrandies et compressées en
JPEG (fond magenta) : chaque « pixel » du dessin y fait quelques pixels
d'image, avec du flou. Le script :

1. détoure le fond (et, pour le gardien, la glace, l'ombre et le reflet) ;
2. découpe la planche de patinage en images, en séparant les crosses qui
   touchent le joueur voisin ;
3. retrouve la grille du dessin (période et calage, par FFT du gradient) et
   garde une seule couleur par case (la médiane, plus robuste que le plus
   proche voisin sur une source JPEG) ;
4. réduit chaque dessin à 64 couleurs (k-moyennes) ;
5. classe chaque pixel dans un rôle (maillot, bandes, blanc, casque, gants,
   peau, barbe, écusson, contour, à garder tel quel) : c'est ce qui permet de
   repeindre le joueur aux couleurs de chaque équipe.

Sorties, dans assets/sprites-src/ : joueur.png et gardien.png (les dessins),
joueur-roles.png et gardien-roles.png (un rôle par pixel, voir ROLES) et
sprites.json (tailles de case et ancrages). Elles sont committées : `npm run
sprites` n'a besoin ni de Python ni de ce script. À relancer seulement si
les images sources changent :

    pip install numpy scipy scikit-learn pillow
    python3 scripts/convertit-sources.py
"""
import colorsys
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from sklearn.cluster import KMeans

SRC = Path(__file__).resolve().parent.parent / 'assets' / 'sprites-src'

# Rôles d'un pixel ; l'indice est la valeur écrite dans les cartes *-roles.png.
ROLES = [
    'vide',
    'contour',  # trait sombre : neutralisé (le fond magenta y déteint)
    'maillot',  # couleur principale du chandail
    'bande',  # bandes et liserés dorés
    'blanc',  # empiècements clairs
    'casque',  # coque du casque / du masque
    'casque-bande',
    'gants',
    'garde',  # à garder tel quel (crosse, culotte, patins, grille du masque...)
    'peau',
    'barbe',
    'ecusson',  # emplacement de l'écusson sur la poitrine
]
R = {nom: i for i, nom in enumerate(ROLES)}

# Période de la grille du dessin (px d'image par pixel de dessin), mesurée
# avec `periode()` : la FFT hésite entre plusieurs pics voisins sur la
# planche (2,73 / 2,93) et donne un demi-pixel (2,93) pour le gardien, on fixe
# donc les valeurs retenues après vérification à l'œil.
PERIODE_PLANCHE = 2.93
PERIODE_GARDIEN = 5.86

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


def hsv(c):
    h, s, v = colorsys.rgb_to_hsv(*(np.asarray(c, float) / 255))
    return h * 360, s, v


def periode(img, masque):
    """Période de la grille du dessin (px), par FFT du gradient horizontal."""
    L = img.mean(2)
    s = (np.abs(np.diff(L, axis=1)) * masque[:, 1:]).sum(0)
    s = s - s.mean()
    F = np.abs(np.fft.rfft(s))
    f = np.fft.rfftfreq(len(s))
    ok = (f > 1 / 40) & (f < 1 / 2.2)
    return 1 / f[np.argmax(F * ok)]


def pixelise(img, masque, P):
    """Une couleur par case de la grille (médiane des pixels du dessin)."""
    L = img.mean(2)
    gx = (np.abs(np.diff(L, axis=1)) * masque[:, 1:]).sum(0)
    gy = (np.abs(np.diff(L, axis=0)) * masque[1:, :]).sum(1)

    def calage(s):
        ph = np.linspace(0, P, 40, endpoint=False)
        sc = [np.interp(np.arange(p, len(s) - 1, P), np.arange(len(s)), s).mean() for p in ph]
        return ph[int(np.argmax(sc))] + 0.5

    x0, y0 = calage(gx), calage(gy)
    nx, ny = int((img.shape[1] - x0) / P), int((img.shape[0] - y0) / P)
    out = np.zeros((ny, nx, 4))
    for j in range(ny):
        for i in range(nx):
            ya, xa = y0 + j * P, x0 + i * P
            sy = slice(int(round(ya)), max(int(round(ya)) + 1, int(round(ya + P))))
            sx = slice(int(round(xa)), max(int(round(xa)) + 1, int(round(xa + P))))
            bm = masque[sy, sx].reshape(-1)
            if bm.mean() < 0.5:
                continue
            out[j, i, :3] = np.median(img[sy, sx].reshape(-1, 3)[bm], 0)
            out[j, i, 3] = 255
    ys, xs = np.where(out[..., 3] > 0)
    return out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def quantifie(dessins, n=64):
    pts = np.concatenate([d[d[..., 3] > 0][:, :3] for d in dessins])
    km = KMeans(n, n_init=4, random_state=0).fit(pts)
    for d in dessins:
        m = d[..., 3] > 0
        d[m, :3] = km.cluster_centers_[km.predict(d[m, :3])]
    return [d.astype(np.uint8) for d in dessins]


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


# --- Rôles --------------------------------------------------------------------


def dist_seg(x, y, x0, y0, x1, y1):
    vx, vy = x1 - x0, y1 - y0
    t = min(1, max(0, ((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy)))
    return np.hypot(x0 + t * vx - x, y0 + t * vy - y)


def haut(a):
    """Première ligne opaque et centre du casque (sur ses 5 premières lignes)."""
    top = int(np.where(a[..., 3].any(1))[0][0])
    xs = np.where(a[top:top + 5, :, 3].any(0))[0]
    return top, (xs.min() + xs.max()) / 2


def role_couleur(h, s, v, dans_casque):
    rouge = ((h >= 330 or h <= 12) and s > 0.45) or (12 < h < 26 and s > 0.5 and v > 0.45)
    dore = 26 <= h <= 50 and s > 0.55 and v > 0.5
    if v < 0.24 or (250 < h < 330 and s > 0.5 and v < 0.3):
        return R['contour']
    if dans_casque and (rouge or dore):
        return R['casque'] if rouge else R['casque-bande']
    if rouge:
        return R['maillot']
    if dore:
        return R['bande']
    if s < 0.3 and v > 0.42:
        return R['blanc']  # empiècements clairs et leurs ombres (grises ou violacées)
    return R['garde']


def zone_ecusson(a, lab, top, cx, y_min, y_max):
    """L'emblème bleu de la poitrine : sa boîte devient la zone de l'écusson."""
    H, W = lab.shape
    pts = []
    for y in range(max(0, top + y_min), min(H, top + y_max)):
        for x in range(W):
            if a[y, x, 3]:
                h, s, v = hsv(a[y, x, :3])
                if 190 <= h <= 235 and s > 0.35 and v > 0.25:
                    pts.append((x, y))
    if len(pts) < 6:
        return
    xs, ys = zip(*pts)
    x0, x1, y0, y1 = min(xs) - 1, max(xs) + 1, min(ys) - 1, max(ys) + 1
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if a[y, x, 3] and lab[y, x] != R['contour']:
                lab[y, x] = R['ecusson']
    # les ornements gris de l'emblème d'origine (haches) autour de la boîte
    for y in range(max(0, y0 - 4), min(H, y1 + 5)):
        for x in range(max(0, x0 - 5), min(W, x1 + 6)):
            if a[y, x, 3] and lab[y, x] not in (R['contour'], R['ecusson']):
                h, s, v = hsv(a[y, x, :3])
                if s < 0.25 and 0.35 < v < 0.9:
                    lab[y, x] = R['ecusson']


# Rôles qu'un pixel isolé peut échanger avec ses voisins (pas la peau, la barbe,
# l'écusson ni le contour, dessinés à part ou déjà précis).
ECHANGEABLES = ('maillot', 'bande', 'blanc', 'casque', 'casque-bande', 'gants', 'garde')


def nettoie(lab, passes=2):
    """
    Pixels isolés : un pixel dont presque aucun voisin ne partage le rôle prend
    celui qui domine autour de lui. Sans ça, quelques pixels d'ombre mal classés
    gardent la couleur d'origine (rouge, or) au milieu d'un maillot repeint.
    """
    ok = {R[n] for n in ECHANGEABLES}
    H, W = lab.shape
    for _ in range(passes):
        nouv = lab.copy()
        for y in range(H):
            for x in range(W):
                r = int(lab[y, x])
                if r not in ok:
                    continue
                vois = [int(lab[yy, xx]) for yy in range(max(0, y - 1), min(H, y + 2))
                        for xx in range(max(0, x - 1), min(W, x + 2)) if (yy, xx) != (y, x)]
                if sum(v == r for v in vois) > 1:
                    continue
                autres = [v for v in vois if v in ok and v != r]
                if autres:
                    q = max(set(autres), key=autres.count)
                    if autres.count(q) >= 4:
                        nouv[y, x] = q
        lab[:] = nouv


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


# --- Gardien ------------------------------------------------------------------


def gardien():
    im = np.asarray(Image.open(SRC / 'gardien.jpg').convert('RGB')).astype(float)
    H = im.shape[0]
    Y = np.arange(H)[:, None]
    d = lambda c: np.linalg.norm(im - np.array(c, float), axis=2)  # noqa: E731
    fond = np.median(im[:30, :30].reshape(-1, 3), 0)
    glace = im[H - 5, 5]
    # la glace commence là où le fond magenta s'arrête, dans la colonne de gauche
    y_glace = int(np.argmax(d(fond)[:, 5] > 70))
    ombre = np.array([160, 193, 218.])
    fg = ((Y < y_glace) & (d(fond) > 70)) | ((Y >= y_glace) & (Y <= y_glace + 60) & (d(glace) > 45) & (d(ombre) > 30))
    fg = ndimage.binary_opening(fg, iterations=1)
    mx, mn = im.max(2), im.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    magenta = (b > 0.45 * r) & (g < 0.35 * r) & (sat > 0.75) & (mx > 110) & (b > 60)
    fg = ndimage.binary_fill_holes(fg) & ~(magenta & (Y < y_glace))
    lab, n = ndimage.label(fg)
    fg = lab == (np.argmax(ndimage.sum(fg, lab, range(1, n + 1))) + 1)
    P = PERIODE_GARDIEN
    a = quantifie([pixelise(im, fg, P)])[0]
    Hh, W = a.shape[:2]
    roles = np.zeros((Hh, W), np.uint8)
    for y in range(Hh):
        for x in range(W):
            if not a[y, x, 3]:
                continue
            h, s, v = hsv(a[y, x, :3])
            rouge = ((h >= 330 or h <= 12) and s > 0.45) or (12 < h < 26 and s > 0.68 and v > 0.45)
            rr = role_couleur(h, s, v, y <= 34 and 64 <= x <= 96)
            if rr == R['contour']:
                pass
            elif dist_seg(x, y, 7, 25, 74, 108) < 2.2 and not (s > 0.8 and v > 0.7):
                rr = R['garde']  # manche de la crosse
            elif 74 <= x <= 112 and y >= 104 and not rouge:
                rr = R['garde']  # palette
            elif 74 <= x <= 92 and 13 <= y <= 31:
                rr = R['casque'] if rouge and s > 0.8 else R['garde']  # visage derrière la grille
            roles[y, x] = rr
    top, cx = haut(a)
    zone_ecusson(a, roles, top, cx, 35, 70)
    nettoie(roles)
    return a, roles


# --- Assemblage ---------------------------------------------------------------


def main():
    dessins, P = decoupe_planche()
    roles = [roles_joueur(a, k) for a, k in zip(dessins, CYCLE)]
    infos = [(a.shape[0], a.shape[1], *haut(a)) for a in dessins]
    hmoy = np.mean([h for h, *_ in infos])
    # calage : casques alignés, pieds sur la même ligne, et la moitié de l'écart
    # de hauteur (posture plus ou moins accroupie) rattrapée pour adoucir le rebond
    dy = [int(round((h - hmoy) * 0.5)) for h, *_ in infos]
    ax = int(np.ceil(max(cx for *_, cx in infos))) + 2
    tw = int(max(ax - cx + w for (h, w, _, cx) in infos)) + 2
    ay = int(max(h - d for (h, *_), d in zip(infos, dy)))
    th = int(ay + max(dy)) + 1
    feuille = np.zeros((th, tw * len(dessins), 4), np.uint8)
    carte = np.zeros((th, tw * len(dessins)), np.uint8)
    corps = []
    for i, ((h, w, top, cx), a, lab, d) in enumerate(zip(infos, dessins, roles, dy)):
        ox = i * tw + int(round(ax - cx))
        oy = ay + d - h
        feuille[oy:oy + h, ox:ox + w][a[..., 3] > 0] = a[a[..., 3] > 0]
        carte[oy:oy + h, ox:ox + w][a[..., 3] > 0] = lab[a[..., 3] > 0]
        # centre du tronc (sans la crosse) : là où le joueur « est » sur la glace
        tronc = (lab[top + 25:top + 55] != R['garde']) & (a[top + 25:top + 55, :, 3] > 0)
        corps.append(np.where(tronc)[1].mean() + ox - i * tw)
    Image.fromarray(feuille, 'RGBA').save(SRC / 'joueur.png')
    Image.fromarray(carte, 'L').save(SRC / 'joueur-roles.png')

    g, groles = gardien()
    Image.fromarray(g, 'RGBA').save(SRC / 'gardien.png')
    Image.fromarray(groles, 'L').save(SRC / 'gardien-roles.png')
    gtop, _ = haut(g)
    gcorps = np.where((groles[gtop + 30:gtop + 70] != R['garde']) & (g[gtop + 30:gtop + 70, :, 3] > 0))[1].mean()

    meta = {
        'roles': ROLES,
        'joueur': {'tileW': tw, 'tileH': th, 'images': len(dessins), 'arret': 0,
                   'pied': {'x': round(float(np.mean(corps)), 1), 'y': ay}, 'tete': int(ay - max(h - d for (h, *_), d in zip(infos, dy)))},
        'gardien': {'tileW': g.shape[1], 'tileH': g.shape[0], 'pied': {'x': round(float(gcorps), 1), 'y': g.shape[0] - 2}},
    }
    (SRC / 'sprites.json').write_text(json.dumps(meta, indent=2) + '\n')
    print(f'planche : grille {P:.2f} px, {len(dessins)} images en cases de {tw}×{th}')
    print(f'gardien : {g.shape[1]}×{g.shape[0]}')


if __name__ == '__main__':
    main()
