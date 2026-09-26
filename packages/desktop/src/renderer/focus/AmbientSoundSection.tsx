import { Square, Volume2 } from 'lucide-react';
import { AMBIENT_SOUNDS, type AmbientSound, type AmbientSoundKind } from '@taking-book/core';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useFocus } from './useFocus';

const KIND_LABELS: Record<AmbientSoundKind, string> = {
  noise: 'Noise',
  nature: 'Nature',
  instrumental: 'Instrumental',
  custom: 'Your sounds',
};

// Catalog order within each kind, kinds in the order they first appear.
function groupSoundsByKind(sounds: AmbientSound[]): [AmbientSoundKind, AmbientSound[]][] {
  const groups = new Map<AmbientSoundKind, AmbientSound[]>();
  sounds.forEach((sound) => groups.set(sound.kind, [...(groups.get(sound.kind) ?? []), sound]));
  return [...groups.entries()];
}

const SOUND_GROUPS = groupSoundsByKind(AMBIENT_SOUNDS);

// The slider works in whole percent; the Ambient sound volume runs from 0 to 1.
const VOLUME_SLIDER_MAX = 100;

/** Chooses, stops and sets the volume of the Ambient sound. */
export function AmbientSoundSection() {
  const { sound, soundError, chooseSound, stopSound, setVolume } = useFocus();
  const playingId = sound.status !== 'stopped' ? sound.soundId : null;

  return (
    <section aria-label="Ambient sound" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Ambient sound</h2>
        <Button size="sm" variant="outline" disabled={playingId === null} onClick={() => stopSound()} aria-label="Stop Ambient sound">
          <Square />
          Stop
        </Button>
      </div>
      {SOUND_GROUPS.map(([kind, sounds]) => (
        <div key={kind} role="group" aria-label={KIND_LABELS[kind]} className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs">{KIND_LABELS[kind]}</span>
          <div className="grid grid-cols-3 gap-1.5">
            {sounds.map(({ id, name }) => (
              <Button
                key={id}
                size="sm"
                // A remembered sound that is not playing is still shown as the reader's choice.
                variant={playingId === id ? 'default' : sound.soundId === id ? 'secondary' : 'outline'}
                aria-pressed={playingId === id}
                aria-current={sound.soundId === id ? 'true' : undefined}
                onClick={() => chooseSound(id)}
                className="text-xs"
              >
                {name}
              </Button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2.5">
        <Volume2 className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <Slider
          thumbLabel="Ambient sound volume"
          min={0}
          max={VOLUME_SLIDER_MAX}
          step={1}
          value={[Math.round(sound.volume * VOLUME_SLIDER_MAX)]}
          onValueChange={([percent]) => setVolume(percent / VOLUME_SLIDER_MAX)}
        />
      </div>
      {soundError !== null && (
        <p role="alert" className="text-destructive text-xs">
          {soundError}
        </p>
      )}
    </section>
  );
}
