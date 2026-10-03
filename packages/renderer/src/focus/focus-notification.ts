const TITLE = 'Focus timer';
export const FOCUS_ENDED_MESSAGE = 'Your Focus timer has run out.';

/**
 * Sends an OS notification that the Focus timer ran out, but only when the
 * window isn't focused: a reader looking at the app already sees the in-app
 * notice. Failures (no notification service, permission denied) are logged,
 * never thrown.
 */
export function notifyFocusEndedIfUnfocused(): void {
  if (document.hasFocus()) return;
  try {
    const notification = new Notification(TITLE, { body: FOCUS_ENDED_MESSAGE, silent: true });
    notification.onerror = () => console.error('[focus] The OS notification for the Focus timer failed');
  } catch (error) {
    console.error('[focus] Could not send the OS notification for the Focus timer', error);
  }
}
