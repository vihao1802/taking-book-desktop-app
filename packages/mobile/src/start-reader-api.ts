import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { err, getDeviceId, ok, type Result, type SqlDriver } from '@taking-book/core';
import type { ReaderApi } from '@taking-book/renderer';
import { createAppUpdates, fetchLatestRelease } from './app-updates';
import { createBookFiles } from './book-files';
import { createBookSyncStorage } from './book-sync-storage';
import { bookPathFor, checkBookReadable, isBookOnDevice, createCapacitorBookStorage, createDocumentUrlResolver } from './capacitor-book-storage';
import { createAutoSync, type AutoSyncEvents } from './auto-sync';
import { createCloudSync, type CloudSync } from './cloud-sync';
import { createDriveProvider } from './create-drive-provider';
import { createFilesystemTextStore } from './filesystem-text-store';
import { createMobileReaderApi, createMobileServices, type MobileServices } from './mobile-reader-api';
import { createMobileTransferPolicy } from './mobile-transfer-policy';
import { openDatabase } from './open-database';
import { pickPdfs } from './pick-pdfs';
import { getFreeStorageBytes, isOnWifi } from './transfer-conditions';
import { watchAppActive } from './watch-app-active';
import { capacitorDeviceCodeActions, presentDeviceCode } from './present-device-code';
import { createShareSource } from './share-intent';

async function openStream(webPath: string): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(webPath);
  if (!response.ok || !response.body) throw new Error(`The file could not be read (status ${response.status})`);
  return response.body;
}

async function readAppVersion(): Promise<string> {
  return (await App.getInfo()).version;
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

function buildCloudSync(db: SqlDriver, services: MobileServices, generateId: () => string, log: (message: string) => void): CloudSync & AutoSyncEvents {
  const { settings, library } = services;
  const clientConfig = { clientId: import.meta.env.VITE_TB_GDRIVE_CLIENT_ID, clientSecret: import.meta.env.VITE_TB_GDRIVE_CLIENT_SECRET };
  const cloud = createCloudSync({
    db,
    provider: createDriveProvider(clientConfig, generateId),
    localStorage: createBookSyncStorage(),
    resolveLocalPath: bookPathFor,
    listBooks: () => library.listBooks(),
    isBookOnDevice,
    blobTransfer: createMobileTransferPolicy({
      isOnWifi,
      getFreeBytes: getFreeStorageBytes,
      getAllowMobileData: async () => {
        const allowed = await settings.getDownloadOverMobileData();
        return allowed.ok && allowed.data;
      },
    }),
    presentDeviceCode: (prompt) => presentDeviceCode(prompt, capacitorDeviceCodeActions),
    log,
  });
  const autoSync = createAutoSync({ cloud, watchAppActive, setTimer: setInterval, clearTimer: (handle) => clearInterval(handle as number), log });
  autoSync.start();
  return { ...cloud, onSyncComplete: autoSync.onSyncComplete };
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
    shares: createShareSource(),
    storage: createCapacitorBookStorage(),
    openStream,
    generateId,
    checkReadable: checkBookReadable,
    getDocumentUrl: documentUrl.data,
    log,
  });
  const updates = createAppUpdates({
    getAppVersion: readAppVersion,
    fetchLatestRelease,
    openUrl: openInBrowser,
    log,
  });
  return ok(createMobileReaderApi(services, bookFiles, updates, buildCloudSync(db.data, services, generateId, log)));
}
