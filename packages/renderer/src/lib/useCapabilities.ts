import type { ReaderCapabilities } from '@/reader-api';

/** The optional features the running platform supports, as declared on the reader API. */
export function useCapabilities(): ReaderCapabilities {
  return window.api.capabilities;
}

/** Whether the Focus controls have anything to offer: a Focus timer or an Ambient sound. */
export function hasFocusControls(capabilities: ReaderCapabilities): boolean {
  return capabilities.focusTimer || capabilities.ambientSound;
}
