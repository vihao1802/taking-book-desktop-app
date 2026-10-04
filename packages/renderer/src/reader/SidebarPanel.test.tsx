import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { installFakeCapabilities } from '@/lib/fake-capabilities';
import { SidebarPanel } from './SidebarPanel';

function renderPanel(): string {
  const noop = (): void => undefined;
  return renderToStaticMarkup(
    <SidebarPanel tab="outlines" onTabChange={noop} onClose={noop} showThumbnails width={400} onWidthChange={noop}>
      <p>Contents</p>
    </SidebarPanel>,
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('SidebarPanel width by Window size class', () => {
  it('takes at most 85% of the width at compact', () => {
    installFakeCapabilities({}, 450);
    expect(renderPanel()).toContain('max-width:85%');
  });

  it.each([600, 1000])('only stays inside the window at %i dp', (width) => {
    installFakeCapabilities({}, width);
    expect(renderPanel()).toContain('max-width:calc(100% - 1rem)');
  });
});
