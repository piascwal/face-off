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

Sorties, dans assets/sprites-src/ : joueur.png, gardien.png, portrait.png
(le joueur de face de l'écran des maillots), tir.png (les 4 images du geste
de tir) et chute.png (plongeon puis
joueur allongé, pour le défenseur esquivé), leurs cartes *-roles.png (un
rôle par pixel, voir ROLES) et
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


# --- Chutes (défenseur esquivé) -------------------------------------------------

# Plongeon puis joueur allongé, tête à droite, crosse lâchée au sol (une
# composante à part dans la source).
CHUTES = ['chute-plongeon', 'chute-allonge']
# Par image (coordonnées du dessin pixelisé) : casque, visage, gants et culotte.
ZONES_CHUTE = [
    {'casque': (85, 16, 114, 39), 'visage': (86, 32, 116, 62),
     'gants': [(131, 41, 158, 63), (61, 58, 97, 82)], 'culotte': (27, 23, 57, 45)},
    {'casque': (111, 12, 137, 40), 'visage': (107, 30, 130, 54),
     'gants': [(147, 27, 173, 50), (76, 45, 111, 73)], 'culotte': (37, 12, 67, 40)},
]


def detoure_violet(a, s_min=0.3):
    """Le halo violet du fond, accroché au bord du dessin (les contours sombres restent)."""
    H, W = a.shape[:2]
    hv = np.array([[hsv(a[y, x, :3]) for x in range(W)] for y in range(H)])
    violet = (hv[..., 0] > 255) & (hv[..., 0] < 335) & (hv[..., 1] > s_min) & (hv[..., 2] > 0.28)
    while True:
        vide = np.pad(a[..., 3] == 0, 1, constant_values=True)
        bord = ndimage.binary_dilation(vide)[1:-1, 1:-1] & (a[..., 3] > 0) & violet
        if not bord.any():
            return
        a[bord, 3] = 0


def chutes():
    dessins = []
    for nom in CHUTES:
        im = np.asarray(Image.open(SRC / f'{nom}.jpg').convert('RGB')).astype(float)
        fond = np.median(im[:30, :30].reshape(-1, 3), 0)
        fg = ndimage.binary_opening(np.linalg.norm(im - fond, axis=2) > 70, iterations=1)
        lab, n = ndimage.label(fg)
        tailles = ndimage.sum(fg, lab, range(1, n + 1))
        fg = ndimage.binary_fill_holes(np.isin(lab, [i + 1 for i, t in enumerate(tailles) if t > 1000]))
        dessins.append(pixelise(im, fg, PERIODE_GARDIEN))
    dessins = quantifie(dessins)
    sorties = []
    dans = lambda x, y, b: b[0] <= x <= b[2] and b[1] <= y <= b[3]  # noqa: E731
    for a, z in zip(dessins, ZONES_CHUTE):
        detoure_violet(a)
        comp, n = ndimage.label(a[..., 3] > 0)
        tailles = ndimage.sum(np.ones_like(comp), comp, range(1, n + 1))
        corps = comp == (np.argmax(tailles) + 1)
        H, W = a.shape[:2]
        roles = np.zeros((H, W), np.uint8)
        for y in range(H):
            for x in range(W):
                if not a[y, x, 3]:
                    continue
                h, s, v = hsv(a[y, x, :3])
                r = role_couleur(h, s, v, False)
                rouge = r == R['maillot']
                if not corps[y, x]:
                    r = R['garde']  # la crosse lâchée
                elif r == R['contour']:
                    pass
                elif dans(x, y, z['casque']):
                    # casque rouge et doré ; visière et peau telles quelles
                    r = R['casque'] if rouge else R['casque-bande'] if r == R['bande'] else R['garde']
                elif dans(x, y, z['visage']):
                    r = R['garde']  # visage (peau, barbe, bouche) tel quel
                elif any(dans(x, y, g) for g in z['gants']) and r != R['bande'] and (
                        (8 <= h <= 35 and v < 0.72) or (rouge and v < 0.55)):
                    r = R['gants']
                elif dans(x, y, z['culotte']):
                    if rouge and (v < 0.5 or h > 12):
                        r = R['garde']  # ombres de la culotte brune
                elif r == R['blanc'] and 160 <= h <= 230:
                    r = R['garde']  # lames des patins, gris bleuté
                elif r == R['garde'] and (h <= 26 or h >= 330) and s > 0.45:
                    r = R['maillot']  # ombres brun-rouge du maillot (dos, épaules)
                roles[y, x] = r
        nettoie(roles)
        sorties.append((a, roles, corps))
    return sorties


