/**
 * The jump a Quiz question offers back into the reader: the real PDF page its
 * source passage is on. One shared description keeps the question flow and the
 * review of missed questions presenting the same control, announced the same
 * way, so both can open the Book at the question's source page.
 */

export interface SourcePageJump {
  /** The real PDF page to open the Book at. */
  page: number;
  /** The control's accessible name, naming the page it jumps to. */
  label: string;
}

/**
 * Describes the reader jump for a question's source page.
 *
 * @param sourcePage - The real PDF page the question was drawn from.
 * @returns The page to open and the label that announces it.
 */
export function sourcePageJump(sourcePage: number): SourcePageJump {
  return { page: sourcePage, label: `Go to page ${sourcePage}` };
}