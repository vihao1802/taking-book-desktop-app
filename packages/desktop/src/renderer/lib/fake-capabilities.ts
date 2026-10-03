import type { ReaderCapabilities } from '../../shared/types';

/** Every capability on, as the desktop app sets them. */
export const ALL_CAPABILITIES: ReaderCapabilities = {
  quiz: true,
  focusTimer: true,
  ambientSound: true,
  statistics: true,
  dropImport: true,
  fullScreen: true,
};

/**
 * Test helper: installs a fake `window.api` that carries only the given
 * capabilities (the rest stay on), for rendering components in a node test.
 */
export function installFakeCapabilities(overrides: Partial<ReaderCapabilities> = {}): void {
  const fakeWindow = { api: { capabilities: { ...ALL_CAPABILITIES, ...overrides } } };
  Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true, writable: true });
}
