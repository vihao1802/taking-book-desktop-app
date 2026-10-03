/** One contiguous stretch of selected text inside a single reflow paragraph. */
export interface ReflowSelection {
  index: number;
  start: number;
  end: number;
  quote: string;
}

/** The `<p>` a text node sits in, if it is one of the article's paragraphs. */
function paragraphOf(article: HTMLElement, node: Node): HTMLElement | null {
  const paragraph = node.parentElement?.closest('p') ?? null;
  return paragraph && article.contains(paragraph) ? paragraph : null;
}

/** Characters between the start of `paragraph` and `offset` in its text node `container`; null if that node is not inside it. */
function textOffsetWithin(paragraph: HTMLElement, container: Node, offset: number): number | null {
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  let acc = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node === container) return acc + offset;
    acc += (node as Text).data.length;
  }
  return null;
}

/**
 * Maps a selection to the reflow paragraphs it covers, each with the
 * `[start, end)` range of its text. Only the paragraphs from the one holding the
 * selection's start to the one holding its end are visited, so the cost follows
 * the size of the selection rather than the length of the book.
 *
 * @param article - The reflow article the selection was made in.
 * @param range - The selection's range; both ends must be text nodes inside a paragraph of `article`.
 * @returns One entry per paragraph with selected text, in reading order; null
 *   when an end of the range is not such a text node, or a paragraph lacks its
 *   `data-para-index` (every reflow `<p>` carries its index in the paragraph
 *   list there, so no one has to count `<p>` elements from the top of the book).
 */
export function selectionToParagraphs(article: HTMLElement, range: Range): ReflowSelection[] | null {
  const { startContainer, startOffset, endContainer, endOffset } = range;
  if (startContainer.nodeType !== Node.TEXT_NODE || endContainer.nodeType !== Node.TEXT_NODE) return null;
  const first = paragraphOf(article, startContainer);
  const last = paragraphOf(article, endContainer);
  if (!first || !last) return null;

  const walker = document.createTreeWalker(article, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => ((node as Element).tagName === 'P' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  });
  walker.currentNode = first;

  const selections: ReflowSelection[] = [];
  for (let paragraph: Node | null = first; paragraph; paragraph = paragraph === last ? null : walker.nextNode()) {
    const element = paragraph as HTMLElement;
    const text = element.textContent ?? '';
    const start = element === first ? textOffsetWithin(element, startContainer, startOffset) : 0;
    const end = element === last ? textOffsetWithin(element, endContainer, endOffset) : text.length;
    const tagged = element.dataset.paraIndex;
    const index = tagged === undefined ? NaN : Number(tagged);
    if (start === null || end === null || !Number.isInteger(index)) return null;
    const quote = text.slice(start, end);
    if (quote.trim().length > 0) selections.push({ index, start, end, quote });
  }
  return selections;
}
