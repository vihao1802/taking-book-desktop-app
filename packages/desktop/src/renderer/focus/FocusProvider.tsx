import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  INITIAL_FOCUS_STATE,
  applyFocusAction,
  getFocusTimeLeftMs,
  ok,
  type FocusAction,
  type FocusEffect,
  type FocusError,
  type FocusState,
  type Result,
} from '@taking-book/core';
import { playFocusChime } from './chime';
import { FocusContext, type FocusContextValue } from './focusContext';
import { notifyFocusEndedIfUnfocused } from './focus-notification';
import { FocusNotice } from './FocusNotice';
import { useFocusTicker } from './useFocusTicker';

// Rounded so the provider only re-renders when the shown second changes, not on every tick.
function roundUpToSecond(ms: number | null): number | null {
  return ms === null ? null : Math.ceil(ms / 1000) * 1000;
}

/**
 * Owns the app's single Focus timer. It sits above the reader and every other
 * view, so the timer keeps running across Books and views, and it lives only
 * in memory, so quitting the app discards it.
 */
export function FocusProvider({ children }: { children: ReactNode }) {
  // The ref is the source of truth so back-to-back actions never read a stale render's state.
  const stateRef = useRef<FocusState>(INITIAL_FOCUS_STATE);
  const [timer, setTimer] = useState(INITIAL_FOCUS_STATE.timer);
  const [timeLeftMs, setTimeLeftMs] = useState<number | null>(null);
  const [noticeId, setNoticeId] = useState<number | null>(null);

  const carryOut = useCallback((effect: FocusEffect): void => {
    switch (effect.type) {
      case 'chime':
        playFocusChime();
        return;
      case 'notify':
        setNoticeId((id) => (id ?? 0) + 1);
        notifyFocusEndedIfUnfocused();
        return;
    }
  }, []);

  const dispatch = useCallback(
    (action: FocusAction): Result<void, FocusError> => {
      const now = Date.now();
      const result = applyFocusAction(stateRef.current, action, now);
      if (!result.ok) return result;
      const { state, effects } = result.data;
      stateRef.current = state;
      setTimer(state.timer);
      setTimeLeftMs(roundUpToSecond(getFocusTimeLeftMs(state.timer, now)));
      effects.forEach(carryOut);
      return ok(undefined);
    },
    [carryOut],
  );

  const dismissNotice = useCallback(() => setNoticeId(null), []);

  const tick = useCallback(() => {
    dispatch({ type: 'tick' });
  }, [dispatch]);
  useFocusTicker(timer, tick);

  const value = useMemo<FocusContextValue>(
    () => ({
      timer,
      timeLeftMs,
      start: (minutes) => dispatch({ type: 'start', minutes }),
      pause: () => dispatch({ type: 'pause' }),
      resume: () => dispatch({ type: 'resume' }),
      stop: () => dispatch({ type: 'stop' }),
    }),
    [timer, timeLeftMs, dispatch],
  );

  return (
    <FocusContext.Provider value={value}>
      {children}
      <FocusNotice noticeId={noticeId} onDismiss={dismissNotice} />
    </FocusContext.Provider>
  );
}
