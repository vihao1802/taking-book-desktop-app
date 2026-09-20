# Context

Shared vocabulary for the taking-book monorepo. When a term is defined here, use it as-is; don't drift to synonyms.

## Glossary

- **Book**: a user-imported document (PDF) shown in the reader.
- **Page mode**: the reader view that renders a book as individual PDF page images.
- **Reflow mode**: the reader view that renders a book as continuous, re-wrapped text extracted from the PDF. It mirrors page mode's page numbering: the page shown, sought to, and carried across a mode toggle is always the real PDF page number.
- **Last-read position**: where a book reopens, saved together with the reader view (mode) it was left in. It is always the real PDF page plus how far down the reader is; in reflow mode that offset is the fraction within the page, so reopening lands on the same spot even though reflow text re-wraps.
- **Overlay**: the auto-hiding toolbar (top and bottom) shown in the reader.
- **Fit-to-width**: the page-mode layout where each page is scaled to fill the container width. Identified by a `Fit` button in the overlay. Page mode only — reflow text always re-wraps to the full viewport width instead.
- **Reflow figure**: an image or a vector drawing (a chart or diagram the PDF draws with paths, rendered from the page, with its inner labels left out of the text) extracted from a PDF page and rendered in reflow mode as a block that sits in the reading flow at its original PDF position, sized as the same share of the reading width that it takes of its PDF page (as in page mode), scaled by zoom and capped at the viewport width. Figures are never selectable; text around them is.
- **Page separator**: the thin rule with a small page number shown at the end of every PDF page in reflow mode, including pages with no extractable text, so continuous text still signals page boundaries and no page number is skipped.
- **Zoom**: the page/reflow scale factor, expressed as a percentage, clamped to the range [50, 200].
- **Zoom preset**: one of the discrete levels 50/75/100/125/150/175/200 offered in the zoom dropdown.
- **Custom zoom**: any whole zoom percentage entered directly in the dropdown's custom field, accepted only when in the range [50, 200]; anything else is rejected as invalid.
- **Zoom snapping**: the behavior of the overlay's `−`/`+` buttons, which jump to the nearest zoom preset strictly below/above the current value rather than stepping continuously.
- **Theme**: the app color scheme: light, dark, sepia, or system. Changed in Settings; not shown in the reader overlay.