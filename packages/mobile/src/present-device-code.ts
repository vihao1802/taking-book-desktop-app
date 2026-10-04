import { Browser } from '@capacitor/browser';
import { Clipboard } from '@capacitor/clipboard';
import type { DeviceCodePrompt } from '@taking-book/core';

/** The two things done for the reader when a sign-in code appears. */
export interface DeviceCodeActions {
  copyText(text: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  log(message: string): void;
}

/** The real clipboard and browser. */
export const capacitorDeviceCodeActions: DeviceCodeActions = {
  copyText: (text) => Clipboard.write({ string: text }),
  openUrl: (url) => Browser.open({ url }),
  log: (message) => console.error(message),
};

/**
 * Copies the sign-in code and opens the verification page, so the reader only
 * has to paste and approve. Each step is attempted on its own: the code is
 * also shown on screen, so a failure of either only costs a little convenience.
 *
 * @param prompt The code and address from the device flow.
 * @param actions The clipboard, the browser and a logger.
 */
export async function presentDeviceCode(prompt: DeviceCodePrompt, actions: DeviceCodeActions): Promise<void> {
  try {
    await actions.copyText(prompt.userCode);
  } catch (error) {
    actions.log(`Could not copy the sign-in code: ${String(error)}`);
  }
  try {
    await actions.openUrl(prompt.verificationUrl);
  } catch (error) {
    actions.log(`Could not open ${prompt.verificationUrl}: ${String(error)}`);
  }
}
