/**
 * Pure text search for the reader's find bar, shared by both reading modes.
 * Matching is case-insensitive and ignores whitespace on both sides: PDF page
 * text and reflow text join fragments differently (reflow inserts spaces where
 * gaps exist, pdf.js sometimes omits them), so a query typed with a space must
 * still find text that the source stores without one, and vice versa.
 */

/** A `[start, end)` character range in the original, un-normalized text. */
export interface TextMatch {
  start: number;
  end: number;
}

/** A match inside one entry (page or paragraph) of a list of texts. */
export interface IndexedTextMatch extends TextMatch {
  textIndex: number;
}

interface SearchableText {
  /** Lowercased text with all whitespace removed. */
  stripped: string;
  /** For each character of `stripped`, its offset in the original text. */
  originalOffsets: number[];
}

// Lowercase per character (not the whole string) so that characters whose
// lowercase form has a different length cannot shift the offset mapping.
function toSearchableText(text: string): SearchableText {
  let stripped = '';
  const originalOffsets: number[] = [];
  for (let offset = 0; offset < text.length; offset++) {
    const character = text[offset];
    if (/\s/.test(character)) continue;
    for (const lowered of character.toLowerCase()) {
      stripped += lowered;
      originalOffsets.push(offset);
    }
  }
  return { stripped, originalOffsets };
}

/**
 * Finds every non-overlapping occurrence of `query` in `text`.
 *
 * @param text - The text to search (a page or a paragraph).
 * @param query - What the user typed; whitespace is ignored.
 * @returns Matches in reading order with offsets into the original `text`.
 *   Empty when the query is empty or blank.
 */
export function findTextMatches(text: string, query: string): TextMatch[] {
  const target = toSearchableText(query).stripped;
  if (!target) return [];
  const { stripped, originalOffsets } = toSearchableText(text);
  const matches: TextMatch[] = [];
  let from = 0;
  for (;;) {
    const index = stripped.indexOf(target, from);
    if (index === -1) break;
    const last = index + target.length - 1;
    matches.push({ start: originalOffsets[index], end: originalOffsets[last] + 1 });
    from = index + target.length;
  }
  return matches;
}

/**
 * Searches a list of texts (all pages, or all reflow paragraphs) in order.
 *
 * @param texts - One entry per page or paragraph.
 * @param query - What the user typed.
 * @returns Matches flattened in reading order, each tagged with the index of
 *   the entry it was found in.
 */
export function findMatchesInTexts(texts: readonly string[], query: string): IndexedTextMatch[] {
  const matches: IndexedTextMatch[] = [];
  texts.forEach((text, textIndex) => {
    for (const match of findTextMatches(text, query)) {
      matches.push({ ...match, textIndex });
    }
  });
  return matches;
}
