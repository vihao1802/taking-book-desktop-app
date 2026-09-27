import { useEffect, useState } from 'react';
import { isOk } from '@taking-book/core';
import { resolveApiKeyMode, type ApiKeyMode } from './apiKeyMode';
import { sanitizeApiKeyInput } from './sanitizeApiKeyInput';

interface AiApiKeyState {
  /** The field's current display mode; the key itself is never held here. */
  mode: ApiKeyMode;
  /** A message fit to show the reader when loading, saving or removing failed. */
  error: string | null;
  /** Switches a saved key to the input, so the reader can replace it. */
  startReplacing: () => void;
  /** Leaves "replace" without saving, going back to the saved state. */
  cancelReplacing: () => void;
  /** Saves the given draft; empty/whitespace-only is treated as a no-op cancel. */
  saveKey: (draft: string) => void;
  /** Removes the saved key. */
  removeKey: () => void;
}

/**
 * Whether an AI provider API key is saved, and the actions Settings offers
 * on it. This never learns the key's value — only `hasAiApiKey` is read on
 * load, matching what the main process exposes.
 */
export function useAiApiKey(): AiApiKeyState {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.api.hasAiApiKey().then((res) => {
      if (cancelled) return;
      if (!isOk(res)) {
        console.error('Failed to load whether an AI API key is saved', res.error);
        setError('Could not load your AI provider key.');
        return;
      }
      setHasKey(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveKey = (draft: string): void => {
    const key = sanitizeApiKeyInput(draft);
    if (key === null) {
      setReplacing(false);
      return;
    }
    setError(null);
    window.api.setAiApiKey(key).then((res) => {
      if (!isOk(res)) {
        console.error('Failed to save the AI API key', res.error);
        setError('Could not save your key. Please try again.');
        return;
      }
      setHasKey(true);
      setReplacing(false);
    });
  };

  const removeKey = (): void => {
    setError(null);
    window.api.clearAiApiKey().then((res) => {
      if (!isOk(res)) {
        console.error('Failed to remove the AI API key', res.error);
        setError('Could not remove your key. Please try again.');
        return;
      }
      setHasKey(false);
      setReplacing(false);
    });
  };

  return {
    mode: resolveApiKeyMode(hasKey, replacing),
    error,
    startReplacing: () => setReplacing(true),
    cancelReplacing: () => setReplacing(false),
    saveKey,
    removeKey,
  };
}
