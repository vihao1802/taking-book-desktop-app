/**
 * Paints find-bar matches with the CSS Custom Highlight API. Highlights are
 * drawn by the browser over existing text, so neither the pdf.js text layer
 * nor the reflow paragraphs need extra markup, and they cost nothing to
 * re-render. Several owners (each rendered page, or the reflow article) can
 * contribute ranges at once; this module merges them into two named
 * highlights styled by `::highlight(...)` rules in index.css.
 */

const MATCH_HIGHLIGHT = 'tb-search';
const ACTIVE_HIGHLIGHT = 'tb-search-active';

interface OwnerRanges {
  matches: Range[];
  active: Range | null;
}

const owners = new Map<string, OwnerRanges>();

function publish(): void {
  const all: OwnerRanges[] = [...owners.values()];
  const matches = all.flatMap((owner) => owner.matches);
  const active = all.flatMap((owner) => (owner.active ? [owner.active] : []));

  if (matches.length === 0) CSS.highlights.delete(MATCH_HIGHLIGHT);
  else CSS.highlights.set(MATCH_HIGHLIGHT, new Highlight(...matches));

  if (active.length === 0) {
    CSS.highlights.delete(ACTIVE_HIGHLIGHT);
    return;
  }
  const activeHighlight = new Highlight(...active);
  // Higher priority so the current match paints over the plain-match color.
  activeHighlight.priority = 1;
  CSS.highlights.set(ACTIVE_HIGHLIGHT, activeHighlight);
}

/** Replaces the ranges one owner (a page or the reflow article) contributes. */
export function setSearchHighlights(owner: string, matches: Range[], active: Range | null): void {
  owners.set(owner, { matches, active });
  publish();
}

/** Removes everything one owner contributed, e.g. when its page unmounts. */
export function clearSearchHighlights(owner: string): void {
  if (owners.delete(owner)) publish();
}
