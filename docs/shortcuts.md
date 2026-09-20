# Keyboard shortcuts

Shortcuts in the desktop app's reader. **Primary** means **Cmd** on macOS and
**Ctrl** on Windows and Linux. The key rules live in
`packages/core/src/readerShortcuts.ts` (`resolveReaderShortcut`) and are unit
tested for both platforms. Add new shortcuts there, not in a component's
`keydown` listener.

## Reader

| Keys | Action | Notes |
| --- | --- | --- |
| Primary+F | Open find bar | Works while typing; re-selects the query if already open |
| Enter / Shift+Enter | Next / previous match | Inside the find bar |
| F3 / Shift+F3, Primary+G / Primary+Shift+G | Next / previous match | Opens the find bar if it is closed |
| Primary+Alt+G | Go to page | Same shortcut as pdf.js's viewer. Primary+G is "find next" instead. |
| Primary+`=` / Primary+`-` / Primary+`0` | Zoom in / zoom out / fit width | Reflow mode resets to 100% instead of fit width |
| Home / End | First / last page | Reflow mode scrolls to the top or bottom |
| PageDown / PageUp, Space / Shift+Space | Next / previous page (screen in reflow) | |
| Arrow Right / Left | Next / previous page | Page mode only |
| Arrow Down / Up | Scroll a line | Reflow mode only |
| T | Toggle thumbnails sidebar | Page mode only |
| O | Toggle outline sidebar | |
| N | Toggle Notes sidebar | Works in both page and reflow mode |
| R | Toggle reflow mode | Disabled for image-only documents |
| Esc | Close the top layer | Order: selection toolbar, note draft or edit card, find bar, go-to bar, Notes sidebar, Reader sidebar, then leave the reader |
| F11 (Ctrl+Cmd+F on macOS) | Fullscreen | From the application menu |

Single-letter keys, arrows, Home/End and Space are ignored while focus is in a
text field. Escape and the Primary shortcuts still work there.

## Library

| Keys | Action |
| --- | --- |
| `/` or Primary+K | Focus the search box |

## Design notes

- Zoom uses Primary+`=`/`-`/`0` because the app menu
  (`packages/desktop/src/main/appMenu.ts`) deliberately has no zoom or reload
  roles. Electron's default menu would zoom the whole window instead of the
  reader.
- Tooltips show each shortcut in the platform's notation (`⌘F` vs `Ctrl+F`)
  through `formatShortcutLabel`.
