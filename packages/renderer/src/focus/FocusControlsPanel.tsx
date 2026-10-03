import { useCapabilities } from '@/lib/useCapabilities';
import { Separator } from '@/components/ui/separator';
import { AmbientSoundSection } from './AmbientSoundSection';
import { FocusTimerCountdown } from './FocusTimerCountdown';
import { FocusTimerSetup } from './FocusTimerSetup';
import { useFocus } from './useFocus';

/** The contents of the Focus controls popover: the Focus timer, then Ambient sound. */
export function FocusControlsPanel() {
  const { timer } = useFocus();
  const { focusTimer, ambientSound } = useCapabilities();

  return (
    <div className="flex flex-col gap-3">
      {focusTimer && (
        <section aria-label="Focus timer" className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Focus timer</h2>
          {timer.status === 'idle' ? <FocusTimerSetup /> : <FocusTimerCountdown />}
        </section>
      )}
      {focusTimer && ambientSound && <Separator />}
      {ambientSound && <AmbientSoundSection />}
    </div>
  );
}
