/**
 * Trims a reader-entered API key before it is sent to the main process; null
 * for an empty or whitespace-only draft, which the caller treats as "nothing
 * to save" rather than sending it and getting the store's rejection back.
 */
export function sanitizeApiKeyInput(draft: string): string | null {
  const trimmed = draft.trim();
  return trimmed.length > 0 ? trimmed : null;
}
