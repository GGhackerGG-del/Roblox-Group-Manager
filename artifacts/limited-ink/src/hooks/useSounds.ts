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

export function playHover() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(920, t + 0.05);
    gain.gain.setValueAtTime(0.018, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.start(t);
    osc.stop(t + 0.05);
  } catch {}
}

export function playClick() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc2.type = "sine";
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.06);
    osc2.frequency.setValueAtTime(990, t);
    osc2.frequency.exponentialRampToValueAtTime(1100, t + 0.06);
    gain.gain.setValueAtTime(0.025, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + 0.08);
    osc2.stop(t + 0.08);
  } catch {}
}

export function playSuccess() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const notes = [523, 659, 784];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      const start = t + i * 0.08;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.035, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
      osc.start(start);
      osc.stop(start + 0.15);
    });
  } catch {}
}

export function playError() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(350, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.18);
    gain.gain.setValueAtTime(0.035, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.start(t);
    osc.stop(t + 0.2);
  } catch {}
}

export function playTabSwitch() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.exponentialRampToValueAtTime(840, t + 0.06);
    gain.gain.setValueAtTime(0.022, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.start(t);
    osc.stop(t + 0.07);
  } catch {}
}
