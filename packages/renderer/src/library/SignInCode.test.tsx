import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SignInCode } from './SignInCode';

describe('SignInCode', () => {
  it('shows the code to enter and the address to open it at', () => {
    const html = renderToStaticMarkup(
      <SignInCode prompt={{ userCode: 'ABCD-EFGH', verificationUrl: 'https://www.google.com/device', expiresAt: 0 }} />,
    );

    expect(html).toContain('ABCD-EFGH');
    expect(html).toContain('https://www.google.com/device');
  });
});
