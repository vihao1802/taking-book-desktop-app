/**
 * Parses a whole page number in `[1, total]`.
 *
 * @param input Raw text from the go-to-page field; surrounding whitespace is ignored.
 * @param total Number of pages in the document.
 * @returns The page number, or null when the input is not a whole number in range.
 */
export function parsePageNumber(input: string, total: number): number | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const page = Number(trimmed);
  return page >= 1 && page <= total ? page : null;
}
