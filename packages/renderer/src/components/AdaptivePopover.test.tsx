import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { installFakeCapabilities } from '@/lib/fake-capabilities';
import { AdaptivePopover } from './AdaptivePopover';

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('AdaptivePopover', () => {
  it.each([600, 1000])('is anchored beside its trigger at %i dp', (width) => {
    installFakeCapabilities({}, width);
    const html = renderToStaticMarkup(
      <AdaptivePopover label="Focus controls" onClose={() => undefined} anchoredClassName="top-full right-0 w-72">
        <p>Panel</p>
      </AdaptivePopover>,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Focus controls"');
    expect(html).toContain('top-full right-0 w-72');
    expect(html).toContain('Panel');
  });
});
