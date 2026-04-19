// src/lib/sounds.js — Web Audio API sound effects for Bottle Booty
// No external files needed, pure oscillator tones

let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playTone(freq, duration, type = 'sine', volume = 0.15) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

function playSequence(notes, interval = 120) {
  notes.forEach(([freq, dur, type, vol], i) => {
    setTimeout(() => playTone(freq, dur, type, vol), i * interval);
  });
}

export const sounds = {
  // Transfer sent — gentle whoosh
  transfer_sent() { playSequence([[440, 0.15], [660, 0.15], [880, 0.2]], 80); },

  // Transfer received — pleasant ding
  transfer_received() { playSequence([[880, 0.1, 'sine', 0.2], [1100, 0.15, 'sine', 0.2], [1320, 0.3, 'sine', 0.15]], 100); },

  // Bet placed — casino chip click
  bet_placed() { playTone(600, 0.08, 'square', 0.08); setTimeout(() => playTone(800, 0.12, 'square', 0.08), 100); },

  // Bet won — victory fanfare
  bet_won() { playSequence([[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.3]], 100); },

  // Bet lost — sad trombone
  bet_lost() { playSequence([[400, 0.2], [350, 0.2], [300, 0.3]], 200); },

  // Movement completed — sonar ping
  move_complete() { playTone(700, 0.1, 'sine', 0.1); setTimeout(() => playTone(900, 0.15, 'sine', 0.1), 80); },

  // Bottle captured — epic fanfare
  bottle_captured() {
    playSequence([
      [523, 0.1], [659, 0.1], [784, 0.1],
      [1047, 0.3], [0, 0.05],
      [1047, 0.1], [1319, 0.4]
    ], 90);
  },

  // Keyword match — sparkle
  keyword_match() { playSequence([[1200, 0.08], [1500, 0.08], [1800, 0.15]], 70); },

  // Market update — subtle chime
  market_update() { playTone(500, 0.15, 'triangle', 0.06); },

  // Error — low buzz
  error() { playTone(150, 0.3, 'sawtooth', 0.08); },

  // Player nearby — alert ping
  player_nearby() { playSequence([[800, 0.1], [600, 0.1], [800, 0.15]], 120); }
};

// Auto-init on first user interaction (browsers require gesture)
if (typeof window !== 'undefined') {
  const init = () => { getCtx(); document.removeEventListener('click', init); document.removeEventListener('keydown', init); };
  document.addEventListener('click', init, { once: true });
  document.addEventListener('keydown', init, { once: true });
}
