// Synthesised sound effects (WebAudio), so there are no audio files to ship.
let ctx = null;
let master = null;
let noiseBuf = null;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
}

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}

function noise(t, dur, freq, q, peak, type = 'lowpass') {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, 0.003, peak, dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

function tone(t, dur, f0, f1, peak, type = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, 0.004, peak, dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const GUN = {
  ar: [0.12, 1800, 0.9],
  smg: [0.08, 2400, 0.6],
  pistol: [0.1, 2000, 0.7],
  pump: [0.3, 900, 1.2],
  sniper: [0.45, 1200, 1.3],
  rocket: [0.5, 500, 0.9],
};

// vol scales with distance for other players' sounds.
export function sfx(name, vol = 1) {
  if (!ctx || vol < 0.02) return;
  const t = ctx.currentTime;
  switch (name) {
    case 'ar': case 'smg': case 'pistol': case 'pump': case 'sniper': case 'rocket': {
      const [dur, freq, pk] = GUN[name];
      noise(t, dur, freq, 0.8, pk * vol);
      tone(t, dur * 0.6, 160, 50, 0.5 * vol, 'triangle');
      if (name === 'sniper') noise(t + 0.05, 0.6, 400, 0.5, 0.25 * vol);
      break;
    }
    case 'pickaxe':
      noise(t, 0.08, 1200, 2, 0.5 * vol, 'bandpass');
      tone(t, 0.1, 220, 120, 0.35 * vol, 'square');
      break;
    case 'swing':
      noise(t, 0.12, 700, 1, 0.12 * vol, 'bandpass');
      break;
    case 'crit':
      tone(t, 0.12, 880, 1320, 0.25 * vol, 'triangle');
      break;
    case 'build':
      tone(t, 0.07, 300, 520, 0.25 * vol, 'square');
      noise(t, 0.05, 2000, 1, 0.15 * vol, 'highpass');
      break;
    case 'buildBreak':
      noise(t, 0.35, 600, 0.7, 0.6 * vol);
      tone(t, 0.25, 140, 50, 0.3 * vol, 'sawtooth');
      break;
    case 'hit':
      tone(t, 0.05, 1500, 1500, 0.18 * vol, 'square');
      break;
    case 'headshot':
      tone(t, 0.18, 2200, 2000, 0.25 * vol, 'sine');
      tone(t, 0.1, 1100, 1000, 0.15 * vol, 'square');
      break;
    case 'shieldBreak':
      tone(t, 0.3, 1200, 300, 0.3 * vol, 'sawtooth');
      noise(t, 0.3, 3000, 1, 0.3 * vol, 'highpass');
      break;
    case 'hurt':
      tone(t, 0.15, 200, 90, 0.35 * vol, 'sawtooth');
      break;
    case 'pickup':
      tone(t, 0.08, 660, 990, 0.2 * vol, 'triangle');
      break;
    case 'chest':
      [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.07, 0.25, f, f, 0.15 * vol, 'triangle'));
      break;
    case 'reload':
      noise(t, 0.05, 3000, 2, 0.2 * vol, 'bandpass');
      noise(t + 0.18, 0.05, 2500, 2, 0.2 * vol, 'bandpass');
      break;
    case 'empty':
      tone(t, 0.04, 900, 900, 0.12 * vol, 'square');
      break;
    case 'heal':
      tone(t, 0.25, 440, 880, 0.15 * vol, 'sine');
      break;
    case 'glider':
      noise(t, 0.4, 900, 0.6, 0.35 * vol, 'bandpass');
      break;
    case 'elim':
      tone(t, 0.12, 700, 700, 0.25 * vol, 'square');
      tone(t + 0.12, 0.25, 1050, 1050, 0.25 * vol, 'square');
      break;
    case 'explosion':
      noise(t, 1.0, 300, 0.5, 1.2 * vol);
      tone(t, 0.6, 90, 30, 0.8 * vol, 'sine');
      break;
    case 'horn':
      tone(t, 0.6, 330, 330, 0.25 * vol, 'sawtooth');
      tone(t, 0.6, 415, 415, 0.2 * vol, 'sawtooth');
      break;
    case 'storm':
      tone(t, 1.2, 80, 60, 0.3 * vol, 'sawtooth');
      noise(t, 1.2, 250, 0.4, 0.3 * vol);
      break;
    case 'victory':
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + i * 0.12, 0.5, f, f, 0.2 * vol, 'triangle'));
      break;
    default:
  }
}
