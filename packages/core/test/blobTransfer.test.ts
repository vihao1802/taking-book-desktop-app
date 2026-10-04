import { describe, expect, it } from 'vitest';
import {
  MAX_DOWNLOAD_BYTES,
  MIN_FREE_STORAGE_BYTES,
  decidePdfDownload,
  type DeviceConditions,
} from '../src/sync/blobTransfer';

const GOOD: DeviceConditions = { onWifi: true, allowMobileData: false, freeBytes: MIN_FREE_STORAGE_BYTES * 4 };
const SMALL = 5 * 1024 * 1024;

function skipReason(sizeBytes: number, conditions: DeviceConditions): string | null {
  const decision = decidePdfDownload(sizeBytes, conditions);
  return decision.download ? null : decision.reason;
}

describe('decidePdfDownload', () => {
  it('downloads a small PDF on Wi-Fi with plenty of storage', () => {
    expect(decidePdfDownload(SMALL, GOOD)).toEqual({ download: true });
  });

  it('skips on mobile data unless the setting is on', () => {
    expect(skipReason(SMALL, { ...GOOD, onWifi: false })).toBe('network');
    expect(decidePdfDownload(SMALL, { ...GOOD, onWifi: false, allowMobileData: true })).toEqual({ download: true });
  });

  it('skips when free storage is under 500 MB and says why', () => {
    const decision = decidePdfDownload(SMALL, { ...GOOD, freeBytes: MIN_FREE_STORAGE_BYTES - 1 });

    expect(decision).toMatchObject({ download: false, reason: 'storage' });
    expect(decision.download ? '' : decision.message).toContain('500 MB');
  });

  it('downloads at exactly 500 MB free', () => {
    expect(decidePdfDownload(SMALL, { ...GOOD, freeBytes: MIN_FREE_STORAGE_BYTES })).toEqual({ download: true });
  });

  it('downloads when the free storage cannot be read', () => {
    expect(decidePdfDownload(SMALL, { ...GOOD, freeBytes: null })).toEqual({ download: true });
  });

  it('skips a PDF over the size limit and points to desktop, even on Wi-Fi with the setting on', () => {
    const decision = decidePdfDownload(MAX_DOWNLOAD_BYTES + 1, { ...GOOD, allowMobileData: true });

    expect(decision).toMatchObject({ download: false, reason: 'size' });
    expect(decision.download ? '' : decision.message).toContain('desktop');
    expect(decidePdfDownload(MAX_DOWNLOAD_BYTES, GOOD)).toEqual({ download: true });
  });

  it('reports size before storage and storage before network', () => {
    const bad: DeviceConditions = { onWifi: false, allowMobileData: false, freeBytes: 0 };

    expect(skipReason(MAX_DOWNLOAD_BYTES + 1, bad)).toBe('size');
    expect(skipReason(SMALL, bad)).toBe('storage');
  });
});
