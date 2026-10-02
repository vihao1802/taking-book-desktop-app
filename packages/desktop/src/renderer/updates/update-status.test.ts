import { describe, expect, it } from 'vitest';
import { describeUpdateStatus } from './update-status';

describe('describeUpdateStatus', () => {
  it('says nothing before the first check', () => {
    expect(describeUpdateStatus({ kind: 'idle' })).toBeNull();
  });

  it('names the newer version when one is available', () => {
    const update = { version: '1.4.0', asset: { name: 'a.deb', downloadUrl: 'https://example.test/a.deb' }, pageUrl: 'https://example.test/tag' };
    expect(describeUpdateStatus({ kind: 'available', update })).toBe('Taking Book 1.4.0 is available.');
  });

  it('says it is downloading', () => {
    const update = { version: '1.4.0', asset: { name: 'a.deb', downloadUrl: 'https://example.test/a.deb' }, pageUrl: 'https://example.test/tag' };
    expect(describeUpdateStatus({ kind: 'downloading', update })).toBe('Downloading the update…');
  });

  it('tells the reader when they are up to date, checking, or offline', () => {
    expect(describeUpdateStatus({ kind: 'up-to-date' })).toBe('You have the latest version.');
    expect(describeUpdateStatus({ kind: 'checking' })).toBe('Checking for updates…');
    expect(describeUpdateStatus({ kind: 'failed' })).toMatch(/internet connection/);
  });
});
