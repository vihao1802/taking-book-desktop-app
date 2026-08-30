# Context

Shared vocabulary for the taking-book monorepo. When a term is defined here, use it as-is; don't drift to synonyms.

## Glossary

- **Book**: a user-imported document (PDF) shown in the reader.
- **Page mode**: the reader view that renders a book as individual PDF page images.
- **Reflow mode**: the reader view that renders a book as continuous, re-wrapped text extracted from the PDF.
- **Overlay**: the auto-hiding toolbar (top and bottom) shown in the reader.
- **Fit-to-width**: the page-mode layout where each page is scaled to fill the container width. Identified by a `Fit` button in the overlay.
- **Zoom**: the page/reflow scale factor, expressed as a percentage, clamped to the range [50, 200].
- **Zoom preset**: one of the discrete levels 50/75/100/125/150/175/200 offered in the zoom dropdown.
- **Custom zoom**: any whole zoom percentage entered directly in the dropdown's custom field, accepted only when in the range [50, 200]; anything else is rejected as invalid.
- **Zoom snapping**: the behavior of the overlay's `−`/`+` buttons, which jump to the nearest zoom preset strictly below/above the current value rather than stepping continuously.
- **Theme**: the app color scheme: light, dark, sepia, or system. Changed in Settings; not shown in the reader overlay.