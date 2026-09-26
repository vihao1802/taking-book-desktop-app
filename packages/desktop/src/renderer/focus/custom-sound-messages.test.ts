import { describe, expect, it } from 'vitest';
import { describeAddedCustomSounds, UNPLAYABLE_REASON } from './custom-sound-messages';

const sound = (name: string) => ({ contentHash: name.repeat(64).slice(0, 64), name, fileName: `${name}.mp3` });

describe('describeAddedCustomSounds', () => {
  it('says nothing when the picker was cancelled', () => {
    expect(describeAddedCustomSounds(null, [])).toBeNull();
  });

  it('reports what was added', () => {
    expect(describeAddedCustomSounds({ added: [sound('a')], alreadyAdded: 0, rejected: [] }, [])).toEqual({ kind: 'info', text: 'Added 1 sound.' });
    expect(describeAddedCustomSounds({ added: [sound('a'), sound('b')], alreadyAdded: 0, rejected: [] }, [])?.text).toBe('Added 2 sounds.');
  });

  it('reports sounds that were already there', () => {
    expect(describeAddedCustomSounds({ added: [], alreadyAdded: 2, rejected: [] }, [])).toEqual({ kind: 'info', text: '2 already in your sounds.' });
  });

  it('reports every rejected file as an error, with its reason', () => {
    const notice = describeAddedCustomSounds({ added: [sound('a')], alreadyAdded: 0, rejected: [{ fileName: 'big.wav', reason: 'The file is over 50 MB.' }] }, []);
    expect(notice).toEqual({ kind: 'error', text: 'Added 1 sound. big.wav: The file is over 50 MB.' });
  });

  it('does not count a file found not to be audio as added, and says why it was refused', () => {
    const notice = describeAddedCustomSounds({ added: [sound('a')], alreadyAdded: 0, rejected: [] }, ['notes.mp3']);
    expect(notice).toEqual({ kind: 'error', text: `notes.mp3: ${UNPLAYABLE_REASON}` });
  });
});
