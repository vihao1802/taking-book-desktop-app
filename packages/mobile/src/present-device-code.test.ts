import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/browser', () => ({ Browser: {} }));
vi.mock('@capacitor/clipboard', () => ({ Clipboard: {} }));

import { presentDeviceCode, type DeviceCodeActions } from './present-device-code';

const PROMPT = { userCode: 'ABCD-EFGH', verificationUrl: 'https://www.google.com/device', expiresAt: 0 };

function createActions(overrides: Partial<DeviceCodeActions> = {}): DeviceCodeActions {
  return { copyText: vi.fn(async () => undefined), openUrl: vi.fn(async () => undefined), log: vi.fn(), ...overrides };
}

describe('presentDeviceCode', () => {
  it('copies the code and opens the verification page', async () => {
    const actions = createActions();

    await presentDeviceCode(PROMPT, actions);

    expect(actions.copyText).toHaveBeenCalledWith('ABCD-EFGH');
    expect(actions.openUrl).toHaveBeenCalledWith('https://www.google.com/device');
  });

  it('still opens the page when copying fails, and logs the failure', async () => {
    const actions = createActions({ copyText: vi.fn(async () => Promise.reject(new Error('denied'))) });

    await presentDeviceCode(PROMPT, actions);

    expect(actions.openUrl).toHaveBeenCalled();
    expect(actions.log).toHaveBeenCalledWith(expect.stringContaining('copy'));
  });

  it('still reports success when the page cannot be opened', async () => {
    const actions = createActions({ openUrl: vi.fn(async () => Promise.reject(new Error('no browser'))) });

    await presentDeviceCode(PROMPT, actions);

    expect(actions.copyText).toHaveBeenCalled();
    expect(actions.log).toHaveBeenCalledWith(expect.stringContaining('open'));
  });
});