# --- Tir (armé, descente, impact, accompagnement) --------------------------------

# Les 4 images de tir, dessinées sur un même fond et déjà calées entre elles
# (patins au même endroit) : on garde ce calage en les pixelisant sur une seule
# grille. Le dessin est plus élancé que la planche de patinage : on l'élargit
# (colonnes répétées, au plus proche voisin) pour retrouver la même carrure.
TIRS = ['tir/tir-1', 'tir/tir-2', 'tir/tir-3', 'tir/tir-4']
ELARGISSEMENT_TIR = 1.18
# Par image (coordonnées après élargissement) : casque, visage, gants, culotte
# (repeinte comme le maillot, à l'image du patinage), patins, écusson, et la crosse en segments épais (x0, y0, x1, y1) : hors du corps elle
# garde ses couleurs (`dehors`), devant le corps seulement là où elle est brune (`manche`).
ZONES_TIR = [
    {'casque': (84, 14, 116, 31), 'visage': (87, 29, 111, 50), 'gants': [(25, 23, 51, 47), (47, 47, 75, 71)],
     'culotte': (46, 69, 96, 93), 'patins': [(15, 92, 52, 120), (68, 97, 98, 120)],
     'dehors': [(5, 0, 9, 14), (9, 14, 24, 31)], 'manche': [(30, 31, 58, 56)]},
    {'casque': (84, 14, 116, 31), 'visage': (87, 29, 111, 50), 'gants': [(31, 45, 53, 73), (59, 53, 89, 79)],
     'culotte': (46, 69, 96, 93), 'patins': [(15, 92, 52, 120), (68, 97, 98, 120)],
     'dehors': [(1, 51, 31, 63), (53, 64, 60, 64)], 'manche': [(33, 64, 86, 64)]},
    {'casque': (88, 16, 118, 36), 'visage': (88, 30, 112, 52), 'gants': [(37, 27, 59, 56), (83, 69, 105, 93)],
     'culotte': (46, 69, 96, 93), 'ecusson': (70, 55, 88, 68), 'patins': [(15, 92, 52, 120), (68, 97, 98, 120)],
     'dehors': [(98, 88, 130, 109), (128, 104, 153, 106)], 'manche': [(54, 50, 98, 88)]},
    {'casque': (88, 16, 118, 36), 'visage': (88, 30, 112, 52), 'gants': [(109, 37, 131, 59), (58, 51, 84, 71)],
     'culotte': (44, 69, 96, 91), 'patins': [(6, 72, 44, 100), (68, 97, 98, 120)],
     'dehors': [(116, 53, 148, 35), (147, 36, 151, 8)], 'manche': [(38, 73, 124, 44)]},
]


