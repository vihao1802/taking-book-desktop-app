/**
 * Where a selection starts and ends, as the Selection API reports it. Generic
 * over the node type so the rule can be tested without a DOM.
 */
export interface SelectionEnds<TNode> {
  anchorNode: TNode | null;
  anchorOffset: number;
  focusNode: TNode | null;
  focusOffset: number;
}

/** A `selectionchange` as the dismissal sees it. */
export interface SelectionChange<TNode> {
  /** The selection the popup was opened for. */
  opened: SelectionEnds<TNode>;
  /** The selection now. */
  current: SelectionEnds<TNode>;
  /** True when the current selection lies inside the popup (the reader is selecting its text). */
  insidePopup: boolean;
}

/**
 * Decides whether a selection change closes a floating reader popup. A popup
 * belongs to the selection it was opened for, so any other selection in the
 * reader, made with the mouse or the keyboard, closes it; selecting text inside
 * the popup does not.
 *
 * @returns True when the popup no longer belongs to the current selection.
 */
export function shouldCloseOnSelectionChange<TNode>({ opened, current, insidePopup }: SelectionChange<TNode>): boolean {
  if (insidePopup) return false;
  return (
    current.anchorNode !== opened.anchorNode ||
    current.anchorOffset !== opened.anchorOffset ||
    current.focusNode !== opened.focusNode ||
    current.focusOffset !== opened.focusOffset
  );
}
