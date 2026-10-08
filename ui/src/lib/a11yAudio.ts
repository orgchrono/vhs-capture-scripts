/**
 * A11y Audio Module - Web Audio API Synthesizer
 * Fornece feedback sonoro acessível para estágios da pipeline e erros críticos.
 */

class A11yAudio {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  private playTone(freq: number, type: OscillatorType, duration: number, vol: number = 0.1) {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn("A11yAudio disabled or blocked by browser policy");
    }
  }

  public playSuccess() {
    // Two quick ascending beeps
    this.playTone(440, 'sine', 0.1, 0.1);
    setTimeout(() => this.playTone(880, 'sine', 0.2, 0.1), 100);
  }

  public playError() {
    // Low, long buzz
    this.playTone(150, 'sawtooth', 0.5, 0.2);
  }

  public playWarning() {
    // Sharp high pitch beep for dropped frames
    this.playTone(800, 'square', 0.1, 0.15);
  }

  public playStageStart() {
    // Gentle mid tone
    this.playTone(300, 'sine', 0.2, 0.1);
  }
}

export const a11yAudio = new A11yAudio();
