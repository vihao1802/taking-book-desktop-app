import { useState } from 'react';
import {
  DEFAULT_FOCUS_MINUTES,
  FOCUS_MAX_MINUTES,
  FOCUS_MIN_MINUTES,
  FOCUS_PRESET_MINUTES,
  ok,
  parseFocusMinutes,
  type FocusError,
  type Result,
} from '@taking-book/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useFocus } from './useFocus';

const LENGTH_RANGE = `${FOCUS_MIN_MINUTES}–${FOCUS_MAX_MINUTES}`;
const INVALID_LENGTH_MESSAGE = `Enter a whole number of minutes from ${FOCUS_MIN_MINUTES} to ${FOCUS_MAX_MINUTES}.`;

/** Picks a Focus timer length, from a preset or a custom whole number of minutes, and starts it. */
export function FocusTimerSetup() {
  const { start } = useFocus();
  // null means the custom field is the chosen length.
  const [preset, setPreset] = useState<number | null>(DEFAULT_FOCUS_MINUTES);
  const [customDraft, setCustomDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const startChosenLength = (): void => {
    const length: Result<number, FocusError> = preset === null ? parseFocusMinutes(customDraft) : ok(preset);
    const started = length.ok ? start(length.data) : length;
    setError(started.ok ? null : INVALID_LENGTH_MESSAGE);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Focus timer presets">
        {FOCUS_PRESET_MINUTES.map((minutes) => (
          <Button
            key={minutes}
            variant={preset === minutes ? 'default' : 'outline'}
            size="sm"
            aria-pressed={preset === minutes}
            onClick={() => {
              setPreset(minutes);
              setError(null);
            }}
          >
            {minutes}m
          </Button>
        ))}
      </div>
      <Input
        value={customDraft}
        inputMode="numeric"
        placeholder={`Custom minutes (${LENGTH_RANGE})`}
        aria-label="Custom Focus timer minutes"
        aria-invalid={error !== null}
        onChange={(event) => {
          setCustomDraft(event.target.value);
          setPreset(null);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') startChosenLength();
        }}
        className={cn('h-8', error !== null && 'border-destructive')}
      />
      {error !== null && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
      <Button size="sm" onClick={startChosenLength}>
        Start
      </Button>
    </div>
  );
}
