import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  INITIAL_FOCUS_STATE,
  applyFocusAction,
  getFocusTimeLeftMs,
  ok,
  type FocusAction,
  type FocusError,
  type FocusState,
  type Result,
} from '@taking-book/core';
import { describeAmbientSoundFailure, logAmbientSoundFailure, type AmbientSoundFailure } from './ambient-sound-failure';
import { carryOutFocusEffect } from './carry-out-focus-effect';
import { FocusContext, type FocusContextValue } from './focusContext';
import { FocusNotice } from './FocusNotice';
import { useFocusTicker } from './useFocusTicker';
import { createWebAudioSoundPlayer } from './web-audio-sound-player';

// Rounded so the provider only re-renders when the shown second changes, not on every tick.
function roundUpToSecond(ms: number | null): number | null {
  return ms === null ? null : Math.ceil(ms / 1000) * 1000;
}

// The Focus controls only offer valid choices, so a rejected action is a bug worth logging, not a message for the reader.
function logRejected(action: FocusAction, result: Result<void, FocusError>): void {
  if (!result.ok) console.error(`[focus] Rejected ${action.type}: ${result.error}`);
}

/**
 * Owns the app's single Focus timer and Ambient sound. It sits above the
 * reader and every other view, so both keep going across Books and views, and
 * it lives only in memory, so quitting the app discards them.
 */
export function FocusProvider({ children }: { children: ReactNode }) {
  // The ref is the source of truth so back-to-back actions never read a stale render's state.
  const stateRef = useRef<FocusState>(INITIAL_FOCUS_STATE);
  const [timer, setTimer] = useState(INITIAL_FOCUS_STATE.timer);
  const [sound, setSound] = useState(INITIAL_FOCUS_STATE.sound);
  const [timeLeftMs, setTimeLeftMs] = useState<number | null>(null);
  const [noticeId, setNoticeId] = useState<number | null>(null);
  const [soundError, setSoundError] = useState<string | null>(null);
  const [player] = useState(createWebAudioSoundPlayer);

  const dispatch = useMemo(() => {
    const run = (action: FocusAction): Result<void, FocusError> => {
      const now = Date.now();
      const result = applyFocusAction(stateRef.current, action, now);
      if (!result.ok) return result;
      const { state, effects } = result.data;
      stateRef.current = state;
      setTimer(state.timer);
      setSound(state.sound);
      setTimeLeftMs(roundUpToSecond(getFocusTimeLeftMs(state.timer, now)));
      const handlers = { player, soundId: state.sound.soundId, showNotice, onSoundFailure };
      effects.forEach((effect) => carryOutFocusEffect(effect, handlers));
      return ok(undefined);
    };
    const showNotice = (): void => setNoticeId((id) => (id ?? 0) + 1);
    const onSoundFailure = (failure: AmbientSoundFailure): void => {
      logAmbientSoundFailure(failure);
      setSoundError(describeAmbientSoundFailure(failure));
      // A sound that failed to start is silent, so the controls must not show it as playing.
      const current = stateRef.current.sound;
      if (failure.operation === 'play' && current.status === 'playing' && current.soundId === failure.soundId) {
        run({ type: 'stop-sound' });
      }
    };
    return run;
  }, [player]);

  const dispatchLogged = useCallback((action: FocusAction) => logRejected(action, dispatch(action)), [dispatch]);
  const dismissNotice = useCallback(() => setNoticeId(null), []);

  const tick = useCallback(() => dispatchLogged({ type: 'tick' }), [dispatchLogged]);
  useFocusTicker(timer, tick);

  const value = useMemo<FocusContextValue>(
    () => ({
      timer,
      timeLeftMs,
      // start hands its Result back: an invalid custom length is the reader's to fix, not a bug to log.
      start: (minutes) => dispatch({ type: 'start', minutes }),
      pause: () => dispatchLogged({ type: 'pause' }),
      resume: () => dispatchLogged({ type: 'resume' }),
      stop: () => dispatchLogged({ type: 'stop' }),
      sound,
      soundError,
      chooseSound: (soundId) => {
        setSoundError(null);
        dispatchLogged({ type: 'choose-sound', soundId });
      },
      stopSound: () => dispatchLogged({ type: 'stop-sound' }),
      setVolume: (volume) => dispatchLogged({ type: 'set-volume', volume }),
    }),
    [timer, timeLeftMs, sound, soundError, dispatch, dispatchLogged],
  );

  return (
    <FocusContext.Provider value={value}>
      {children}
      <FocusNotice noticeId={noticeId} onDismiss={dismissNotice} />
    </FocusContext.Provider>
  );
}
