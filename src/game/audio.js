// Procedural sound effects with WebAudio (no asset files needed).
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  burst({ dur = 0.15, freq = 1200, q = 0.7, gain = 0.6, type = 'lowpass', decay = 0.12, pitchDrop = 0, delay = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (pitchDrop) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * pitchDrop), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  tone(freq, dur, gain = 0.2, type = 'sine', slide = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur);
  }

  rifle() { this.burst({ dur: 0.12, freq: 2400, gain: 0.5, decay: 0.1, pitchDrop: 0.3 }); this.burst({ dur: 0.2, freq: 300, gain: 0.5, decay: 0.18 }); }
  shotgun() { this.burst({ dur: 0.3, freq: 1600, gain: 0.8, decay: 0.25, pitchDrop: 0.2 }); this.burst({ dur: 0.35, freq: 200, gain: 0.8, decay: 0.3 }); this.burst({ dur: 0.08, freq: 3000, gain: 0.2, type: 'bandpass', delay: 0.45 }); }
  launcher() { this.burst({ dur: 0.15, freq: 500, gain: 0.6, decay: 0.15 }); this.tone(180, 0.12, 0.2, 'triangle', 0.5); }
  explosion(dist = 0) {
    const g = Math.max(0.15, 1.2 - dist / 250);
    const delay = dist / 343;
    this.burst({ dur: 1.4, freq: 900, gain: g, decay: 1.3, pitchDrop: 0.08, delay });
    this.burst({ dur: 0.9, freq: 120, gain: g, decay: 0.9, delay });
  }
  hit() { this.tone(900, 0.05, 0.08, 'square', 0.5); }
  hurt() { this.burst({ dur: 0.1, freq: 600, gain: 0.3, decay: 0.1 }); this.tone(110, 0.2, 0.25, 'sawtooth', 0.6); }
  reload() { this.burst({ dur: 0.05, freq: 3500, gain: 0.2, type: 'bandpass', q: 4 }); this.burst({ dur: 0.05, freq: 2800, gain: 0.2, type: 'bandpass', q: 4, delay: 0.35 }); }
  click() { this.tone(1200, 0.04, 0.05, 'square'); }
  radio() { this.tone(1400, 0.08, 0.06, 'square'); this.tone(1000, 0.08, 0.06, 'square'); }
  minigun() { this.burst({ dur: 0.05, freq: 1800, gain: 0.25, decay: 0.05 }); }
  jet(dist = 0) {
    if (!this.ctx) return;
    this.burst({ dur: 2.5, freq: 600, gain: Math.max(0.1, 0.6 - dist / 600), decay: 2.4, type: 'bandpass', q: 0.4, pitchDrop: 0.4 });
  }

  startAmbience() {
    // Distant battle roar: filtered noise with slow swells
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6;
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lg = this.ctx.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    this.ambience = g;
  }

  setIntensity(v) { if (this.ambience) this.ambience.gain.value = 0.03 + v * 0.12; }
}
