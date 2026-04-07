let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(freq: number, duration: number, type: OscillatorType = "sine", volume = 0.1, delay = 0) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, ctx.currentTime + delay);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.03);
  gain.gain.setValueAtTime(volume, ctx.currentTime + delay + duration - 0.06);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + duration);
}

function playChord(freqs: number[], duration: number, type: OscillatorType = "sine", volume = 0.06, delay = 0) {
  freqs.forEach(f => playTone(f, duration, type, volume, delay));
}

let outgoingInterval: ReturnType<typeof setInterval> | null = null;
let incomingInterval: ReturnType<typeof setInterval> | null = null;

function playOutgoingRingOnce() {
  playTone(523, 0.18, "sine", 0.08, 0);
  playTone(659, 0.18, "sine", 0.08, 0.22);
  playTone(784, 0.18, "sine", 0.08, 0.44);
  playTone(659, 0.18, "sine", 0.08, 0.66);
}

function playIncomingRingOnce() {
  playChord([392, 523], 0.14, "sine", 0.07, 0);
  playChord([440, 554], 0.14, "sine", 0.07, 0.18);
  playChord([494, 659], 0.16, "sine", 0.07, 0.36);
  playChord([392, 523], 0.14, "sine", 0.07, 0.6);
  playChord([440, 554], 0.14, "sine", 0.07, 0.78);
  playChord([494, 659], 0.16, "sine", 0.07, 0.96);
}

export function startOutgoingRing() {
  stopOutgoingRing();
  playOutgoingRingOnce();
  outgoingInterval = setInterval(playOutgoingRingOnce, 2800);
}

export function stopOutgoingRing() {
  if (outgoingInterval) {
    clearInterval(outgoingInterval);
    outgoingInterval = null;
  }
}

export function startIncomingRing() {
  stopIncomingRing();
  playIncomingRingOnce();
  incomingInterval = setInterval(playIncomingRingOnce, 2200);
}

export function stopIncomingRing() {
  if (incomingInterval) {
    clearInterval(incomingInterval);
    incomingInterval = null;
  }
}

export function playCallConnected() {
  playTone(392, 0.1, "sine", 0.09, 0);
  playTone(494, 0.1, "sine", 0.09, 0.1);
  playTone(659, 0.14, "sine", 0.1, 0.2);
}

export function playCallEnded() {
  playTone(659, 0.1, "sine", 0.09, 0);
  playTone(494, 0.1, "sine", 0.09, 0.1);
  playTone(392, 0.16, "sine", 0.07, 0.2);
}

export function playMute() {
  playTone(500, 0.06, "triangle", 0.05, 0);
  playTone(380, 0.08, "triangle", 0.04, 0.06);
}

export function playUnmute() {
  playTone(380, 0.06, "triangle", 0.05, 0);
  playTone(540, 0.08, "triangle", 0.04, 0.06);
}

export function playDeafen() {
  playTone(400, 0.05, "triangle", 0.04, 0);
  playTone(280, 0.1, "triangle", 0.03, 0.05);
}

export function playUndeafen() {
  playTone(280, 0.05, "triangle", 0.04, 0);
  playTone(450, 0.1, "triangle", 0.03, 0.05);
}

export function stopAllSounds() {
  stopOutgoingRing();
  stopIncomingRing();
}
