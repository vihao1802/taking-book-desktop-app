import type { ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isBottomSheetClass } from '@/components/ui/adaptive-surface';
import { useWindowSizeClass } from '@/lib/useWindowSizeClass';
import { cn } from '@/lib/utils';

interface AdaptivePopoverProps {
  /** The accessible name of the panel. */
  label: string;
  role?: 'dialog' | 'menu';
  /** Closes the popover; the sheet's scrim calls it. */
  onClose: () => void;
  /** Where the panel sits beside its trigger from medium up. */
  anchoredClassName: string;
  children: ReactNode;
}

/**
 * A panel opened from a control. From medium up it is anchored beside the
 * control; at compact it is a bottom sheet over a scrim, in a portal so no
 * bar's backdrop blur can trap it.
 */
export function AdaptivePopover({ label, role = 'dialog', onClose, anchoredClassName, children }: AdaptivePopoverProps): ReactElement {
  const sheet = isBottomSheetClass(useWindowSizeClass());
  const stopBubbling = {
    onPointerDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
    onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  };

  if (!sheet) {
    return (
      <div
        role={role}
        aria-label={label}
        className={cn('bg-popover text-popover-foreground absolute z-30 rounded-md border shadow-md', anchoredClassName)}
        {...stopBubbling}
      >
        {children}
      </div>
    );
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/50" aria-hidden="true" {...stopBubbling} onClick={onClose} />
      <div
        role={role}
        aria-label={label}
        className="bg-popover text-popover-foreground fixed inset-x-0 bottom-0 z-40 max-h-[85%] overflow-y-auto rounded-t-2xl border-t px-4 pt-3 pb-6 shadow-lg"
        {...stopBubbling}
      >
        <div className="bg-muted-foreground/40 mx-auto mb-3 h-1 w-10 rounded-full" aria-hidden="true" />
        {children}
      </div>
    </>,
    document.body,
  );
}
