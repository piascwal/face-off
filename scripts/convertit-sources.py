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

Les étapes sont rangées dans scripts/sources/ (une par type de dessin, outils
communs dans commun.py) ; ce script les enchaîne et assemble les planches.

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
import sys
from pathlib import Path

# les étapes de la conversion vivent dans scripts/sources/
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sources.commun import *  # noqa: E402,F401,F403
from sources.planche import *  # noqa: E402,F401,F403
from sources.gardien import *  # noqa: E402,F401,F403
from sources.portrait import *  # noqa: E402,F401,F403
from sources.chutes import *  # noqa: E402,F401,F403
from sources.tirs import *  # noqa: E402,F401,F403
from sources.echec import *  # noqa: E402,F401,F403
from sources.supporters import *  # noqa: E402,F401,F403
from sources.celebrations import *  # noqa: E402,F401,F403
from sources.coupe import *  # noqa: E402,F401,F403


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
    # supporters : cases de même taille, dessins centrés et posés sur le bas
    su = supporters()
    sw = max(a.shape[1] for a, _ in su) + 2
    sh = max(a.shape[0] for a, _ in su) + 1
    feuille = np.zeros((sh, sw * len(su), 4), np.uint8)
    carte = np.zeros((sh, sw * len(su)), np.uint8)
    for i, (a, lab) in enumerate(su):
        ox, oy = i * sw + (sw - a.shape[1]) // 2, sh - 1 - a.shape[0]
        m = a[..., 3] > 0
        feuille[oy:oy + a.shape[0], ox:ox + a.shape[1]][m] = a[m]
        carte[oy:oy + a.shape[0], ox:ox + a.shape[1]][m] = lab[m]
    Image.fromarray(feuille, 'RGBA').save(SRC / 'supporters.png')
    Image.fromarray(carte, 'L').save(SRC / 'supporters-roles.png')
    meta['supporters'] = {'tileW': sw, 'tileH': sh, 'images': len(su), 'pied': {'x': sw / 2, 'y': sh - 1}}
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
