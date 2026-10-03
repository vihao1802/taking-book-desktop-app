import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { IDLE_FOCUS } from '@/focus/fake-focus';
import { FocusContext } from '@/focus/focusContext';
import { installFakeCapabilities } from '@/lib/fake-capabilities';
import type { ReaderCapabilities } from '@/reader-api';
import { Overlay } from './Overlay';

function renderOverlay(): string {
  const noop = (): void => undefined;
  return renderToStaticMarkup(
    <FocusContext.Provider value={IDLE_FOCUS}>
      <Overlay
        visible
        title="Book"
        page={1}
        total={10}
        mode="page"
        zoom={1}
        fitWidth={false}
        fullScreen={false}
        onFitWidth={noop}
        onToggleFullScreen={noop}
        onZoomChange={noop}
        onToggleMode={noop}
        onClose={noop}
        onSeek={noop}
      />
    </FocusContext.Provider>,
  );
}

function renderWith(overrides: Partial<ReaderCapabilities>): string {
  installFakeCapabilities(overrides);
  return renderOverlay();
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('Overlay capabilities', () => {
  it('shows the full screen and Focus controls buttons when all capabilities are on', () => {
    const html = renderWith({});
    expect(html).toContain('aria-label="Full screen"');
    expect(html).toContain('aria-label="Focus controls"');
  });

  it('hides only the full screen button when fullScreen is off', () => {
    const html = renderWith({ fullScreen: false });
    expect(html).not.toContain('aria-label="Full screen"');
    expect(html).toContain('aria-label="Focus controls"');
    expect(html).toContain('aria-label="Toggle reflow"');
  });

  it('keeps the Focus controls button while either focus capability is on', () => {
    expect(renderWith({ focusTimer: false })).toContain('aria-label="Focus controls"');
    expect(renderWith({ ambientSound: false })).toContain('aria-label="Focus controls"');
  });

  it('hides the Focus controls button when both focus capabilities are off', () => {
    const html = renderWith({ focusTimer: false, ambientSound: false });
    expect(html).not.toContain('aria-label="Focus controls"');
    expect(html).toContain('aria-label="Full screen"');
  });
});
