import { describe, expect, it } from 'vitest';
import { MAX_DOWNLOAD_BYTES, MIN_FREE_STORAGE_BYTES } from '@taking-book/core';
import { createMobileTransferPolicy, type TransferConditionSource } from './mobile-transfer-policy';

const MB = 1024 * 1024;
const REQUEST = { hash: 'abc', title: 'Dune', sizeBytes: 10 * MB };

function policyFor(conditions: Partial<{ wifi: boolean; free: number | null; mobileData: boolean }>) {
  const source: TransferConditionSource = {
    isOnWifi: async () => conditions.wifi ?? true,
    getFreeBytes: async () => (conditions.free === undefined ? MIN_FREE_STORAGE_BYTES * 4 : conditions.free),
    getAllowMobileData: async () => conditions.mobileData ?? false,
  };
  return createMobileTransferPolicy(source);
}

describe('createMobileTransferPolicy', () => {
  it('never uploads PDFs from the phone', () => {
    expect(policyFor({}).uploadBooks).toBe(false);
  });

  it('downloads on Wi-Fi', async () => {
    expect(await policyFor({}).decideDownload(REQUEST)).toEqual({ download: true });
  });

  it('refuses on mobile data until the device-local setting is on', async () => {
    expect(await policyFor({ wifi: false }).decideDownload(REQUEST)).toMatchObject({ download: false, reason: 'network' });
    expect(await policyFor({ wifi: false, mobileData: true }).decideDownload(REQUEST)).toEqual({ download: true });
  });

  it('stops under 500 MB of free storage with a message that says why', async () => {
    const decision = await policyFor({ free: MIN_FREE_STORAGE_BYTES - 1 }).decideDownload(REQUEST);

    expect(decision).toMatchObject({ download: false, reason: 'storage' });
  });

  it('skips a PDF over the size limit whatever the connection', async () => {
    const decision = await policyFor({ mobileData: true }).decideDownload({ ...REQUEST, sizeBytes: MAX_DOWNLOAD_BYTES + 1 });

    expect(decision).toMatchObject({ download: false, reason: 'size' });
  });
});
