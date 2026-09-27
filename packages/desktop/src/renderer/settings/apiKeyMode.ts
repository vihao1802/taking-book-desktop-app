/**
 * The AI provider API key field's display mode, derived from whether a key
 * is saved and whether the reader is actively replacing it. The key itself
 * never factors in here — Settings never learns its value, only this state.
 */
export type ApiKeyMode = 'loading' | 'unset' | 'saved' | 'editing';

/**
 * Resolves the field's mode. While loading, `hasKey` is null. A reader with
 * no key saved sees "unset" (the input, with nothing to cancel back to); a
 * reader with a key saved sees "saved" until they choose to replace it,
 * which is the only way "editing" (the input, with a cancel back to
 * "saved") is reached.
 */
export function resolveApiKeyMode(hasKey: boolean | null, replacing: boolean): ApiKeyMode {
  if (hasKey === null) return 'loading';
  if (!hasKey) return 'unset';
  return replacing ? 'editing' : 'saved';
}
