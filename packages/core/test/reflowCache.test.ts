import { describe, expect, it } from 'vitest';
import {
  REFLOW_CACHE_VERSION,
  isErr,
  isOk,
  parseReflowCache,
  serializeReflowCache,
  type ReflowCacheEntry,
} from '../src';

const entry: ReflowCacheEntry = {
  pageTexts: ['Chapter one', 'It was a dark night.'],
  paragraphs: [
    {
      text: 'Chapter one',
      fontSize: 20,
      indent: false,
      pageIndex: 0,
      y: -700,
      runs: [{ text: 'Chapter one', bold: true, italic: false }],
      align: 'center',
    },
    {
      text: 'It was a dark night.',
      fontSize: 20,
      indent: true,
      pageIndex: 1,
      y: -650,
      runs: [{ text: 'It was a dark night.', bold: false, italic: false }],
    },
  ],
};

describe('reflow cache', () => {
  it('round-trips an extraction result', () => {
    const parsed = parseReflowCache(serializeReflowCache(entry));
    expect(parsed).toEqual({ ok: true, data: entry });
  });

  it('treats an entry from another cache version as a miss', () => {
    const stale = JSON.stringify({ ...entry, version: REFLOW_CACHE_VERSION + 1 });
    const parsed = parseReflowCache(stale);
    expect(isOk(parsed) && parsed.data).toBeNull();
  });

  it('reports corrupt JSON as an error', () => {
    expect(isErr(parseReflowCache('{"version": 1, "paragr'))).toBe(true);
  });

  it('reports a wrong shape as an error', () => {
    expect(isErr(parseReflowCache(JSON.stringify({ version: REFLOW_CACHE_VERSION })))).toBe(true);
    expect(isErr(parseReflowCache('null'))).toBe(true);
  });
});
