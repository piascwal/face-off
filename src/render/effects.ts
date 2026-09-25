import type { GameEvent, TeamId } from '@core/types';
import { alea } from '@core/utils';
import { C } from './theme';
import { EQUIPES_JOUABLES, resoutEquipe, type EquipeVisuelle } from './team-visuals';

export interface Particule {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vie: number;
  max: number;
  c: string;
  t: number;
  frot?: number;
  lum?: boolean;
}

export interface Bulle {
  txt: string;
  x: number;
  y: number;
  c: string;
  vie: number;
}

export interface Banniere {
  txt: string;
  sous: string;
  c: string;
  vie: number;
  max: number;
  /** Id de l'écusson à animer à côté du texte (but marqué par cette équipe). */
  logoId?: string;
}

/**
 * État visuel « à effet de bord » (particules, tremblement d'écran, flash,
 * bandeau d'annonce...), tenu séparément de `MatchState` : c'est de la
 * présentation pure, jamais rejoué par la simulation ni envoyé à un serveur.
 * Alimenté par les `GameEvent` émis par game-core.
 */
export class SystemeEffets {
  particules: Particule[] = [];
  bulles: Bulle[] = [];
  secousse = 0;
  flash = 0;
  banniere: Banniere | null = null;
  /** Les deux équipes du match en cours — pour teinter confettis et bandeau de but. */
  equipes: [EquipeVisuelle, EquipeVisuelle] = [
    resoutEquipe(EQUIPES_JOUABLES[0]!, 'interieur'),
    resoutEquipe(EQUIPES_JOUABLES[1]!, 'interieur'),
  ];

  definitEquipes(equipes: [EquipeVisuelle, EquipeVisuelle]): void {
    this.equipes = equipes;
  }

  neige(x: number, y: number, n: number, vx = 0, vy = 0): void {
    for (let i = 0; i < n; i++) {
      this.particules.push({
        x,
        y,
        vx: vx * 0.4 + alea(-40, 40),
        vy: vy * 0.4 + alea(-40, 20),
        vie: alea(0.2, 0.5),
        max: 0.5,
        c: Math.random() < 0.5 ? '#ffffff' : '#cfeaff',
        t: 1,
      });
    }
  }

  etincelles(x: number, y: number, n: number, c = '#ffe07a'): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = alea(40, 140);
      this.particules.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vie: alea(0.15, 0.4), max: 0.4, c, t: 1, lum: true });
    }
  }

  confettis(x: number, y: number, eq: TeamId): void {
    const cs = [this.equipes[eq].maillot, this.equipes[eq].clair, C.or, C.blanc];
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = alea(30, 190);
      this.particules.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 30,
        vie: alea(0.8, 2.0),
        max: 2,
        c: cs[i % cs.length]!,
        t: Math.random() < 0.3 ? 2 : 1,
        frot: 2.2,
        lum: i % 4 === 0,
      });
    }
  }

  bulle(txt: string, x: number, y: number, c: string): void {
    this.bulles.push({ txt, x, y, c, vie: 1.1 });
  }

  annonce(txt: string, sous: string, c: string, duree = 1.6, logoId?: string): void {
    this.banniere = { txt, sous, c, vie: duree, max: duree, logoId };
  }

  /** Consomme les évènements de gameplay produits par un pas de simulation. */
  traite(evenements: GameEvent[]): void {
    for (const ev of evenements) {
      switch (ev.type) {
        case 'etincelles':
          this.etincelles(ev.x, ev.y, ev.n, ev.c);
          break;
        case 'neige':
          this.neige(ev.x, ev.y, ev.n, ev.vx, ev.vy);
          break;
        case 'confettis':
          this.confettis(ev.x, ev.y, ev.eq);
          break;
        case 'bulle':
          this.bulle(ev.txt, ev.x, ev.y, ev.c);
          break;
        case 'annonce':
          this.annonce(
            ev.txt,
            ev.sous,
            ev.eq !== undefined ? this.equipes[ev.eq].maillot : ev.c,
            ev.duree,
            ev.eq !== undefined ? this.equipes[ev.eq].teamId : undefined,
          );
          break;
        case 'secousse':
          this.secousse = Math.max(this.secousse, ev.force);
          break;
        case 'flash':
          this.flash = Math.max(this.flash, ev.force);
          break;
        default:
          break;
      }
    }
  }

  maj(dt: number): void {
    for (const p of this.particules) {
      p.vie -= dt;
      const f = Math.exp(-(p.frot ?? 4) * dt);
      p.vx *= f;
      p.vy *= f;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particules = this.particules.filter((p) => p.vie > 0);
    if (this.particules.length > 600) this.particules.splice(0, this.particules.length - 600);
    for (const b of this.bulles) {
      b.vie -= dt;
      b.y -= 14 * dt;
    }
    this.bulles = this.bulles.filter((b) => b.vie > 0);
    this.secousse = Math.max(0, this.secousse - dt * 14);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    if (this.banniere) {
      this.banniere.vie -= dt;
      if (this.banniere.vie <= 0) this.banniere = null;
    }
  }

  reinitialise(): void {
    this.particules = [];
    this.bulles = [];
    this.banniere = null;
  }
}
