import { clamp } from '@core/utils';
import type { InputIntent } from '@core/types';
import { GLISSE_MIN, RAYON_JOY, zoneElan, zonePasse, zonePause } from '@render/hud-zones';

export interface PointLogique {
  x: number;
  y: number;
}
export interface EtatJoystick {
  bx: number;
  by: number;
  x: number;
  y: number;
}
export interface EtatTir {
  x0: number;
  y0: number;
  x: number;
  y: number;
}

export interface InstantaneUI {
  tactile: boolean;
  joy: EtatJoystick | null;
  tir: EtatTir | null;
  elanActif: boolean;
  passeActif: boolean;
}

const TIR_TOUCHES = new Set(['Space', 'KeyJ', 'KeyX']);
const ELAN_TOUCHES = new Set(['ShiftLeft', 'ShiftRight', 'KeyK', 'KeyC']);
const PASSE_TOUCHES = new Set(['KeyL', 'KeyV']);

/**
 * Traduit les entrées brutes (clavier, tactile) en `InputIntent` consommé une
 * fois par pas de simulation fixe, et expose un instantané pour dessiner les
 * commandes tactiles à l'écran. Ne touche jamais directement au canvas ni à
 * game-core : c'est la seule couche qui connaît les événements DOM.
 */
export class GestionnaireEntreesJeu {
  tactile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  pauseDemandee = false;

  private touches = new Set<string>();
  private joy: (EtatJoystick & { id: number }) | null = null;
  private tir: (EtatTir & { id: number }) | null = null;
  private elanId: number | null = null;
  private passeId: number | null = null;
  private tirAppui = false;
  private tirRelache = false;
  private elanAppui = false;
  private passeAppui = false;
  private tirTenu = false;

  onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    this.touches.add(e.code);
    if (TIR_TOUCHES.has(e.code)) {
      this.tirAppui = true;
      this.tirTenu = true;
    }
    if (ELAN_TOUCHES.has(e.code)) this.elanAppui = true;
    if (PASSE_TOUCHES.has(e.code)) this.passeAppui = true;
    if (e.code === 'Escape' || e.code === 'KeyP') this.pauseDemandee = true;
  }

  onKeyUp(e: KeyboardEvent): void {
    this.touches.delete(e.code);
    if (TIR_TOUCHES.has(e.code) && ![...TIR_TOUCHES].some((k) => this.touches.has(k))) {
      this.tirRelache = true;
      this.tirTenu = false;
    }
  }

  pointeSurPause(p: PointLogique, W: number): boolean {
    const zp = zonePause(W);
    return p.x >= zp.x - 4 && p.y <= zp.y + zp.h + 4 && p.y >= 0;
  }

  onPointerDown(id: number, p: PointLogique, W: number, H: number, tactile: boolean): void {
    if (tactile) this.tactile = true;
    if (p.x < W * 0.45) {
      const bx = clamp(p.x, RAYON_JOY + 4, W * 0.45);
      const by = clamp(p.y, RAYON_JOY + 30, H - RAYON_JOY - 4);
      this.joy = { id, bx, by, x: p.x, y: p.y };
    } else {
      const zpa = zonePasse(W, H);
      const ze = zoneElan(W, H);
      if (Math.hypot(p.x - zpa.x, p.y - zpa.y) < zpa.r + 6) {
        this.passeId = id;
        this.passeAppui = true;
      } else if (Math.hypot(p.x - ze.x, p.y - ze.y) < ze.r + 6) {
        this.elanId = id;
        this.elanAppui = true;
      } else {
        this.tir = { id, x0: p.x, y0: p.y, x: p.x, y: p.y };
        this.tirAppui = true;
        this.tirTenu = true;
      }
    }
  }

  onPointerMove(id: number, p: PointLogique): void {
    if (this.joy && id === this.joy.id) {
      this.joy.x = p.x;
      this.joy.y = p.y;
      // la base suit le doigt s'il s'éloigne trop : pas besoin de revenir au centre
      const dx = p.x - this.joy.bx;
      const dy = p.y - this.joy.by;
      const d = Math.hypot(dx, dy);
      if (d > RAYON_JOY * 1.6) {
        this.joy.bx = p.x - (dx / d) * RAYON_JOY * 1.6;
        this.joy.by = p.y - (dy / d) * RAYON_JOY * 1.6;
      }
    }
    if (this.tir && id === this.tir.id) {
      this.tir.x = p.x;
      this.tir.y = p.y;
    }
  }

  onPointerUp(id: number): void {
    if (this.joy && id === this.joy.id) this.joy = null;
    if (this.tir && id === this.tir.id) {
      this.tirRelache = true;
      this.tirTenu = false;
    }
    if (id === this.elanId) this.elanId = null;
    if (id === this.passeId) this.passeId = null;
  }

  /** Coupe toutes les commandes en cours (pause, changement d'écran...). */
  reinitialise(): void {
    this.joy = null;
    this.tir = null;
    this.elanId = null;
    this.passeId = null;
    this.tirTenu = false;
    this.touches.clear();
  }

  private viseeGlisse(): number | null {
    if (!this.tir) return null;
    const dx = this.tir.x - this.tir.x0;
    const dy = this.tir.y - this.tir.y0;
    return Math.hypot(dx, dy) > GLISSE_MIN ? Math.atan2(dy, dx) : null;
  }

  /** À appeler une fois par pas de simulation fixe : renvoie l'intention et consomme les évènements ponctuels. */
  consomme(): InputIntent {
    let ix = 0;
    let iy = 0;
    if (this.touches.has('ArrowLeft') || this.touches.has('KeyA') || this.touches.has('KeyQ')) ix -= 1;
    if (this.touches.has('ArrowRight') || this.touches.has('KeyD')) ix += 1;
    if (this.touches.has('ArrowUp') || this.touches.has('KeyW') || this.touches.has('KeyZ')) iy -= 1;
    if (this.touches.has('ArrowDown') || this.touches.has('KeyS')) iy += 1;
    if (ix || iy) {
      const m = Math.hypot(ix, iy);
      ix /= m;
      iy /= m;
    }
    if (this.joy) {
      const dx = (this.joy.x - this.joy.bx) / RAYON_JOY;
      const dy = (this.joy.y - this.joy.by) / RAYON_JOY;
      const m = Math.hypot(dx, dy);
      if (m > 0.12) {
        const k = Math.min(1, m) / m;
        ix = dx * k;
        iy = dy * k;
      }
    }

    const intent: InputIntent = {
      ix,
      iy,
      tirAppui: this.tirAppui,
      tirTenu: this.tirTenu,
      tirRelache: this.tirRelache,
      passeAppui: this.passeAppui,
      elanAppui: this.elanAppui,
      viseeManuelle: this.viseeGlisse(),
    };
    this.tirAppui = false;
    this.tirRelache = false;
    this.passeAppui = false;
    this.elanAppui = false;
    if (intent.tirRelache) this.tir = null;
    return intent;
  }

  instantaneUI(): InstantaneUI {
    return {
      tactile: this.tactile,
      joy: this.joy,
      tir: this.tir,
      elanActif: this.elanId !== null,
      passeActif: this.passeId !== null,
    };
  }
}
