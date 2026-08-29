import { describe, expect, it } from 'vitest';
import { renderOAuthResultPage } from './oauthLandingPage';

describe('renderOAuthResultPage', () => {
  it('renders a success page with a heading, subtitle and auto-close', () => {
    const html = renderOAuthResultPage({ state: 'success' });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Connected to Google Drive');
    expect(html).toContain('You can close this tab and return to Taking Book.');
    expect(html).toContain('setTimeout');
  });

  it('renders an error page with the failure message and no auto-close', () => {
    const html = renderOAuthResultPage({ state: 'error', message: 'OAuth state mismatch; try again.' });
    expect(html).toContain('Connection failed');
    expect(html).toContain('OAuth state mismatch; try again.');
    expect(html).not.toContain('setTimeout');
  });

  it('escapes HTML in the error message', () => {
    const html = renderOAuthResultPage({ state: 'error', message: '<script>alert("xss")</script>' });
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('always includes a close button', () => {
    const success = renderOAuthResultPage({ state: 'success' });
    const error = renderOAuthResultPage({ state: 'error', message: 'boom' });
    expect(success).toContain('Close this tab');
    expect(error).toContain('Close this tab');
  });
});