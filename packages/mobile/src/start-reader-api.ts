import { getDeviceId } from '@taking-book/core';
import type { ReaderApi } from '@taking-book/renderer';
import { createFilesystemTextStore } from './filesystem-text-store';
import { createMobileReaderApi, createMobileServices } from './mobile-reader-api';
import { openDatabase } from './open-database';

/**
 * Opens the database and builds the reader API on top of it.
 *
 * @returns The reader API. Rejects, with a message fit to show, when the
 *   database cannot be opened.
 */
export async function startReaderApi(): Promise<ReaderApi> {
  const db = await openDatabase();
  const deviceId = await getDeviceId(db, () => crypto.randomUUID());
  if (!deviceId.ok) throw new Error(deviceId.error);
  const services = createMobileServices(db, {
    deviceId: deviceId.data,
    generateUid: () => crypto.randomUUID(),
    systemLocale: navigator.language,
    coverStore: createFilesystemTextStore({ folder: 'covers', extension: 'jpg', label: 'cover', encoding: 'base64' }),
    reflowStore: createFilesystemTextStore({ folder: 'reflow', extension: 'json', label: 'reflow text', encoding: 'utf8' }),
    log: (message) => console.error(message),
  });
  return createMobileReaderApi(services);
}
