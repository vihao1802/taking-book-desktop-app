import { useCallback, useEffect, useState } from 'react';
import { err, ok, type CustomSound, type Result } from '@taking-book/core';
import { getAudioContext } from './audio-context';
import { loadCustomSound, releaseCustomSound } from './custom-sound-recordings';
import { describeAddedCustomSounds, type CustomSoundsNotice } from './custom-sound-messages';

export interface CustomSoundLibrary {
  customSounds: CustomSound[];
  notice: CustomSoundsNotice | null;
  /** Asks for audio files and adds the playable ones; what happened is left in `notice`. */
  add: () => Promise<void>;
  rename: (contentHash: string, name: string) => Promise<Result<void>>;
  /** Removes a Custom sound and its stored audio; the caller stops it if it is playing. */
  remove: (contentHash: string) => Promise<Result<void>>;
}

/** The reader's Custom sounds on this device, loaded once and kept in step with what the main process stores. */
export function useCustomSounds(): CustomSoundLibrary {
  const [customSounds, setCustomSounds] = useState<CustomSound[]>([]);
  const [notice, setNotice] = useState<CustomSoundsNotice | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const res = await window.api.listCustomSounds();
    if (res.ok) setCustomSounds(res.data);
    else console.error('[focus] Failed to load Custom sounds', res.error);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Only the renderer can tell whether a file decodes, so a file that turns out not to be audio is taken out again.
  const removeUnplayable = useCallback(async (added: CustomSound[]): Promise<string[]> => {
    const unplayable: string[] = [];
    for (const sound of added) {
      try {
        await loadCustomSound(getAudioContext(), sound.contentHash);
      } catch (error) {
        console.error(`[focus] Custom sound ${sound.name} could not be decoded`, error);
        unplayable.push(sound.name);
        await window.api.deleteCustomSound(sound.contentHash);
      }
    }
    return unplayable;
  }, []);

  const add = useCallback(async (): Promise<void> => {
    const res = await window.api.addCustomSounds();
    if (!res.ok) {
      setNotice({ kind: 'error', text: res.error });
      return;
    }
    const unplayable = res.data === null ? [] : await removeUnplayable(res.data.added);
    setNotice(describeAddedCustomSounds(res.data, unplayable));
    await refresh();
  }, [refresh, removeUnplayable]);

  const rename = useCallback(
    async (contentHash: string, name: string): Promise<Result<void>> => {
      const res = await window.api.renameCustomSound(contentHash, name);
      if (res.ok) await refresh();
      return res;
    },
    [refresh],
  );

  const remove = useCallback(
    async (contentHash: string): Promise<Result<void>> => {
      const res = await window.api.deleteCustomSound(contentHash);
      if (!res.ok) return err(res.error);
      releaseCustomSound(getAudioContext(), contentHash);
      await refresh();
      return ok(undefined);
    },
    [refresh],
  );

  return { customSounds, notice, add, rename, remove };
}