def tirs():
    """Les 4 images de tir pixelisées sur une grille commune, élargies, et leurs cartes de rôles."""
    ims, masques = [], []
    for nom in TIRS:
        im = np.asarray(Image.open(SRC / f'{nom}.jpg').convert('RGB')).astype(float)
        fond = np.median(im[:30, :30].reshape(-1, 3), 0)
        fg = ndimage.binary_opening(np.linalg.norm(im - fond, axis=2) > 70, iterations=1)
        lab, n = ndimage.label(fg)
        tailles = ndimage.sum(fg, lab, range(1, n + 1))
        ims.append(im)
        masques.append(ndimage.binary_fill_holes(np.isin(lab, [i + 1 for i, t in enumerate(tailles) if t > 1000])))
    P = PERIODE_GARDIEN

    def calage(s):
        ph = np.linspace(0, P, 40, endpoint=False)
        sc = [np.interp(np.arange(p, len(s) - 1, P), np.arange(len(s)), s).mean() for p in ph]
        return ph[int(np.argmax(sc))] + 0.5

    gx = sum((np.abs(np.diff(im.mean(2), axis=1)) * m[:, 1:]).sum(0) for im, m in zip(ims, masques))
    gy = sum((np.abs(np.diff(im.mean(2), axis=0)) * m[1:, :]).sum(1) for im, m in zip(ims, masques))
    x0, y0 = calage(gx), calage(gy)
    H, W = ims[0].shape[:2]
    nx, ny = int((W - x0) / P), int((H - y0) / P)
    dessins = []
    for im, m in zip(ims, masques):
        out = np.zeros((ny, nx, 4))
        for j in range(ny):
            for i in range(nx):
                ya, xa = y0 + j * P, x0 + i * P
                sy = slice(int(round(ya)), max(int(round(ya)) + 1, int(round(ya + P))))
                sx = slice(int(round(xa)), max(int(round(xa)) + 1, int(round(xa + P))))
                bm = m[sy, sx].reshape(-1)
                if bm.mean() < 0.5:
                    continue
                out[j, i, :3] = np.median(im[sy, sx].reshape(-1, 3)[bm], 0)
                out[j, i, 3] = 255
        dessins.append(out)
    dessins = quantifie(dessins)
    for a in dessins:
        # le fond magenta, aussi dans les trous fermés (entre le bras et le corps, dans les patins)
        for y in range(a.shape[0]):
            for x in range(a.shape[1]):
                if a[y, x, 3]:
                    h, s, v = hsv(a[y, x, :3])
                    if 280 <= h <= 340 and s > 0.4 and v > 0.4:
                        a[y, x, 3] = 0
        detoure_violet(a)
    opaque = np.stack([a[..., 3] > 0 for a in dessins]).any(0)
    ys, xs = np.where(opaque)
    dessins = [a[ys.min():ys.max() + 1, xs.min():xs.max() + 1] for a in dessins]
    w = dessins[0].shape[1]
    cols = np.minimum(w - 1, (np.arange(int(round(w * ELARGISSEMENT_TIR))) / ELARGISSEMENT_TIR).astype(int))
    dessins = [np.ascontiguousarray(a[:, cols]) for a in dessins]
    dans = lambda x, y, b: b[0] <= x <= b[2] and b[1] <= y <= b[3]  # noqa: E731
    sorties = []
    for a, z in zip(dessins, ZONES_TIR):
        H2, W2 = a.shape[:2]
        roles = np.zeros((H2, W2), np.uint8)
        for y in range(H2):
            for x in range(W2):
                if not a[y, x, 3]:
                    continue
                h, s, v = hsv(a[y, x, :3])
                r = role_couleur(h, s, v, dans(x, y, z['casque']))
                rouge = r == R['maillot']
                brun = 8 <= h <= 35
                if r == R['contour']:
                    pass
                elif any(dist_seg(x, y, *seg) <= 4.5 for seg in z['dehors']):
                    r = R['garde']  # la crosse hors du corps garde ses couleurs
                elif any(dist_seg(x, y, *seg) <= 2.2 for seg in z['manche']) and brun and r != R['bande']:
                    r = R['garde']  # le manche, là où il passe devant le corps
                elif dans(x, y, z['casque']):
                    pass
                elif dans(x, y, z['visage']):
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
                elif any(dans(x, y, g) for g in z['gants']) and r != R['bande'] and brun and v < 0.72:
                    r = R['gants']  # le cuir brun (les ombres rouges autour restent du maillot)
                elif any(dans(x, y, p) for p in z['patins']) and r in (R['blanc'], R['maillot'], R['bande']):
                    r = R['garde']  # patins : lames, lacets et surpiqûres
                roles[y, x] = r
        # écusson de l'équipe sur la poitrine, là où le dessin a son emblème (torse de face)
        if 'ecusson' in z:
            x0, y0, x1, y1 = z['ecusson']
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    if a[y, x, 3] and roles[y, x] not in (R['contour'], R['garde'], R['gants']):
                        roles[y, x] = R['ecusson']
        nettoie(roles)
        sorties.append((a, roles))
    return sorties


# --- Mise en échec (une seule image : le coup d'épaule) -------------------------------

# Dessinée sur la même échelle que les autres sources : pas d'élargissement.
# Coordonnées après découpe : casque, visage, gants, culotte, patins, écusson, et la
# crosse en segments : hors du corps elle garde ses couleurs (`dehors`), devant le
# corps seulement là où elle est brune (`manche`).
ZONES_ECHEC = {
    'casque': (66, 0, 92, 16), 'visage': (68, 14, 91, 32),
    'gants': [(15, 22, 38, 48), (76, 49, 101, 71)],
    'culotte': (28, 60, 78, 82), 'ecusson': (60, 41, 78, 52),
    'patins': [(0, 90, 18, 109), (52, 90, 80, 109)],
    'dehors': [(0, 30, 16, 37), (96, 66, 118, 75), (118, 75, 134, 61), (130, 61, 137, 57)],
    'manche': [(16, 37, 97, 66)],
}


