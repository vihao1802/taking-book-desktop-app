import { decidePdfDownload, type BlobTransferPolicy } from '@taking-book/core';

/** Where the policy reads the device's state at the moment of each download. */
export interface TransferConditionSource {
  isOnWifi(): Promise<boolean>;
  getFreeBytes(): Promise<number | null>;
  /** The device-local "Download PDFs over mobile data" setting; a failed read counts as off. */
  getAllowMobileData(): Promise<boolean>;
}

/**
 * The phone's PDF transfer policy (ADR-0010): download on Wi-Fi, or on mobile
 * data only when the reader allows it; stop under 500 MB free; never download
 * a PDF over the size limit. The phone only downloads, it does not upload PDFs.
 * The state is read again for every PDF, so a long sync notices Wi-Fi going
 * away or the storage filling up part-way through.
 *
 * @param source The device's connection, storage and setting.
 * @returns The policy for `syncLibrary`.
 */
export function createMobileTransferPolicy(source: TransferConditionSource): BlobTransferPolicy {
  return {
    uploadBooks: false,
    decideDownload: async ({ sizeBytes }) => {
      const [onWifi, freeBytes, allowMobileData] = await Promise.all([source.isOnWifi(), source.getFreeBytes(), source.getAllowMobileData()]);
      return decidePdfDownload(sizeBytes, { onWifi, freeBytes, allowMobileData });
    },
  };
}
