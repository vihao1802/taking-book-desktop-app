import { app, BrowserWindow, Menu, net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import started from 'electron-squirrel-startup';
import { config as loadEnv } from 'dotenv';
import { buildApplicationMenu } from './main/appMenu';
import { getDriver } from './main/db';
import { registerIpc } from './main/ipc';
import { guardAgainstNavigation } from './main/navigationGuard';
import { startBackgroundSync } from './main/syncScheduler';
import { toSystemLocaleArgument } from './shared/system-locale';

if (started) {
  app.quit();
}

// Load the gitignored `.env` (repo root in dev; bundled into resources/ by
// the Forge build for packaged apps) so the Google OAuth client id/secret
// resolve from a local, uncommitted file. Must run before any IPC handler
// reads those values.
loadEnv();
loadEnv({ path: path.join(process.resourcesPath, '.env'), override: false });

if (process.env.TB_DISABLE_GPU || process.platform === 'linux') {
  app.disableHardwareAcceleration();
}

// `appfile://` serves files to the renderer: PDFs the user opens (`doc/`)
// and pdf.js standard font data (`fonts/`). It must be registered as
// privileged before app ready so pdf.js can fetch() and range-read them.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'appfile',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

// Resolves pdfjs-dist wherever npm hoisted it (workspaces put it in the root
// node_modules, not alongside this app), then serves its standard_fonts dir.
const requireFromBundle = createRequire(__filename);

function standardFontsDir(): string {
  const packageJson = requireFromBundle.resolve('pdfjs-dist/package.json');
  return path.join(path.dirname(packageJson), 'standard_fonts');
}

function pdfjsWasmDir(): string {
  const packageJson = requireFromBundle.resolve('pdfjs-dist/package.json');
  return path.join(path.dirname(packageJson), 'wasm');
}

function registerFileProtocol(): void {
  protocol.handle('appfile', async (request) => {
    const url = new URL(request.url);
    const rawPath = decodeURIComponent(url.pathname);

    if (url.hostname === 'fonts') {
      const fontFile = path.join(standardFontsDir(), path.basename(rawPath));
      return net.fetch(pathToFileURL(fontFile).toString());
    }
    if (url.hostname === 'wasm') {
      const wasmFile = path.join(pdfjsWasmDir(), path.basename(rawPath));
      return net.fetch(pathToFileURL(wasmFile).toString());
    }
    if (url.hostname === 'doc') {
      return net.fetch(pathToFileURL(rawPath).toString());
    }
    return new Response('Not found', { status: 404 });
  });
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    // Packaged builds read the icon from resources/ (shipped by extraResource);
    // in dev it lives next to the source in build/.
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, '..', '..', 'build', 'icon.png'),
    backgroundColor: '#faf9f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Electron's default today, set explicitly because a dropped file must
      // never replace the app; the navigation guard below is the backstop.
      navigateOnDragDrop: false,
      additionalArguments: [toSystemLocaleArgument(app.getSystemLocale())],
    },
  });

  // Menu/F11 can toggle full screen too, so the renderer follows the window's
  // real state instead of tracking its own toggle clicks.
  const notifyFullScreen = (fullScreen: boolean): void => {
    mainWindow.webContents.send('window:fullscreen:changed', fullScreen);
  };
  mainWindow.on('enter-full-screen', () => notifyFullScreen(true));
  mainWindow.on('leave-full-screen', () => notifyFullScreen(false));

  guardAgainstNavigation(mainWindow.webContents);

  // Open DevTools in development to debug white screen
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

app.whenReady().then(async () => {
  registerFileProtocol();
  const db = await getDriver();
  registerIpc(db);
  Menu.setApplicationMenu(buildApplicationMenu());
  createWindow();
  // Pull cloud changes on launch and periodically while the app runs; safe to
  // run even with no account connected (it no-ops).
  startBackgroundSync(db, app.getPath('userData'));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
