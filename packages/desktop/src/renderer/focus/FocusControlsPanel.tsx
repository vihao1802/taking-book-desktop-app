import { FocusTimerCountdown } from './FocusTimerCountdown';
import { FocusTimerSetup } from './FocusTimerSetup';
import { useFocus } from './useFocus';

/** The contents of the Focus controls popover. Ambient sound joins the Focus timer here in a later change. */
export function FocusControlsPanel() {
  const { timer } = useFocus();

  return (
    <section aria-label="Focus timer" className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">Focus timer</h2>
      {timer.status === 'idle' ? <FocusTimerSetup /> : <FocusTimerCountdown />}
    </section>
  );
}
