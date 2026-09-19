import { app, Menu, type MenuItemConstructorOptions } from 'electron';

/**
 * Builds the application menu from Electron roles only, so each OS gets its
 * native labels and accelerators (F11 fullscreen on Windows/Linux,
 * Ctrl+Cmd+F on macOS) without us hand-writing per-platform key strings.
 *
 * Electron's default menu is deliberately not used: it binds Ctrl/Cmd +/-/0 to
 * Chromium page zoom, which would zoom the whole UI instead of the reader's
 * own zoom, and (in packaged builds) exposes reload and DevTools shortcuts.
 * The Edit menu stays because macOS routes Cmd+C/V/A through it.
 */
export function buildApplicationMenu(): Menu {
  const isMac = process.platform === 'darwin';
  const isDev = !app.isPackaged;

  const viewMenu: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      { role: 'togglefullscreen' },
      ...(isDev
        ? ([
            { type: 'separator' },
            { role: 'reload' },
            { role: 'toggleDevTools' },
          ] as MenuItemConstructorOptions[])
        : []),
    ],
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? ([{ role: 'appMenu' }] as MenuItemConstructorOptions[]) : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    viewMenu,
    { role: 'windowMenu' },
  ];

  return Menu.buildFromTemplate(template);
}
