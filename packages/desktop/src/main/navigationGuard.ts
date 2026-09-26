/** The slice of `WebContents` the guard listens on, so tests can pass a plain emitter. */
export interface NavigationSource {
  on(
    event: 'will-navigate',
    listener: (event: { preventDefault: () => void }, url: string) => void,
  ): unknown;
}

export interface NavigationGuardOptions {
  logWarning: (message: string) => void;
}

/**
 * Keeps the app window on the app. The renderer is a single page that
 * switches views in React and never navigates the window itself, so any
 * navigation is foreign, such as a dropped file opening in place of the app
 * as a bare PDF viewer or a folder listing. Reloads do not emit
 * `will-navigate`, so dev reloads still work.
 */
export function guardAgainstNavigation(
  contents: NavigationSource,
  options: NavigationGuardOptions = { logWarning: console.warn },
): void {
  contents.on('will-navigate', (event, url) => {
    event.preventDefault();
    options.logWarning(`Blocked the app window from navigating to ${url}`);
  });
}
