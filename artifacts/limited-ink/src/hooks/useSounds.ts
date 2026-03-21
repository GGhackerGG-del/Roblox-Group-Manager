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
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1800, t);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.015, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.04);
  } catch {}
}

export function playClick() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.setValueAtTime(1800, t + 0.015);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  } catch {}
}

export function playSuccess() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    [1047, 1319].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      const start = t + i * 0.06;
      osc.frequency.setValueAtTime(f, start);
      g.gain.setValueAtTime(0.001, start);
      g.gain.linearRampToValueAtTime(0.05, start + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.1);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.1);
    });
  } catch {}
}

export function playError() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    [520, 400].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      const start = t + i * 0.08;
      osc.frequency.setValueAtTime(f, start);
      g.gain.setValueAtTime(0.001, start);
      g.gain.linearRampToValueAtTime(0.045, start + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.1);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.1);
    });
  } catch {}
}

export function playTabSwitch() {
  if (!isEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1100, t);
    osc.frequency.setValueAtTime(1500, t + 0.012);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.04, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.055);
  } catch {}
}
