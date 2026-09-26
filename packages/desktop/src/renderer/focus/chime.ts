// Two soft bell-like notes, synthesized so no sound file has to ship for it.
const NOTES_HZ = [880, 1318.5];
const NOTE_GAP_S = 0.18;
const NOTE_LENGTH_S = 1.6;
const PEAK_GAIN = 0.18;

let context: AudioContext | null = null;

function getAudioContext(): AudioContext {
  context ??= new AudioContext();
  return context;
}

function playNote(audio: AudioContext, frequencyHz: number, startAt: number): void {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequencyHz;
  // A quick attack then a long exponential decay reads as a soft bell, not a beep.
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + NOTE_LENGTH_S);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + NOTE_LENGTH_S);
}

/** Plays the soft chime that announces a Focus timer running out. Audio failures are logged, never thrown. */
export function playFocusChime(): void {
  try {
    const audio = getAudioContext();
    // A context created while the window was idle may start suspended.
    if (audio.state === 'suspended') {
      audio.resume().catch((error: unknown) => console.error('[focus] Could not resume audio for the chime', error));
    }
    NOTES_HZ.forEach((frequencyHz, index) => playNote(audio, frequencyHz, audio.currentTime + index * NOTE_GAP_S));
  } catch (error) {
    console.error('[focus] Could not play the Focus timer chime', error);
  }
}
