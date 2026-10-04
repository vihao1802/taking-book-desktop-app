import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

import { cn } from '@/lib/utils';
import { DialogOverlay, DialogPortal } from './dialog';

/** A bottom sheet: a modal panel that rises from the bottom edge of the window. */
function Sheet({ ...props }: DialogPrimitive.DialogProps) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

/**
 * The sheet's panel, with a grab handle on top. The title is read out by
 * screen readers; the content brings its own visible heading.
 */
function SheetContent({
  className,
  children,
  title,
  ...props
}: DialogPrimitive.DialogContentProps & { title: string }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        aria-describedby={undefined}
        className={cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom fixed inset-x-0 bottom-0 z-50 flex max-h-[85%] flex-col gap-4 overflow-y-auto rounded-t-2xl border-t px-6 pt-3 pb-6 shadow-lg duration-200',
          className,
        )}
        {...props}
      >
        <div className="bg-muted-foreground/40 mx-auto h-1 w-10 shrink-0 rounded-full" aria-hidden="true" />
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export { Sheet, SheetContent };
