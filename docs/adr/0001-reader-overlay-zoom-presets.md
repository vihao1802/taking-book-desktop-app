# ADR-0001: Reader overlay zoom presets and controls

Status: accepted

## Context

The reader overlay's zoom controls were a continuous stepper (`−` / percentage /
`+`) with a hidden fit-to-width icon button and a redundant theme button:

- The `+/−` buttons moved zoom by a fixed 0.15 step, so reaching a "round"
  level like 200% required repeated presses, and the value could exceed 200%.
- The percentage label had no affordance — clicking it silently reset zoom to
  100% with no visible hint.
- The fit-to-width control was a bare icon with only a hover tooltip, so users
  couldn't tell what it did.
- The theme (SunMoon) button duplicated Settings, which already offers the full
  light/dark/sepia/system picker, and its cycling (light → dark → sepia →
  system) was unpredictable.

Zoom is persisted per book and restored on reopen.

## Decision

Rework the reader overlay zoom controls:

1. **Zoom presets + dropdown.** Clicking the percentage opens a dropdown of the
   presets 50/75/100/125/150/175/200 plus a **Custom** entry. Custom opens an
   inline number input that accepts whole percentages only and rejects anything
   outside [50, 200] as invalid (the user corrects the value; it is not silently
   clamped).
2. **Zoom snapping.** The `−`/`+` buttons remain but jump to the nearest preset
   strictly below/above the current value (e.g. 120% → `+` 125%, `−` 100%). At
   the bounds (50% with `−`, 200% with `+`) the button is disabled.
3. **Zoom clamp.** The supported zoom range narrows to [50, 200] percent.
4. **Fit-to-width label.** The fit-to-width icon gains a `Fit` text label. When
   active, the toolbar shows 100%; pressing `+/−` still disables fit-to-width.
5. **Remove the theme button** from the overlay; Settings remains the single
   place to change theme.
6. **Restore exact zoom.** On reopen the toolbar shows the book's saved zoom
   even if it is not a preset (a Custom value is preserved, e.g. 130%).

These apply to both page and reflow modes, which share the same overlay zoom
control.

## Consequences

- Users can reach any round zoom level in one click and a custom one via the
  dropdown, at the cost of a slightly more complex control.
- The narrower clamp (max 200%) caps very-high-zoom workflows; a book previously
  read at >200% will be clamped on restore.
- Removing the theme button makes Settings the sole theme entry point, which
  matches the app's "settings owns preferences" structure.
- Disabled `+/−` buttons give explicit feedback at the zoom bounds instead of
  silently no-oping.