import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { FocusContext } from '@/focus/focusContext';
import { IDLE_FOCUS } from '@/focus/fake-focus';
import { installFakeCapabilities } from '@/lib/fake-capabilities';
import { NavRail } from './NavRail';

function renderRail(): string {
  return renderToStaticMarkup(
    <FocusContext.Provider value={IDLE_FOCUS}>
      <NavRail current="home" onNavigate={() => undefined} />
    </FocusContext.Provider>,
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('NavRail capabilities', () => {
  it('shows every entry when all capabilities are on', () => {
    installFakeCapabilities();
    const html = renderRail();
    for (const label of ['Home', 'Library', 'Favorites', 'Notes', 'Statistics', 'Settings']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });

  it('hides only the Statistics entry when statistics is off', () => {
    installFakeCapabilities({ statistics: false });
    const html = renderRail();
    expect(html).not.toContain('aria-label="Statistics"');
    for (const label of ['Home', 'Library', 'Favorites', 'Notes', 'Settings']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });
});
