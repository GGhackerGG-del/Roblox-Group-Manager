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

function playTone(freq: number, duration: number, type: OscillatorType = "sine", volume = 0.15, delay = 0) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, ctx.currentTime + delay);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.02);
  gain.gain.setValueAtTime(volume, ctx.currentTime + delay + duration - 0.05);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + duration);
}

function playChord(freqs: number[], duration: number, type: OscillatorType = "sine", volume = 0.08, delay = 0) {
  freqs.forEach(f => playTone(f, duration, type, volume, delay));
}

let outgoingInterval: ReturnType<typeof setInterval> | null = null;
let incomingInterval: ReturnType<typeof setInterval> | null = null;

function playOutgoingRingOnce() {
  playTone(440, 0.15, "sine", 0.12, 0);
  playTone(520, 0.15, "sine", 0.12, 0.18);
  playTone(440, 0.15, "sine", 0.12, 0.36);
  playTone(520, 0.15, "sine", 0.12, 0.54);
}

function playIncomingRingOnce() {
  playChord([523.25, 659.25], 0.12, "sine", 0.1, 0);
  playChord([587.33, 739.99], 0.12, "sine", 0.1, 0.15);
  playChord([659.25, 830.61], 0.14, "sine", 0.1, 0.3);
  playChord([523.25, 659.25], 0.12, "sine", 0.1, 0.55);
  playChord([587.33, 739.99], 0.12, "sine", 0.1, 0.7);
  playChord([659.25, 830.61], 0.14, "sine", 0.1, 0.85);
}

export function startOutgoingRing() {
  stopOutgoingRing();
  playOutgoingRingOnce();
  outgoingInterval = setInterval(playOutgoingRingOnce, 2500);
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
  incomingInterval = setInterval(playIncomingRingOnce, 2000);
}

export function stopIncomingRing() {
  if (incomingInterval) {
    clearInterval(incomingInterval);
    incomingInterval = null;
  }
}

export function playCallConnected() {
  playTone(440, 0.08, "sine", 0.12, 0);
  playTone(554.37, 0.08, "sine", 0.12, 0.08);
  playTone(659.25, 0.12, "sine", 0.14, 0.16);
}

export function playCallEnded() {
  playTone(523.25, 0.08, "sine", 0.12, 0);
  playTone(415.3, 0.08, "sine", 0.12, 0.08);
  playTone(329.63, 0.15, "sine", 0.1, 0.16);
}

export function playMute() {
  playTone(350, 0.06, "square", 0.06, 0);
  playTone(280, 0.08, "square", 0.05, 0.06);
}

export function playUnmute() {
  playTone(280, 0.06, "square", 0.06, 0);
  playTone(400, 0.08, "square", 0.05, 0.06);
}

export function playDeafen() {
  playTone(300, 0.05, "sawtooth", 0.04, 0);
  playTone(200, 0.1, "sawtooth", 0.03, 0.05);
}

export function playUndeafen() {
  playTone(200, 0.05, "sawtooth", 0.04, 0);
  playTone(350, 0.1, "sawtooth", 0.03, 0.05);
}

export function stopAllSounds() {
  stopOutgoingRing();
  stopIncomingRing();
}
