import { app, BrowserWindow, net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import started from 'electron-squirrel-startup';
import { getDriver } from './main/db';
import { registerIpc } from './main/ipc';

if (started) {
  app.quit();
}

if (process.env.TB_DISABLE_GPU) {
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

function registerFileProtocol(): void {
  protocol.handle('appfile', (request) => {
    const url = new URL(request.url);
    const rawPath = decodeURIComponent(url.pathname);

    if (url.hostname === 'fonts') {
      const name = path.basename(rawPath);
      return net.fetch(pathToFileURL(path.join(standardFontsDir(), name)).toString());
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
    backgroundColor: '#faf9f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

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
  createWindow();
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
