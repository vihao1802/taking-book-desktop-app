/** A language a Translation can be shown in, as the translation service names it. */
export interface SupportedLanguage {
  /** The code the translation service accepts, e.g. `vi` or `zh-TW`. */
  code: string;
  /** English display name, e.g. `Vietnamese`. */
  name: string;
}

/** The Target language used when neither a stored choice nor the system locale gives one. */
export const DEFAULT_TARGET_LANGUAGE = 'en';

/**
 * Curated languages offered for translation. Codes are the ones the Google
 * Translate web endpoint accepts; regional variants that read differently
 * (Simplified vs Traditional Chinese) are separate entries. Order is the order
 * the Settings picker shows, and for a base language shared by several entries
 * the first one is what a bare system locale resolves to.
 */
export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  { code: 'af', name: 'Afrikaans' },
  { code: 'ar', name: 'Arabic' },
  { code: 'bn', name: 'Bengali' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'ca', name: 'Catalan' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'zh-TW', name: 'Chinese (Traditional)' },
  { code: 'hr', name: 'Croatian' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'en', name: 'English' },
  { code: 'et', name: 'Estonian' },
  { code: 'tl', name: 'Filipino' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'is', name: 'Icelandic' },
  { code: 'id', name: 'Indonesian' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'kn', name: 'Kannada' },
  { code: 'km', name: 'Khmer' },
  { code: 'ko', name: 'Korean' },
  { code: 'lo', name: 'Lao' },
  { code: 'lv', name: 'Latvian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'ms', name: 'Malay' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'mr', name: 'Marathi' },
  { code: 'my', name: 'Myanmar (Burmese)' },
  { code: 'ne', name: 'Nepali' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fa', name: 'Persian' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'es', name: 'Spanish' },
  { code: 'sw', name: 'Swahili' },
  { code: 'sv', name: 'Swedish' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ur', name: 'Urdu' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'cy', name: 'Welsh' },
];

/** Whether the code is one of {@link SUPPORTED_LANGUAGES}, compared exactly. */
export function isSupportedLanguage(code: string): boolean {
  return SUPPORTED_LANGUAGES.some((language) => language.code === code);
}

/**
 * Looks up the English display name of a supported language.
 *
 * @returns The name, or null when the code is not supported.
 */
export function getLanguageName(code: string): string | null {
  return SUPPORTED_LANGUAGES.find((language) => language.code === code)?.name ?? null;
}

/**
 * Resolves the Target language in effect.
 *
 * @param stored The reader's saved choice, or null when they never chose one.
 * @param systemLocale The OS locale, e.g. `pt-BR` or `zh_TW`.
 * @returns The stored choice when supported; otherwise the supported language
 *   matching the whole locale, then its base language, then English.
 */
export function resolveTargetLanguage(stored: string | null, systemLocale: string): string {
  if (stored !== null && isSupportedLanguage(stored)) return stored;
  return matchLocale(systemLocale) ?? DEFAULT_TARGET_LANGUAGE;
}

function matchLocale(locale: string): string | null {
  const wanted = locale.trim().replace(/_/g, '-').toLowerCase();
  if (wanted === '') return null;
  const exact = SUPPORTED_LANGUAGES.find((language) => language.code.toLowerCase() === wanted);
  if (exact) return exact.code;
  const base = baseLanguage(wanted);
  const sameBase = SUPPORTED_LANGUAGES.find((language) => baseLanguage(language.code) === base);
  return sameBase?.code ?? null;
}

function baseLanguage(code: string): string {
  return code.toLowerCase().split('-')[0];
}
