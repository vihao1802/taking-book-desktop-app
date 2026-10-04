import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { err, getDeviceId, ok, type Result } from '@taking-book/core';
import type { ReaderApi } from '@taking-book/renderer';
import { createAppUpdates, fetchLatestRelease } from './app-updates';
import { createBookFiles } from './book-files';
import { checkBookReadable, createCapacitorBookStorage, createDocumentUrlResolver } from './capacitor-book-storage';
import { createFilesystemTextStore } from './filesystem-text-store';
import { createMobileReaderApi, createMobileServices } from './mobile-reader-api';
import { openDatabase } from './open-database';
import { pickPdfs } from './pick-pdfs';

async function openStream(webPath: string): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(webPath);
  if (!response.ok || !response.body) throw new Error(`The file could not be read (status ${response.status})`);
  return response.body;
}

async function openInBrowser(url: string): Promise<Result<void>> {
  try {
    await Browser.open({ url });
    return ok(undefined);
  } catch (error) {
    console.error(`update: could not open ${url}: ${String(error)}`);
    return err('Could not open the link in your browser.');
  }
}

/**
 * Opens the database and builds the reader API on top of it.
 *
 * @returns The reader API, or an error worded for the reader when the database
 *   cannot be opened.
 */
export async function startReaderApi(): Promise<Result<ReaderApi>> {
  const generateId = (): string => crypto.randomUUID();
  const db = await openDatabase();
  if (!db.ok) return err(db.error);
  const deviceId = await getDeviceId(db.data, generateId);
  if (!deviceId.ok) return err(deviceId.error);
  const documentUrl = await createDocumentUrlResolver();
  if (!documentUrl.ok) return err(documentUrl.error);
  const log = (message: string): void => console.error(message);
  const services = createMobileServices(db.data, {
    deviceId: deviceId.data,
    generateUid: generateId,
    systemLocale: navigator.language,
    coverStore: createFilesystemTextStore({ folder: 'covers', extension: 'jpg', label: 'cover', encoding: 'base64' }),
    reflowStore: createFilesystemTextStore({ folder: 'reflow', extension: 'json', label: 'reflow text', encoding: 'utf8' }),
    log,
  });
  const bookFiles = createBookFiles({
    library: services.library,
    pickPdfs,
    storage: createCapacitorBookStorage(),
    openStream,
    generateId,
    checkReadable: checkBookReadable,
    getDocumentUrl: documentUrl.data,
    log,
  });
  const updates = createAppUpdates({
    getAppVersion: async () => (await App.getInfo()).version,
    fetchLatestRelease,
    openUrl: openInBrowser,
    log,
  });
  return ok(createMobileReaderApi(services, bookFiles, updates));
}
