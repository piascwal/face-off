/** Entrées de jeu (appareil → hôte) : encodage cumulatif des appuis, reconstruction pas à pas chez l'hôte. */

import type { InputIntent } from '@core/types';

const TYPE_ENTREE = 2;

// ---------------------------------------------------------------- entrées --

const TAILLE_ENTREE = 1 + 4 + 12 + 1 + 8;

/**
 * Côté client : encode l'intention de chaque image. Les appuis ponctuels
 * (tir, passe, élan) sont transmis comme des *compteurs* cumulés, pas comme
 * des booléens : si un paquet se perd, le suivant porte le même compteur et
 * l'hôte voit quand même l'appui — ni perdu, ni rejoué deux fois.
 */
export class EmetteurEntrees {
  private seq = 0;
  private nAppui = 0;
  private nRelache = 0;
  private nPasse = 0;
  private nElan = 0;
  private tenu = false;

  encode(intent: InputIntent): ArrayBuffer {
    if (intent.tirAppui && !this.tenu) {
      this.nAppui = (this.nAppui + 1) & 0xffff;
      this.tenu = true;
    }
    if (intent.tirRelache && this.tenu) {
      this.nRelache = (this.nRelache + 1) & 0xffff;
      this.tenu = false;
    }
    if (intent.passeAppui) this.nPasse = (this.nPasse + 1) & 0xffff;
    if (intent.elanAppui) this.nElan = (this.nElan + 1) & 0xffff;
    const buf = new ArrayBuffer(TAILLE_ENTREE);
    const d = new DataView(buf);
    d.setUint8(0, TYPE_ENTREE);
    d.setUint32(1, ++this.seq);
    d.setFloat32(5, intent.ix);
    d.setFloat32(9, intent.iy);
    d.setFloat32(13, intent.viseeManuelle ?? NaN);
    d.setUint8(17, this.tenu ? 1 : 0);
    d.setUint16(18, this.nAppui);
    d.setUint16(20, this.nRelache);
    d.setUint16(22, this.nPasse);
    d.setUint16(24, this.nElan);
    return buf;
  }
}

const EN_ATTENTE_MAX = 4;
/** Sans nouvelle du client depuis ce délai, son joueur s'arrête (onglet en arrière-plan, Wi-Fi coupé...). */
export const SILENCE_ENTREE_S = 0.5;

/** Côté hôte : reconstruit, pas après pas, l'`InputIntent` du joueur distant. */
export class EntreeDistante {
  private seq = 0;
  private compteurs: [number, number, number, number] | null = null;
  private attente = { appui: 0, relache: 0, passe: 0, elan: 0 };
  private tenuEmis = false;
  private ix = 0;
  private iy = 0;
  private visee: number | null = null;
  private recuA = -Infinity;

  /** Renvoie false si le paquet est invalide ou périmé (déjà dépassé par un plus récent). */
  recoit(buf: ArrayBuffer, maintenant: number): boolean {
    if (buf.byteLength !== TAILLE_ENTREE) return false;
    const d = new DataView(buf);
    if (d.getUint8(0) !== TYPE_ENTREE) return false;
    const seq = d.getUint32(1);
    if (seq <= this.seq) return false;
    let ix = d.getFloat32(5);
    let iy = d.getFloat32(9);
    const visee = d.getFloat32(13);
    if (!Number.isFinite(ix) || !Number.isFinite(iy)) return false;
    ix = Math.max(-1, Math.min(1, ix));
    iy = Math.max(-1, Math.min(1, iy));
    const m = Math.hypot(ix, iy);
    if (m > 1) {
      ix /= m;
      iy /= m;
    }
    this.seq = seq;
    this.ix = ix;
    this.iy = iy;
    this.visee = Number.isFinite(visee) && Math.abs(visee) <= Math.PI + 0.01 ? visee : null;
    this.recuA = maintenant;
    const c: [number, number, number, number] = [d.getUint16(18), d.getUint16(20), d.getUint16(22), d.getUint16(24)];
    if (this.compteurs) {
      const delta = (i: number) => Math.min(EN_ATTENTE_MAX, (c[i]! - this.compteurs![i]! + 0x10000) & 0xffff);
      this.attente.appui = Math.min(EN_ATTENTE_MAX, this.attente.appui + delta(0));
      this.attente.relache = Math.min(EN_ATTENTE_MAX, this.attente.relache + delta(1));
      this.attente.passe = Math.min(EN_ATTENTE_MAX, this.attente.passe + delta(2));
      this.attente.elan = Math.min(EN_ATTENTE_MAX, this.attente.elan + delta(3));
    }
    this.compteurs = c;
    return true;
  }

  /** Intention à appliquer pour le prochain pas de simulation (au plus un appui de chaque sorte). */
  prochain(maintenant: number): InputIntent {
    const muet = maintenant - this.recuA > SILENCE_ENTREE_S;
    let tirAppui = false;
    let tirRelache = false;
    // appui et relâché alternent toujours : un relâché n'est rejoué qu'après son appui
    if (!this.tenuEmis && this.attente.appui > 0) {
      this.attente.appui--;
      tirAppui = true;
      this.tenuEmis = true;
    } else if (this.tenuEmis && this.attente.relache > 0) {
      this.attente.relache--;
      tirRelache = true;
      this.tenuEmis = false;
    }
    const passeAppui = this.attente.passe > 0;
    if (passeAppui) this.attente.passe--;
    const elanAppui = this.attente.elan > 0;
    if (elanAppui) this.attente.elan--;
    return {
      ix: muet ? 0 : this.ix,
      iy: muet ? 0 : this.iy,
      tirAppui,
      tirTenu: this.tenuEmis,
      tirRelache,
      passeAppui,
      elanAppui,
      viseeManuelle: this.visee,
    };
  }
}

/**
 * Convertit une direction ou un angle saisi sur la patinoire locale vers la
 * patinoire de l'hôte (si les rapports largeur/hauteur diffèrent un peu).
 */
export function directionVersHote(ix: number, iy: number, kx: number, ky: number): [number, number] {
  const m = Math.hypot(ix, iy);
  if (m === 0) return [0, 0];
  const x = ix * kx;
  const y = iy * ky;
  const m2 = Math.hypot(x, y) || 1;
  return [(x / m2) * m, (y / m2) * m];
}

export function angleVersHote(a: number, kx: number, ky: number): number {
  return Math.atan2(Math.sin(a) * ky, Math.cos(a) * kx);
}
