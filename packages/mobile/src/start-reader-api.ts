import { err, getDeviceId, ok, type Result } from '@taking-book/core';
import type { ReaderApi } from '@taking-book/renderer';
import { createFilesystemTextStore } from './filesystem-text-store';
import { createMobileReaderApi, createMobileServices } from './mobile-reader-api';
import { openDatabase } from './open-database';

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
  const services = createMobileServices(db.data, {
    deviceId: deviceId.data,
    generateUid: generateId,
    systemLocale: navigator.language,
    coverStore: createFilesystemTextStore({ folder: 'covers', extension: 'jpg', label: 'cover', encoding: 'base64' }),
    reflowStore: createFilesystemTextStore({ folder: 'reflow', extension: 'json', label: 'reflow text', encoding: 'utf8' }),
    log: (message) => console.error(message),
  });
  return ok(createMobileReaderApi(services));
}
