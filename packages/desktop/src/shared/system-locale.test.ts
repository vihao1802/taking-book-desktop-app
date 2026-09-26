import { describe, expect, it } from 'vitest';
import { readSystemLocaleArgument, toSystemLocaleArgument } from './system-locale';

describe('system locale argument', () => {
  it('round-trips the locale from main to the preload', () => {
    const argv = ['/usr/bin/electron', '--type=renderer', toSystemLocaleArgument('en-GB')];
    expect(readSystemLocaleArgument(argv)).toBe('en-GB');
  });

  it('is null when main passed none', () => {
    expect(readSystemLocaleArgument(['/usr/bin/electron', '--type=renderer'])).toBeNull();
  });

  it('is null when main passed an empty locale', () => {
    expect(readSystemLocaleArgument([toSystemLocaleArgument('')])).toBeNull();
  });
});
