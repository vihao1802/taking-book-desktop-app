import { describe, expect, it } from 'vitest';
import { deriveAndroidVersion } from '../scripts/derive-android-version.mjs';

describe('deriveAndroidVersion', () => {
  it('computes versionCode as major*10000 + minor*100 + patch', () => {
    expect(deriveAndroidVersion('v1.4.2')).toEqual({ versionName: '1.4.2', versionCode: 10402 });
    expect(deriveAndroidVersion('v0.0.1').versionCode).toBe(1);
    expect(deriveAndroidVersion('v12.34.56').versionCode).toBe(123456);
  });

  it('rejects tags that are not v<major>.<minor>.<patch>', () => {
    expect(() => deriveAndroidVersion('1.4.2')).toThrow();
    expect(() => deriveAndroidVersion('v1.4')).toThrow();
    expect(() => deriveAndroidVersion('v1.4.2-beta')).toThrow();
  });

  it('rejects minor or patch above 99, which would collide in versionCode', () => {
    expect(() => deriveAndroidVersion('v1.100.0')).toThrow();
    expect(() => deriveAndroidVersion('v1.0.100')).toThrow();
  });
});
