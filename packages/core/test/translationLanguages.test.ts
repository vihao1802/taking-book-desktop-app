import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_LANGUAGES,
  getLanguageName,
  isSupportedLanguage,
  resolveTargetLanguage,
} from '../src';

describe('SUPPORTED_LANGUAGES', () => {
  it('lists every code once', () => {
    const codes = SUPPORTED_LANGUAGES.map((language) => language.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('only lists codes the validator accepts', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(isSupportedLanguage(language.code)).toBe(true);
    }
  });

  it('keeps Simplified and Traditional Chinese as separate entries', () => {
    expect(getLanguageName('zh-CN')).toBe('Chinese (Simplified)');
    expect(getLanguageName('zh-TW')).toBe('Chinese (Traditional)');
  });
});

describe('isSupportedLanguage', () => {
  it('rejects codes that are not in the list', () => {
    expect(isSupportedLanguage('xx')).toBe(false);
    expect(isSupportedLanguage('')).toBe(false);
    expect(isSupportedLanguage('zh')).toBe(false);
  });
});

describe('getLanguageName', () => {
  it('returns the English display name of a supported code', () => {
    expect(getLanguageName('vi')).toBe('Vietnamese');
    expect(getLanguageName('en')).toBe('English');
  });

  it('returns null for an unsupported code', () => {
    expect(getLanguageName('xx')).toBeNull();
  });
});

describe('resolveTargetLanguage', () => {
  it('uses a supported stored value over the system locale', () => {
    expect(resolveTargetLanguage('fr', 'de-DE')).toBe('fr');
  });

  it('ignores an unsupported stored value', () => {
    expect(resolveTargetLanguage('xx', 'de-DE')).toBe('de');
  });

  it('matches the system locale exactly', () => {
    expect(resolveTargetLanguage(null, 'zh-TW')).toBe('zh-TW');
    expect(resolveTargetLanguage(null, 'vi')).toBe('vi');
  });

  it('matches the system locale regardless of case or separator', () => {
    expect(resolveTargetLanguage(null, 'zh_tw')).toBe('zh-TW');
  });

  it('falls back to the base language of the system locale', () => {
    expect(resolveTargetLanguage(null, 'pt-BR')).toBe('pt');
    expect(resolveTargetLanguage(null, 'en-US')).toBe('en');
  });

  it('defaults Traditional-script Chinese locales to Traditional Chinese', () => {
    expect(resolveTargetLanguage(null, 'zh-HK')).toBe('zh-TW');
    expect(resolveTargetLanguage(null, 'zh-MO')).toBe('zh-TW');
    expect(resolveTargetLanguage(null, 'zh-Hant')).toBe('zh-TW');
    expect(resolveTargetLanguage(null, 'zh-Hant-HK')).toBe('zh-TW');
  });

  it('defaults other Chinese locales to Simplified Chinese', () => {
    expect(resolveTargetLanguage(null, 'zh')).toBe('zh-CN');
    expect(resolveTargetLanguage(null, 'zh-SG')).toBe('zh-CN');
    expect(resolveTargetLanguage(null, 'zh-Hans-CN')).toBe('zh-CN');
  });

  it('maps system language codes that differ from the service codes', () => {
    expect(resolveTargetLanguage(null, 'nb-NO')).toBe('no');
    expect(resolveTargetLanguage(null, 'nn')).toBe('no');
    expect(resolveTargetLanguage(null, 'fil-PH')).toBe('tl');
    expect(resolveTargetLanguage(null, 'iw-IL')).toBe('he');
  });

  it('falls back to English when the system locale is not supported', () => {
    expect(resolveTargetLanguage(null, 'tlh-QO')).toBe('en');
    expect(resolveTargetLanguage(null, '')).toBe('en');
  });
});
