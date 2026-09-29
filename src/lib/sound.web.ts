// Web build UI sounds, synthesized with Web Audio (no file fetch, no
// latency) to match assets/sounds/tick.wav and confirm.wav used natively.
// Browsers only start audio from a user gesture, so preloadSounds() arms a
// one-time unlock on the first tap/click.

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let noise: AudioBuffer | null = null;

function audio(): Ctx | null {
  try {
    if (!ctx) {
      const C =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

let armed = false;
export function preloadSounds() {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  const unlock = () => {
    audio();
    window.removeEventListener('touchend', unlock);
    window.removeEventListener('click', unlock);
  };
  window.addEventListener('touchend', unlock);
  window.addEventListener('click', unlock);
}

function tone(c: Ctx, freq: number, start: number, decay: number, peak: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + decay);
  g.connect(c.destination);
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, start);
  o.connect(g);
  o.start(start);
  o.stop(start + decay + 0.01);
}

export function playTick() {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  tone(c, 1500, t, 0.03, 0.05);
  tone(c, 3000, t, 0.012, 0.012);
  if (!noise) {
    const len = Math.floor(c.sampleRate * 0.01);
    noise = c.createBuffer(1, len, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.0012));
  }
  const src = c.createBufferSource();
  src.buffer = noise;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const g = c.createGain();
  g.gain.value = 0.025;
  src.connect(hp).connect(g).connect(c.destination);
  src.start(t);
}

export function playConfirm() {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  tone(c, 880, t, 0.09, 0.07);
  tone(c, 1320, t + 0.012, 0.07, 0.04);
}