def echec():
    """L'image de la mise en échec, pixelisée, et sa carte de rôles."""
    im = np.asarray(Image.open(SRC / 'echec.jpg').convert('RGB')).astype(float)
    fond = np.median(im[:30, :30].reshape(-1, 3), 0)
    fg = ndimage.binary_opening(np.linalg.norm(im - fond, axis=2) > 70, iterations=1)
    lab, n = ndimage.label(fg)
    tailles = ndimage.sum(fg, lab, range(1, n + 1))
    masque = ndimage.binary_fill_holes(np.isin(lab, [i + 1 for i, t in enumerate(tailles) if t > 1000]))
    (a,) = quantifie([pixelise(im, masque, PERIODE_GARDIEN)])
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y, x, 3]:
                h, s, v = hsv(a[y, x, :3])
                if 280 <= h <= 340 and s > 0.4 and v > 0.4:
                    a[y, x, 3] = 0  # le fond magenta, aussi dans les trous fermés
    detoure_violet(a)
    ys, xs = np.where(a[..., 3] > 0)
    a = np.ascontiguousarray(a[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
    z = ZONES_ECHEC
    dans = lambda x, y, b: b[0] <= x <= b[2] and b[1] <= y <= b[3]  # noqa: E731
    roles = np.zeros(a.shape[:2], np.uint8)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if not a[y, x, 3]:
                continue
            h, s, v = hsv(a[y, x, :3])
            r = role_couleur(h, s, v, dans(x, y, z['casque']))
            rouge = r == R['maillot']
            brun = 8 <= h <= 35
            if r == R['contour']:
                pass
            elif any(dist_seg(x, y, *seg) <= 3.5 for seg in z['dehors']):
                r = R['garde']
            elif any(dist_seg(x, y, *seg) <= 2.2 for seg in z['manche']) and brun and r != R['bande']:
                r = R['garde']
            elif dans(x, y, z['casque']):
                pass
            elif dans(x, y, z['visage']):
                chaud = h <= 40 or h >= 330
                if (h >= 345 or h <= 8) and s > 0.8 and v > 0.35:
                    r = R['maillot']
                elif chaud and 0.2 <= v < 0.5 and s >= 0.3:
                    r = R['barbe']
                elif chaud and v >= 0.4 and s >= 0.12:
                    r = R['peau']
                else:
                    r = R['garde']
            elif any(dans(x, y, g) for g in z['gants']) and r != R['bande'] and (
                    (brun and v < 0.72) or (rouge and v < 0.55)):
                r = R['gants']
            elif any(dans(x, y, p) for p in z['patins']) and r in (R['blanc'], R['maillot'], R['bande']):
                r = R['garde']
            elif dans(x, y, z['culotte']) and rouge and (v < 0.5 or h > 12):
                r = R['garde']
            roles[y, x] = r
    x0, y0, x1, y1 = z['ecusson']
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if a[y, x, 3] and roles[y, x] not in (R['contour'], R['garde'], R['gants']):
                roles[y, x] = R['ecusson']
    nettoie(roles)
    return a, roles


# --- Célébrations (écran de but) -------------------------------------------------

# Un joueur qui fête un but, de face, sur fond magenta : chaque image
# `celebration-<n>.jpg` rejoint le tirage au sort de l'écran de but. Par image
# (coordonnées du dessin pixelisé) : casque, visage, gants, culotte et crosse
# (segments du manche, palette comprise).
# `ext` : extension de la source ; `periode` : grille du dessin (les sources
# plus grandes sont un peu plus fines) ; `rayon` : demi-épaisseur de la crosse
# (un segment peut avoir la sienne en 5e valeur).
CELEBRATIONS = [
    {'nom': 'celebration-1', 'casque': (24, 22, 46, 34), 'visage': (27, 33, 44, 47),
     'gants': [(1, 15, 18, 33), (60, 19, 76, 34)], 'culotte': (29, 69, 69, 87),
     'crosse': [(46, 2, 60, 7), (60, 7, 70, 22), (70, 30, 82, 57)]},
    # à genou, poing levé
    {'nom': 'celebration-2', 'ext': 'png', 'periode': 5.6, 'rayon': 3,
     'casque': (32, 10, 52, 24), 'visage': (34, 23, 52, 41),
     'gants': [(7, 0, 23, 21), (78, 55, 92, 72)], 'culotte': (30, 70, 82, 92),
     'crosse': [(90, 66, 118, 72), (116, 72, 131, 58)]},
    # crosse brandie au-dessus de la tête
    {'nom': 'celebration-3', 'ext': 'png', 'periode': 5.6, 'rayon': 2.8,
     'casque': (44, 24, 67, 36), 'visage': (46, 35, 66, 57),
     'gants': [(14, 10, 31, 31), (82, 9, 97, 31)], 'culotte': (40, 82, 80, 104),
     'crosse': [(1, 17, 110, 15), (108, 15, 122, 2)]},
    # bras écartés
    {'nom': 'celebration-4', 'ext': 'png', 'periode': 5.6, 'rayon': 3.6,
     'casque': (47, 24, 69, 38), 'visage': (50, 34, 69, 56),
     'gants': [(0, 31, 20, 52), (100, 34, 124, 55)], 'culotte': (44, 82, 78, 104),
     'crosse': [(119, 1, 126, 14), (123, 14, 106, 78)]},
    # la crosse jouée comme une guitare (le manche traverse le maillot : tracé fin)
    {'nom': 'celebration-5', 'casque': (10, 0, 26, 15), 'visage': (12, 3, 36, 31),
     'gants': [(13, 33, 43, 54), (55, 31, 75, 49)], 'culotte': (13, 58, 45, 80),
     'crosse': [(32, 37, 92, 37, 1.6), (90, 37, 100, 20, 3.5)]},
    # la main sur le cœur, crosse levée
    {'nom': 'celebration-6', 'casque': (10, 0, 26, 22), 'visage': (12, 3, 36, 31),
     'gants': [(13, 32, 36, 50), (58, 37, 80, 53)], 'culotte': (13, 62, 50, 82),
     'crosse': [(76, 18, 74, 85, 2.8), (65, 1, 77, 15, 3.5)]},
]


def celebrations():
    sorties = []
    dans = lambda x, y, b: b[0] <= x <= b[2] and b[1] <= y <= b[3]  # noqa: E731
    for z in CELEBRATIONS:
        im = np.asarray(Image.open(SRC / f"{z['nom']}.{z.get('ext', 'jpg')}").convert('RGB')).astype(float)
        fond = np.median(im[:30, :30].reshape(-1, 3), 0)
        fg = ndimage.binary_opening(np.linalg.norm(im - fond, axis=2) > 70, iterations=1)
        lab, n = ndimage.label(fg)
        tailles = ndimage.sum(fg, lab, range(1, n + 1))
        fg = np.isin(lab, [i + 1 for i, t in enumerate(tailles) if t > 1000])
        # on ne bouche que les petits trous : le fond vu entre les bras et la crosse reste vide
        trous, n = ndimage.label(ndimage.binary_fill_holes(fg) & ~fg)
        tailles = ndimage.sum(trous > 0, trous, range(1, n + 1))
        fg |= np.isin(trous, [i + 1 for i, t in enumerate(tailles) if t < 400])
        a = quantifie([pixelise(im, fg, z.get('periode', PERIODE_GARDIEN))])[0]
        detoure_violet(a, s_min=0.15)  # le liseré rose sous les patins aussi
        H, W = a.shape[:2]
        magenta = np.zeros((H, W), bool)
        for y in range(H):
            for x in range(W):
                h, s, v = hsv(a[y, x, :3])
                magenta[y, x] = a[y, x, 3] > 0 and 285 <= h <= 320 and s > 0.6 and v > 0.5
        for y, x in zip(*np.where(magenta)):
            vois = [(yy, xx) for yy in range(max(0, y - 1), min(H, y + 2)) for xx in range(max(0, x - 1), min(W, x + 2))
                    if (yy, xx) != (y, x) and a[yy, xx, 3] and not magenta[yy, xx]]
            if len(vois) >= 5:
                # fond magenta coincé dans le patin : il prend la couleur la plus sombre autour
                a[y, x, :3] = min((a[p][:3] for p in vois), key=lambda c: int(c.sum()))
            else:
                a[y, x, 3] = 0  # fond magenta vu entre la chaussure et la lame
        roles = np.zeros((H, W), np.uint8)
        for y in range(H):
            for x in range(W):
                if not a[y, x, 3]:
                    continue
                h, s, v = hsv(a[y, x, :3])
                r = role_couleur(h, s, v, False)
                rouge = r == R['maillot']
                if r == R['contour']:
                    pass
                elif any(dist_seg(x, y, *seg[:4]) <= (seg[4] if len(seg) > 4 else z.get('rayon', 2.5)) for seg in z['crosse']) and (
                        r == R['bande'] or not any(dans(x, y, g) for g in z['gants'])):
                    r = R['garde']  # la crosse garde ses couleurs
                elif dans(x, y, z['casque']):
                    # vrai rouge seulement : la peau orangée du front (tête renversée) reste telle quelle
                    vrai_rouge = rouge and (h >= 330 or h <= 12)
                    r = R['casque'] if vrai_rouge else R['casque-bande'] if r == R['bande'] else R['garde']
                elif dans(x, y, z['visage']):
                    # visage (peau, barbe, bouche) tel quel ; le col du maillot garde son rôle
                    bas = y >= z['visage'][3] - 5  # le col est en bas du visage (la bouche, plus haut)
                    col = bas and ((rouge and s > 0.8 and v > 0.45) or (r == R['bande'] and h >= 35) or (r == R['blanc'] and s < 0.2))
                    if not col:
                        r = R['garde']
                elif any(dans(x, y, g) for g in z['gants']) and r != R['bande'] and (
                        (8 <= h <= 35 and v < 0.72) or (rouge and v < 0.55)):
                    r = R['gants']
                elif dans(x, y, z['culotte']):
                    if rouge and (v < 0.5 or 12 < h < 30):
                        r = R['garde']  # ombres de la culotte brune
                elif r == R['blanc'] and 160 <= h <= 230:
                    r = R['garde']  # lames des patins, gris bleuté
                elif r == R['garde'] and (h <= 26 or h >= 330) and s > 0.45:
                    r = R['maillot']  # ombres brun-rouge du maillot
                roles[y, x] = r
        nettoie(roles)
        sorties.append((a, roles))
    return sorties


# --- Trophée (mode coupe) ---------------------------------------------------------


def coupe():
    """La coupe du tableau (mode coupe) : détourée, pixelisée, 64 couleurs, telle quelle."""
    im = np.asarray(Image.open(SRC / 'coupe.jpg').convert('RGB')).astype(float)
    fond = np.median(im[:30, :30].reshape(-1, 3), 0)
    fg = ndimage.binary_opening(np.linalg.norm(im - fond, axis=2) > 70, iterations=1)
    lab, n = ndimage.label(fg)
    tailles = ndimage.sum(fg, lab, range(1, n + 1))
    fg = ndimage.binary_fill_holes(np.isin(lab, [i + 1 for i, t in enumerate(tailles) if t > 1000]))
    a = quantifie([pixelise(im, fg, periode(im, fg))])[0]
    detoure_violet(a, s_min=0.15)
    return a


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
    pa, proles = portrait()
    Image.fromarray(pa, 'RGBA').save(SRC / 'portrait.png')
    Image.fromarray(proles, 'L').save(SRC / 'portrait-roles.png')
    meta['portrait'] = {'tileW': pa.shape[1], 'tileH': pa.shape[0]}
    # chutes : les deux images calées sur le centre du corps (là où le joueur est sur la glace)
    ch = chutes()
    ancres = [np.argwhere(c).mean(0)[::-1] for _, _, c in ch]
    ax = int(np.ceil(max(x for x, _ in ancres))) + 1
    ay = int(np.ceil(max(y for _, y in ancres))) + 1
    cw = max(ax - int(round(x)) + a.shape[1] for (a, _, _), (x, _) in zip(ch, ancres)) + 1
    chh = max(ay - int(round(y)) + a.shape[0] for (a, _, _), (_, y) in zip(ch, ancres)) + 1
    feuille = np.zeros((chh, cw * len(ch), 4), np.uint8)
    carte = np.zeros((chh, cw * len(ch)), np.uint8)
    tetes = []
    for i, ((a, lab, _), (x, y)) in enumerate(zip(ch, ancres)):
        ox, oy = i * cw + ax - int(round(x)), ay - int(round(y))
        m = a[..., 3] > 0
        feuille[oy:oy + a.shape[0], ox:ox + a.shape[1]][m] = a[m]
        carte[oy:oy + a.shape[0], ox:ox + a.shape[1]][m] = lab[m]
        ty, tx = np.argwhere(lab == R['casque']).mean(0)
        tetes.append((tx + ox - i * cw, ty + oy))
    Image.fromarray(feuille, 'RGBA').save(SRC / 'chute.png')
    Image.fromarray(carte, 'L').save(SRC / 'chute-roles.png')
    meta['chute'] = {'tileW': cw, 'tileH': chh, 'images': len(ch), 'pied': {'x': ax, 'y': ay},
                     'tete': [{'x': round(float(x), 1), 'y': round(float(y), 1)} for x, y in tetes]}
    # tir : les 4 images gardent leur calage commun (une case = l'image entière)
    ti = tirs()
    tiw, tih = ti[0][0].shape[1], ti[0][0].shape[0]
    Image.fromarray(np.concatenate([a for a, _ in ti], axis=1), 'RGBA').save(SRC / 'tir.png')
    Image.fromarray(np.concatenate([lab for _, lab in ti], axis=1), 'L').save(SRC / 'tir-roles.png')
    # ancre : centre du tronc (hors crosse) sur la ligne des patins, commune aux 4 images
    troncs = []
    for a, lab in ti:
        ys = np.where(a[..., 3].any(1))[0]
        b = slice(int(ys.min() + (ys.max() - ys.min()) * 0.45), int(ys.min() + (ys.max() - ys.min()) * 0.7))
        troncs.append(np.where((lab[b] != R['garde']) & (a[b, :, 3] > 0))[1].mean())
    meta['tir'] = {'tileW': tiw, 'tileH': tih, 'images': len(ti), 'pied': {'x': round(float(np.mean(troncs)), 1), 'y': tih - 1},
                   'tete': [int(np.argwhere(lab == R['casque'])[:, 0].min()) for _, lab in ti]}
    # mise en échec : une seule image, ancre au centre du tronc sur la ligne des patins
    ea, elab = echec()
    Image.fromarray(ea, 'RGBA').save(SRC / 'echec.png')
    Image.fromarray(elab, 'L').save(SRC / 'echec-roles.png')
    eh, ew = ea.shape[:2]
    b = slice(int(eh * 0.3), int(eh * 0.6))
    etronc = np.where((elab[b] != R['garde']) & (ea[b, :, 3] > 0))[1].mean()
    meta['echec'] = {'tileW': ew, 'tileH': eh, 'images': 1, 'pied': {'x': round(float(etronc), 1), 'y': eh - 1},
                     'tete': int(np.argwhere(elab == R['casque'])[:, 0].min())}
    # célébrations : cases de même taille, dessins centrés et posés sur le bas
    ce = celebrations()
    cw = max(a.shape[1] for a, _ in ce) + 2
    chh = max(a.shape[0] for a, _ in ce) + 1
    feuille = np.zeros((chh, cw * len(ce), 4), np.uint8)
    carte = np.zeros((chh, cw * len(ce)), np.uint8)
    for i, (a, lab) in enumerate(ce):
        ox, oy = i * cw + (cw - a.shape[1]) // 2, chh - 1 - a.shape[0]
        m = a[..., 3] > 0
        feuille[oy:oy + a.shape[0], ox:ox + a.shape[1]][m] = a[m]
        carte[oy:oy + a.shape[0], ox:ox + a.shape[1]][m] = lab[m]
    Image.fromarray(feuille, 'RGBA').save(SRC / 'celebration.png')
    Image.fromarray(carte, 'L').save(SRC / 'celebration-roles.png')
    # `reference` : hauteur du premier dessin, celle que vise le réglage de taille en jeu
    meta['celebration'] = {'tileW': cw, 'tileH': chh, 'images': len(ce), 'reference': int(ce[0][0].shape[0])}
    (SRC / 'sprites.json').write_text(json.dumps(meta, indent=2) + '\n')
    # trophée du mode coupe : directement dans public/ (il n'est pas repeint)
    Image.fromarray(coupe(), 'RGBA').save(SRC.parent.parent / 'public' / 'coupe.png', optimize=True)
    print(f'planche : grille {P:.2f} px, {len(dessins)} images en cases de {tw}×{th}')
    print(f'gardien : {g.shape[1]}×{g.shape[0]}')


if __name__ == '__main__':
    main()
