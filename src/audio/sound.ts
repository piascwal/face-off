import type { GameEvent } from '@core/types';

/**
 * Synthèse audio 100% Web Audio (aucun fichier son) : un bruit filtré sert de
 * base à tous les impacts, quelques oscillateurs pour les sifflets/klaxons, et
 * une rumeur de foule en boucle dont le niveau réagit aux évènements de jeu.
 */
export class MoteurAudio {
  private ac: AudioContext | null = null;
  private sortie: GainNode | null = null;
  private foule: GainNode | null = null;
  private bruit: AudioBuffer | null = null;
  private sonActif = true;

  init(): void {
    if (this.ac) {
      if (this.ac.state === 'suspended') void this.ac.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ac = (this.ac = new AC());
    const comp = ac.createDynamicsCompressor();
    this.sortie = ac.createGain();
    this.sortie.gain.value = this.sonActif ? 0.7 : 0;
    this.sortie.connect(comp);
    comp.connect(ac.destination);
    const n = Math.floor(ac.sampleRate * 1.5);
    this.bruit = ac.createBuffer(1, n, ac.sampleRate);
    const d = this.bruit.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    // la rumeur de la foule : du bruit filtré en boucle
    const src = ac.createBufferSource();
    src.buffer = this.bruit;
    src.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 650;
    bp.Q.value = 0.5;
    this.foule = ac.createGain();
    this.foule.gain.value = 0.03;
    src.connect(bp);
    bp.connect(this.foule);
    this.foule.connect(this.sortie);
    src.start();
  }

  private actif(): boolean {
    return !!this.ac && this.sonActif;
  }

  muet(m: boolean): void {
    this.sonActif = !m;
    if (this.sortie) this.sortie.gain.value = m ? 0 : 0.7;
  }

  private souffle(dur: number, type: BiquadFilterType, freq: number, q: number, vol: number, delai = 0): void {
    if (!this.actif() || !this.ac || !this.bruit || !this.sortie) return;
    const ac = this.ac;
    const t = ac.currentTime + delai;
    const s = ac.createBufferSource();
    s.buffer = this.bruit;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f);
    f.connect(gn);
    gn.connect(this.sortie);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  private ton(freq: number, dur: number, type: OscillatorType, vol: number, vers?: number, delai = 0): void {
    if (!this.actif() || !this.ac || !this.sortie) return;
    const ac = this.ac;
    const t = ac.currentTime + delai;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (vers) o.frequency.exponentialRampToValueAtTime(vers, t + dur);
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn);
    gn.connect(this.sortie);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  frappe(p: number): void {
    this.souffle(0.05, 'bandpass', 2200 + p * 1800, 1.3, 0.3 + 0.5 * p);
    this.ton(200 + 90 * p, 0.07, 'triangle', 0.25);
  }
  touche(): void {
    this.souffle(0.03, 'bandpass', 3200, 2, 0.12);
  }
  bande(p: number): void {
    this.souffle(0.14, 'lowpass', 520, 0.8, Math.min(0.7, 0.15 + p));
    this.ton(90, 0.12, 'sine', 0.3 * Math.min(1, p + 0.2));
  }
  poteau(): void {
    this.ton(1240, 0.55, 'sine', 0.22);
    this.ton(2490, 0.35, 'sine', 0.1);
    this.ton(3710, 0.2, 'sine', 0.05);
  }
  jambiere(): void {
    this.souffle(0.09, 'lowpass', 1100, 1, 0.55);
    this.ton(140, 0.08, 'sine', 0.3);
  }
  charge(): void {
    this.souffle(0.22, 'lowpass', 320, 0.7, 0.9);
    this.ton(70, 0.2, 'sine', 0.5, 40);
  }
  elan(): void {
    this.souffle(0.16, 'highpass', 2600, 0.7, 0.12);
  }
  raclement(): void {
    this.souffle(0.14, 'highpass', 4200, 0.8, 0.07);
  }
  clic(): void {
    this.ton(700, 0.04, 'square', 0.06);
  }

  sifflet(long: boolean): void {
    if (!this.actif() || !this.ac || !this.sortie) return;
    const ac = this.ac;
    const t = ac.currentTime;
    const d = long ? 0.9 : 0.35;
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = 2850;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 32;
    const lg = ac.createGain();
    lg.gain.value = 140;
    lfo.connect(lg);
    lg.connect(o.frequency);
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.13, t + 0.02);
    gn.gain.setValueAtTime(0.13, t + d - 0.08);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(gn);
    gn.connect(this.sortie);
    o.start(t);
    lfo.start(t);
    o.stop(t + d + 0.05);
    lfo.stop(t + d + 0.05);
  }

  klaxon(): void {
    if (!this.actif() || !this.ac || !this.sortie) return;
    const ac = this.ac;
    const t = ac.currentTime;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1300;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.2, t + 0.06);
    gn.gain.setValueAtTime(0.2, t + 1.5);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    lp.connect(gn);
    gn.connect(this.sortie);
    for (const f of [146.8, 185, 220, 293.6]) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start(t);
      o.stop(t + 2.2);
    }
  }

  ovation(niveau: number): void {
    if (!this.actif() || !this.foule || !this.ac) return;
    const gn = this.foule.gain;
    const t = this.ac.currentTime;
    gn.cancelScheduledValues(t);
    gn.setValueAtTime(gn.value, t);
    gn.linearRampToValueAtTime(0.03 + 0.3 * niveau, t + 0.25);
    gn.linearRampToValueAtTime(0.03, t + 3.5);
  }
}

export function vibre(ms: number | number[]): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* non supporté */
  }
}

/** Traduit les évènements de jeu émis par game-core en sons. */
export function joueEvenements(son: MoteurAudio, evenements: GameEvent[]): void {
  for (const ev of evenements) {
    switch (ev.type) {
      case 'frappe':
        son.frappe(ev.puissance);
        break;
      case 'touche':
        son.touche();
        break;
      case 'bande':
        son.bande(ev.force);
        break;
      case 'poteau':
        son.poteau();
        break;
      case 'jambiere':
        son.jambiere();
        break;
      case 'charge':
        son.charge();
        break;
      case 'elan':
        son.elan();
        break;
      case 'raclement':
        son.raclement();
        break;
      case 'clic':
        son.clic();
        break;
      case 'sifflet':
        son.sifflet(ev.long);
        break;
      case 'klaxon':
        son.klaxon();
        break;
      case 'ovation':
        son.ovation(ev.niveau);
        break;
      case 'vibre':
        vibre(ev.ms);
        break;
      default:
        break;
    }
  }
}
