import { describe, expect, it } from 'vitest';
import { sanitizeApiKeyInput } from './sanitizeApiKeyInput';

describe('sanitizeApiKeyInput', () => {
  it('trims surrounding whitespace', () => {
    expect(sanitizeApiKeyInput('  sk-abc123  ')).toBe('sk-abc123');
  });

  it('rejects an empty or whitespace-only draft', () => {
    expect(sanitizeApiKeyInput('')).toBeNull();
    expect(sanitizeApiKeyInput('   ')).toBeNull();
  });

  it('leaves an already-clean key untouched', () => {
    expect(sanitizeApiKeyInput('sk-abc123')).toBe('sk-abc123');
  });
});
