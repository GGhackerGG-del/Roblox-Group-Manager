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

function createNoise(ctx: AudioContext, duration: number): AudioBufferSourceNode {
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

export function playHover() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const dur = 0.08;

    const noise = createNoise(ctx, dur);
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(3000, t);
    bandpass.frequency.exponentialRampToValueAtTime(6000, t + dur);
    bandpass.Q.setValueAtTime(1.5, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.012, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + dur);
  } catch {}
}

export function playClick() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const dur = 0.12;

    const noise = createNoise(ctx, dur);
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(2000, t);
    bandpass.frequency.exponentialRampToValueAtTime(5000, t + dur * 0.6);
    bandpass.frequency.exponentialRampToValueAtTime(8000, t + dur);
    bandpass.Q.setValueAtTime(1.2, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.02, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + dur);
  } catch {}
}

export function playSuccess() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const dur = 0.25;

    const noise = createNoise(ctx, dur);
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(1500, t);
    bandpass.frequency.exponentialRampToValueAtTime(6000, t + dur * 0.4);
    bandpass.frequency.exponentialRampToValueAtTime(9000, t + dur);
    bandpass.Q.setValueAtTime(0.8, t);

    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.setValueAtTime(1000, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.025, t + 0.02);
    gain.gain.setValueAtTime(0.025, t + dur * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(bandpass);
    bandpass.connect(highpass);
    highpass.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + dur);
  } catch {}
}

export function playError() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const dur = 0.18;

    const noise = createNoise(ctx, dur);
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(4000, t);
    bandpass.frequency.exponentialRampToValueAtTime(1200, t + dur);
    bandpass.Q.setValueAtTime(1.5, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.022, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + dur);
  } catch {}
}

export function playTabSwitch() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const dur = 0.1;

    const noise = createNoise(ctx, dur);
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(2500, t);
    bandpass.frequency.exponentialRampToValueAtTime(7000, t + dur);
    bandpass.Q.setValueAtTime(1.0, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.016, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + dur);
  } catch {}
}
