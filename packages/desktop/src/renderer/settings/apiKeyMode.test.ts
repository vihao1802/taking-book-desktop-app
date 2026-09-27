import { describe, expect, it } from 'vitest';
import { resolveApiKeyMode } from './apiKeyMode';

describe('resolveApiKeyMode', () => {
  it('is loading while the saved state is unknown', () => {
    expect(resolveApiKeyMode(null, false)).toBe('loading');
    expect(resolveApiKeyMode(null, true)).toBe('loading');
  });

  it('shows the input as "unset" when no key is saved, whether or not "replace" was clicked', () => {
    expect(resolveApiKeyMode(false, false)).toBe('unset');
    expect(resolveApiKeyMode(false, true)).toBe('unset');
  });

  it('shows the saved state, never the key, once a key exists', () => {
    expect(resolveApiKeyMode(true, false)).toBe('saved');
  });

  it('shows the input again only once the reader asks to replace a saved key', () => {
    expect(resolveApiKeyMode(true, true)).toBe('editing');
  });
});
