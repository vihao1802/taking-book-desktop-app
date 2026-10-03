import { Plus } from 'lucide-react';
import { MAX_CUSTOM_SOUND_BYTES } from '@taking-book/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFocus } from '../focus/useFocus';
import { CustomSoundRow } from './CustomSoundRow';

const MAX_CUSTOM_SOUND_MB = MAX_CUSTOM_SOUND_BYTES / (1024 * 1024);

/** Settings section for adding, renaming and deleting the reader's own Ambient sounds. */
export function CustomSoundsSettings() {
  const { customSounds, customSoundsNotice, addCustomSounds, renameCustomSound, deleteCustomSound } = useFocus();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your sounds</CardTitle>
        <CardDescription>
          Add your own audio files to the Ambient sound list. Each plays on a loop, up to {MAX_CUSTOM_SOUND_MB} MB.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div>
          <Button variant="outline" onClick={() => addCustomSounds()}>
            <Plus />
            Add sounds…
          </Button>
        </div>
        {customSoundsNotice !== null && (
          <p role={customSoundsNotice.kind === 'error' ? 'alert' : 'status'} className={customSoundsNotice.kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
            {customSoundsNotice.text}
          </p>
        )}
        {customSounds.length > 0 && (
          <ul aria-label="Your sounds" className="flex flex-col gap-1.5">
            {customSounds.map((sound) => (
              <CustomSoundRow key={sound.contentHash} sound={sound} onRename={renameCustomSound} onDelete={deleteCustomSound} />
            ))}
          </ul>
        )}
        <p className="text-muted-foreground">
          Sounds stay on this device and are not synced. Only add audio you have the right to use.
        </p>
      </CardContent>
    </Card>
  );
}
