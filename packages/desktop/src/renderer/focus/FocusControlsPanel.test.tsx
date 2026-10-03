import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { installFakeCapabilities } from '@/lib/fake-capabilities';
import type { ReaderCapabilities } from '../../shared/types';
import { IDLE_FOCUS } from './fake-focus';
import { FocusContext } from './focusContext';
import { FocusControlsPanel } from './FocusControlsPanel';

function renderWith(overrides: Partial<ReaderCapabilities>): string {
  installFakeCapabilities(overrides);
  return renderToStaticMarkup(
    <FocusContext.Provider value={IDLE_FOCUS}>
      <FocusControlsPanel />
    </FocusContext.Provider>,
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('FocusControlsPanel capabilities', () => {
  it('shows both sections when both capabilities are on', () => {
    const html = renderWith({});
    expect(html).toContain('aria-label="Focus timer"');
    expect(html).toContain('Ambient sound');
  });

  it('hides the Focus timer section when focusTimer is off', () => {
    const html = renderWith({ focusTimer: false });
    expect(html).not.toContain('aria-label="Focus timer"');
    expect(html).toContain('Ambient sound');
  });

  it('hides the Ambient sound section when ambientSound is off', () => {
    const html = renderWith({ ambientSound: false });
    expect(html).toContain('aria-label="Focus timer"');
    expect(html).not.toContain('Ambient sound');
  });
});
