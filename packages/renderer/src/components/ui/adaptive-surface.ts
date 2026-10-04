import type { WindowSizeClass } from '@/lib/window-size-class';

/**
 * Whether dialogs, selects and popovers rise from the bottom edge as sheets:
 * on a phone-width window they are easier to reach and read than a small
 * floating panel. From medium up they are centred or anchored as usual.
 */
export function isBottomSheetClass(sizeClass: WindowSizeClass): boolean {
  return sizeClass === 'compact';
}

const SHEET_DIALOG =
  'inset-x-0 bottom-0 max-h-[85%] w-full max-w-none overflow-y-auto rounded-t-2xl border-t data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom';
const CENTERED_DIALOG =
  'top-[50%] left-[50%] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] rounded-lg border data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:max-w-lg';

/** Position, size and shape classes of a dialog's panel for a Window size class. */
export function getDialogPositionClasses(sizeClass: WindowSizeClass): string {
  return isBottomSheetClass(sizeClass) ? SHEET_DIALOG : CENTERED_DIALOG;
}
