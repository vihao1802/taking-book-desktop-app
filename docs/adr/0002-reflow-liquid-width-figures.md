# ADR-0002: Reflow liquid width, in-flow figures, and page separators

Status: accepted

## Context

Reflow mode rendered extracted text at a fixed `68ch` measure (a deliberate
"narrow measure" for readability) and ignored PDF images entirely — figures
were simply dropped. Users expect reflow to behave like a reflowable reader:

- text should re-wrap to fill the window, with zoom scaling the font so a
  bigger font means fewer words per line;
- figures that appear on a PDF page should appear in the flow, at their natural
  size but never wider than the viewport;
- a side-by-side figure and text block should collapse to the figure first,
  with the co-located text flowing below it;
- continuous text still needs page-boundary cues.

The constraint that drove the design: reflow highlights are anchored by
`Annotation.paraIndex`, an index into the flat paragraph list. Any change that
reindexes paragraphs would silently corrupt saved highlights.

## Decision

1. **Liquid width.** The reflow article uses the full viewport width
   (`w-full`). Zoom continues to scale paragraph font size, so the measure is
   implicit: lines re-wrap to the window and hold fewer words as zoom rises.
   The "narrow measure" behaviour is retired for reflow.

2. **Figures live beside, not inside, the paragraph list.** Image positions are
   extracted from each page's pdf.js operator list (tracking the current
   transform through `save`/`restore`/`transform` and reading the image size
   from the `paintImageXObject` args) and anchored by a new pure core function,
   `assignImagePositions`, to the paragraph they render before. The
   `ReflowParagraph[]` spine is untouched, so `paraIndex` stays byte-stable and
   saved highlights keep working with no migration.

3. **Placement rule.** A figure precedes the first same-page paragraph whose top
   sits at or below the figure's `y`; if none, it precedes the first paragraph
   of the next page. This collapses side-by-side layouts to figure-first with
   the co-located text after it.

4. **Filtering.** Images whose bounding box covers ≥ 90% of the page are
   treated as full-page backgrounds and dropped *only when the page also has
   text* — a full-page cover or illustration on a text-less page is content and
   is kept. The ratio is a configurable option. Repeated paints of the same
   object within a page are deduped, and images at the same position/size on
   multiple pages (running headers, footers, watermarks) keep only their first
   instance.

5. **Lazy decoding.** Figure pixel data is decoded only when a figure
   approaches the viewport (`IntersectionObserver`), through an `ImageDecoder`
   interface with an `ImageBitmap`-only decoder for the first cut (raw-array
   formats such as JPX, CMYK JPEG, and masks are future decoders). Decoded
   object URLs live in a bounded LRU cache (`URL.revokeObjectURL` on eviction),
   scoped by file hash so two documents' pdf.js object ids cannot collide.
   The pdf.js image objects transferred by the eager `getOperatorList` pass are
   left in `page.objs` (no `pdf.cleanup()`) so `getImageData` can resolve them
   as figures near the viewport; the pdf is destroyed on close, releasing the
   memory. Only off-screen figures' decoded blobs are deferred — the raw
   transfer is accepted as a fixed cost for the first cut.

6. **Page separators.** The renderer derives, at draw time, a thin rule with a
   small 1-based page number whenever the flow's page index changes. No data
   model change; `paraIndex` is unaffected.

## Consequences

- Reflow now reads like a reflowable document and can display diagram/figure
  books; images are never selectable or highlightable.
- `ReflowParagraph` gains a `y` field (first-line baseline) to enable image
  anchoring; it is additive and existing consumers ignore it.
- First cut decodes only `ImageBitmap`-backed images; figures that pdf.js
  cannot expose as a bitmap render as a placeholder box, not an error.
- Running the image pass requires a full `getOperatorList` over the document,
  which is heavier than text extraction; it runs only while reflow mode is
  active, and `pdf.cleanup()` bounds the transient memory cost.

## Amendment: proportional figure sizing

Figures were first sized at their PDF point size times zoom, which ignored the
window: they shrank to thumbnails in a wide window and, with text re-wrapping
to the full width, no longer related to the surrounding text the way they do on
the page. A figure is now sized as `image.width / page width` of the reading
width (scaled by zoom, capped at the viewport), so it takes the same share of
the view as in page mode. This needs the page width on each `ReflowImage`
(`pageWidth`), captured at extraction time.
