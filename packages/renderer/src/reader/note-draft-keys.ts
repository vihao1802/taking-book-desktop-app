/** The facts about a key press that decide what a Note draft does with it. */
export interface NoteDraftKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  /** True while an input method (IME) is still composing text; its Enter/Esc belong to it. */
  isComposing: boolean;
}

export type NoteDraftKeyAction = 'save' | 'cancel';

/**
 * Decides what a key press in a Note draft's text box means. Cmd/Ctrl+Enter
 * saves and Escape discards, while a plain Enter is left alone so it inserts a
 * new line in the multi-line note.
 *
 * @param event - The key press, reduced to the fields that matter.
 * @returns The draft action to run, or null when the key is just typing.
 */
export function resolveNoteDraftKey(event: NoteDraftKeyEvent): NoteDraftKeyAction | null {
  if (event.isComposing) return null;
  if (event.key === 'Escape') return 'cancel';
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) return 'save';
  return null;
}
