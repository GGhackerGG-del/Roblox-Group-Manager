let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

function isEnabled(): boolean {
  return localStorage.getItem("limitedink_notif_sound") !== "false";
}

function makeOsc(ctx: AudioContext, type: OscillatorType, freq: number, t: number, dur: number, vol: number, freqEnd?: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.linearRampToValueAtTime(vol, t + Math.min(dur * 0.15, 0.015));
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

export function playHover() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    makeOsc(ctx, "sine", 1200, t, 0.06, 0.03, 1400);
    makeOsc(ctx, "sine", 1800, t, 0.04, 0.008, 2100);
  } catch {}
}

export function playClick() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    makeOsc(ctx, "sine", 800, t, 0.05, 0.04, 1200);
    makeOsc(ctx, "sine", 1600, t + 0.01, 0.04, 0.015, 2000);
    makeOsc(ctx, "triangle", 400, t, 0.03, 0.02, 600);
  } catch {}
}

export function playSuccess() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;

    const notes = [
      { f: 784, delay: 0 },
      { f: 988, delay: 0.07 },
      { f: 1175, delay: 0.14 },
    ];
    notes.forEach(({ f, delay }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, t + delay);
      osc.frequency.exponentialRampToValueAtTime(f * 1.02, t + delay + 0.12);
      gain.gain.setValueAtTime(0.001, t + delay);
      gain.gain.linearRampToValueAtTime(0.04, t + delay + 0.012);
      gain.gain.setValueAtTime(0.04, t + delay + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + delay);
      osc.stop(t + delay + 0.2);
    });

    notes.forEach(({ f, delay }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f * 2, t + delay);
      gain.gain.setValueAtTime(0.001, t + delay);
      gain.gain.linearRampToValueAtTime(0.01, t + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + delay);
      osc.stop(t + delay + 0.1);
    });
  } catch {}
}

export function playError() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(440, t);
    osc1.frequency.exponentialRampToValueAtTime(320, t + 0.15);
    gain1.gain.setValueAtTime(0.001, t);
    gain1.gain.linearRampToValueAtTime(0.04, t + 0.01);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.15);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(380, t + 0.1);
    osc2.frequency.exponentialRampToValueAtTime(280, t + 0.25);
    gain2.gain.setValueAtTime(0.001, t + 0.1);
    gain2.gain.linearRampToValueAtTime(0.035, t + 0.11);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t + 0.1);
    osc2.stop(t + 0.25);
  } catch {}
}

export function playTabSwitch() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    makeOsc(ctx, "sine", 900, t, 0.07, 0.035, 1100);
    makeOsc(ctx, "sine", 1350, t + 0.005, 0.05, 0.012, 1650);
  } catch {}
}
