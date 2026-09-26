// The renderer's Intl follows Chromium's UI language, not the OS regional
// format (a UK date format on an English-US UI would be ignored). Main knows the
// OS one, and hands it to the preload as a process argument so it is there
// synchronously at first paint, without an IPC round-trip.
const PREFIX = '--tb-system-locale=';

/** The process argument main adds to the window for the OS regional-format locale. */
export function toSystemLocaleArgument(locale: string): string {
  return `${PREFIX}${locale}`;
}

/**
 * Reads the OS regional-format locale main passed to this renderer process.
 *
 * @param argv the renderer process's arguments
 * @returns the locale, e.g. `en-GB`, or null when none was passed
 */
export function readSystemLocaleArgument(argv: readonly string[]): string | null {
  const argument = argv.find((arg) => arg.startsWith(PREFIX));
  const locale = argument?.slice(PREFIX.length) ?? '';
  return locale === '' ? null : locale;
}
