// Short action sounds made on the fly with Web Audio (no sound files to license or download).
// Cues only follow an action that has already succeeded or been refused; they never delay it.
// Turning the setting off silences everything immediately.

export type Cue = 'success' | 'undo' | 'error' | 'create';
// Notes in Hz and their start offsets in seconds.
const CUES: Record<Cue, Array<[number, number]>> = {
  success: [[659.25, 0], [987.77, 0.07]],
  create: [[523.25, 0], [659.25, 0.06], [783.99, 0.12]],
  undo: [[783.99, 0], [587.33, 0.08]],
  error: [[220, 0], [196, 0.11]],
};

let ctx: AudioContext | undefined;
let enabled = true;
let volume = 0.4;

export function configureSounds(on: boolean, vol: number) { enabled = on; volume = Math.max(0, Math.min(1, vol)); }

export function play(cue: Cue) {
  if (!enabled || volume === 0) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    const now = ctx.currentTime;
    for (const [freq, at] of CUES[cue]) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = cue === 'error' ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      const t0 = now + at, len = cue === 'error' ? 0.16 : 0.12;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18 * volume, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + len + 0.02);
    }
  } catch { /* no audio on this device: the visible message already says what happened */ }
}
