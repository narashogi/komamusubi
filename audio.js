"use strict";

// Original pentatonic melody, synthesized locally. No audio downloads or services.
class KomagameAudio {
  constructor(settings = {}) {
    this.settings = { music: .3, effects: .65, ...settings };
    this.context = null;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this.playing = false;
    this.melody = [
      72,0,76,79,81,0,79,76, 74,0,76,0,79,76,74,0,
      72,76,79,0,84,0,81,79, 76,0,74,76,72,0,0,0,
      69,0,72,76,79,0,76,72, 67,0,72,0,74,72,67,0,
      69,72,76,0,79,76,74,0, 72,0,67,0,72,0,0,0,
      76,0,79,81,84,0,81,79, 74,76,79,0,81,79,76,0,
      72,0,76,79,84,81,79,0, 76,74,72,0,67,0,0,0,
      69,0,76,0,79,81,79,76, 67,0,74,76,79,0,74,0,
      72,76,79,81,84,0,79,76, 74,0,76,74,72,0,0,0,
    ];
  }
  async unlock() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    if (!this.context) {
      this.context = new Audio();
      this.musicGain = this.context.createGain();
      this.effectsGain = this.context.createGain();
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 8;
      this.musicGain.connect(limiter); this.effectsGain.connect(limiter);
      limiter.connect(this.context.destination);
      this.applyVolumes();
    }
    try { if (this.context.state === "suspended") await this.context.resume(); } catch { return; }
    if (this.playing) this.startScheduler();
  }
  applyVolumes() {
    if (!this.context) return;
    this.musicGain.gain.setTargetAtTime(this.playing ? this.settings.music * .4 : 0, this.context.currentTime, .04);
    this.effectsGain.gain.setTargetAtTime(this.settings.effects, this.context.currentTime, .02);
  }
  setVolume(kind, value) {
    this.settings[kind] = Math.max(0, Math.min(1, value));
    this.applyVolumes();
  }
  setPlaying(value) {
    this.playing = value;
    this.applyVolumes();
    if (value && this.context?.state === "running") this.startScheduler();
    if (!value) { clearInterval(this.timer); this.timer = null; }
  }
  startScheduler() {
    if (this.timer !== null || !this.playing) return;
    this.nextTime = this.context.currentTime + .08;
    this.timer = setInterval(() => this.schedule(), 30);
    this.schedule();
  }
  note(midi, when, duration, level, bus, type = "sine") {
    if (!this.context || !midi) return;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(level, when + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    oscillator.connect(gain).connect(bus); oscillator.start(when); oscillator.stop(when + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  schedule() {
    if (!this.playing || this.context.state !== "running") return;
    if (this.nextTime < this.context.currentTime) this.nextTime = this.context.currentTime + .03;
    while (this.nextTime < this.context.currentTime + .15) {
      const step = this.step % this.melody.length;
      const midi = this.melody[step];
      this.note(midi, this.nextTime, .55, .22, this.musicGain);
      if (midi) this.note(midi + 12, this.nextTime, .13, .035, this.musicGain);
      if (step % 4 === 0) this.note([48,53,45,55][Math.floor(step / 16) % 4], this.nextTime, .8, .16, this.musicGain, "triangle");
      this.step++; this.nextTime += 60 / 96 / 2;
    }
  }
  tone(frequency, duration, type, level, delay = 0) {
    if (!this.context || this.context.state !== "running") return;
    this.note(69 + 12 * Math.log2(frequency / 440), this.context.currentTime + delay, duration, level, this.effectsGain, type);
  }
  result(won) {
    [72, won ? 76 : 69, won ? 79 : 65, won ? 84 : 60].forEach((midi, i) => {
      if (this.context) this.note(midi, this.context.currentTime + i * .13, .55, .12, this.effectsGain, "triangle");
    });
  }
}
