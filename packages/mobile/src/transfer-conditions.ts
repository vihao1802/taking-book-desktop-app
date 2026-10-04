import { Network } from '@capacitor/network';
import { registerPlugin } from '@capacitor/core';

/** What the sync's transfer policy asks the device (see `MobileTransferSource`). */
interface StoragePlugin {
  getFreeBytes(): Promise<{ freeBytes: number }>;
}

const Storage = registerPlugin<StoragePlugin>('Storage');

/** Whether the phone is on Wi-Fi right now; an unknown connection counts as not Wi-Fi. */
export async function isOnWifi(): Promise<boolean> {
  const status = await Network.getStatus();
  return status.connected && status.connectionType === 'wifi';
}

/**
 * The free space where Books are stored.
 *
 * @returns Bytes free, or null when the platform could not say.
 */
export async function getFreeStorageBytes(): Promise<number | null> {
  try {
    return (await Storage.getFreeBytes()).freeBytes;
  } catch (error) {
    console.error(`Could not read the free storage: ${String(error)}`);
    return null;
  }
}
