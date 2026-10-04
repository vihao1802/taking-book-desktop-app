# UI check

Drive the real desktop app the way a reader would, and observe the result through DOM state and screenshots. The app runs from a throwaway profile under `/tmp/tb-ui-check` with a generated fixture PDF, so the user's library, Notes and cloud sync stay untouched: create Highlights, Notes and Settings freely there.

The window opens pinned at the top-left of the primary display and off the taskbar, so it always appears in the same place. It cannot run hidden: a hidden window stops painting on this machine and every screenshot hangs. Do not try to hide it or move it off-screen.

## Steps

1. **Plan the checks.** Turn every acceptance criterion of the ticket (or every behaviour the diff changes) into an observable check: an action, then the DOM state or screenshot that proves it. Include both reader modes (page and reflow) and all three Themes when the change is visual, and all three Window size classes (compact, medium, expanded) when the change is layout (see "Window size classes" below). Done when each criterion maps to at least one check.
2. **Start** from the repo root: `node scripts/ui-check/start.mjs`. It returns once the app has rendered. The library is empty; clicking **Add PDF** adds the fixture (the native dialog is stubbed) and opens it in page mode.
3. **Run each check** with `node scripts/ui-check/cdp.mjs` (commands below). Act with real input (`click`, `dbl`, `drag`, `key`) so the app's own event handlers run; use `eval` to read state and to reach controls by label. Read every screenshot you take. Done when every planned check has passed or has a recorded failure.
4. **Stop** with `node scripts/ui-check/stop.mjs`, even after a failure. It ends the whole process group and deletes the profile.
5. **Report** a table of check → result per mode/Theme, plus anything not checked and why.

## cdp.mjs commands

| Command | Does |
|---|---|
| `eval '<js>'` | Runs JS in the window, prints the JSON result |
| `main '<js>'` | Runs JS in the Electron main process (`process.mainModule.require('electron')`) |
| `shot <file.png>` | Screenshots the window; save under `/tmp/tb-ui-check/` |
| `center '<css>'` | Prints `x,y` of an element's center, for `click` |
| `word '<text>'` | Prints `x,y` of the first on-screen occurrence of some text, for `dbl`/`drag` |
| `click x,y` / `dbl x,y` | Real mouse click / double-click (double-click selects a word) |
| `drag x1,y1 x2,y2` | Press, move, release: selects a range |
| `drop x,y <path…>` | Drops files or folders from the OS at a point, as a file manager would (enter, over, drop); relative paths resolve from the working directory |
| `hover-files x,y[;x,y…] <path…>` | Drags files from the OS over the window through each point in turn, without dropping; the drag stays in progress so `shot` can catch what shows mid-drag |
| `drag-out` | Moves a `hover-files` drag back out of the window, as a reader changing their mind would; nothing is dropped |
| `key <Key>` | Presses `Escape`, `Enter`, `ArrowDown`, a letter, …; `Shift+ArrowRight` adds modifiers (`Shift`, `Control`, `Alt`, `Meta`) |

Example: `node scripts/ui-check/cdp.mjs click $(node scripts/ui-check/cdp.mjs center '[aria-label=Highlight]')`

## Window size classes

The Window size class follows the real window width, live, so the three classes are checked by resizing the window with `main` and `BrowserWindow.getAllWindows()[0].setContentSize(w, h)`, then reading `innerWidth` and the layout through `eval` and taking a `shot`. Use one width inside each class, and the boundaries when a change touches the classification:

| Class | Content width (dp) | Navigation |
|---|---|---|
| compact | under 600 (try 450, and 599) | bottom bar |
| medium | 600 to 839 (try 700, 600 and 839) | rail |
| expanded | 840 and up (try 1000, and 840) | rail |

In the Reader, per class: the Notes sidebar pushes the page at expanded (the `[data-reader-view]` area narrows by the sidebar) and is a bottom sheet with a scrim at compact and medium (`aside[aria-label=Notes]` spans the width, the page does not narrow); the Reader sidebar is at most 85% of the width at compact (try a 280 wide window: 238); a Page mode canvas stops near 900 wide at expanded; resizing keeps the page (compare `scrollTop / scrollHeight` before and after); a click in the middle of the page toggles the overlay (`.overlay-top` opacity), a click at the edge does not, and the click that clears a selection (double-click a word, then click) does not.

In the Library, add the fixture, then per class: the "…" (`[aria-label^="Details for"]`) opens Book details in a pane beside the list at expanded in the List view (`aside section[aria-label="Book details"]`), and as a bottom sheet (`[data-slot=sheet-content]`) in the Grid view at expanded and in both views at compact and medium. Exercise Favorite, status, adding and removing a tag, Rename, Open and Remove from the details; tapping the Book itself opens it at every size. `key Enter` does not submit a form, so submit with `form.requestSubmit()` or click the button. Quiz hidden when the `quiz` capability is off is covered by the BookDetails unit test.

Dialogs, selects and popovers: at compact they are bottom sheets (the panel spans the width and ends at the bottom of the window) and from medium up a dialog is centred and a select or popover is anchored; open the Remove dialog from Book details, a status select and the reader's Focus controls at 450 and 700. At compact every interactive element is at least 48 by 48: run `node scripts/ui-check/cdp.mjs eval "$(cat scripts/ui-check/touch-targets.js)"` in each view, in the reader with the overlay showing, and with a sheet or select open; it prints the elements that are too small (an empty list passes). The desktop shortcuts still work at expanded (Control+f, Control+g, n for the Notes sidebar).

Also scan the reader's on-demand surfaces at compact (Find with Control+f, Go to page, the Selection toolbar after a double-click on a word with the overlay hidden, the Translation popup, the Reflow reader, the Quiz dialog), and check that each one stays inside the window: the scan only measures size, so read each screenshot for a bar running off an edge.

Check that the destinations are the same in each class, and that an open Book stays open, at the same position, across the resizes. Restore the size afterwards.

## Gotchas

- Reach controls through accessible names (`[aria-label=…]`) and visible text; they are stable across layout changes, pixel coordinates are not. Take coordinates from `center` for controls and `word` for book text, right before using them: pages keep laying out as they scroll into view, so positions read off a screenshot go stale, and page mode's text layer does not cover every line you can see.
- Switch reader mode with the `Toggle reflow` button, then wait a few seconds for the reflow text.
- Switch Theme through the app's Settings, since the profile is throwaway; setting `data-theme` on `<html>` also works for a quick visual pass.
- Escape at the top layer closes the reader: count presses so a check does not leave the book. In a script that repeats a check, press Escape only when a popup or toolbar is actually open.
- Network failures: the main process looks up the global `fetch` on every call, so `main` can swap it for a stub that rejects, returns a status, or never resolves (keep the original on `globalThis` to restore it). This leaves the machine's network alone.
- Window edges: shrink the viewport with `main` and `BrowserWindow.getAllWindows()[0].setContentSize(w, h)` to put a selection near the bottom or right edge; restore the size afterwards.
- `shot` hangs: the window stopped painting. Docked DevTools does this, which is why `start.mjs` closes it; if it happens anyway, restart with `stop.mjs` and `start.mjs`.
- Drags: end a `hover-files` drag with `drag-out` or `drop` before the next one. CDP's `dragCancel` never fires `dragleave`, so the page would still believe files are over it.
- Stop the app only with `stop.mjs`. A `pkill -f` on its flags also matches the shell running it.
- Startup failures: read `/tmp/tb-ui-check/app.log`. `A UI check app is already running` means a previous run was not stopped; run `stop.mjs`.
