import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DeviceCodeNotice } from './DeviceCodeNotice';

describe('DeviceCodeNotice', () => {
  it('shows the code and the address to enter it at', () => {
    const html = renderToStaticMarkup(
      <DeviceCodeNotice prompt={{ userCode: 'ABCD-EFGH', verificationUrl: 'https://www.google.com/device', expiresAt: 0 }} />,
    );

    expect(html).toContain('ABCD-EFGH');
    expect(html).toContain('https://www.google.com/device');
  });
});
