let context: AudioContext | null = null;

/** The app's one AudioContext, shared by the chime and Ambient sound so they mix instead of competing for the output. */
export function getAudioContext(): AudioContext {
  context ??= new AudioContext();
  return context;
}

/** Resumes the context if it was created while the window was idle, which can leave it suspended. */
export async function resumeAudioContext(audio: AudioContext): Promise<void> {
  if (audio.state === 'suspended') await audio.resume();
}
