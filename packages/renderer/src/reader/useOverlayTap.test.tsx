import type { MouseEvent, PointerEvent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOverlayTap } from './useOverlayTap';

/** Renders the hook once so its handlers can be called the way React would. */
function setUp(): { toggle: ReturnType<typeof vi.fn>; press: (x?: number, y?: number) => void; click: (x?: number, y?: number) => void } {
  const toggle = vi.fn();
  let handlers: ReturnType<typeof useOverlayTap> | null = null;
  function Probe() {
    handlers = useOverlayTap(toggle);
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return {
    toggle,
    press: (x = 100, y = 100) => handlers?.onPointerDownCapture({ clientX: x, clientY: y } as unknown as PointerEvent<HTMLElement>),
    click: (x = 100, y = 100) => handlers?.onClick({ clientX: x, clientY: y } as unknown as MouseEvent<HTMLElement>),
  };
}

function setSelection(isCollapsed: boolean): void {
  Object.defineProperty(globalThis, 'window', {
    value: { getSelection: () => ({ isCollapsed }) },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('useOverlayTap', () => {
  it('toggles the Overlay on a tap with no selection', () => {
    setSelection(true);
    const { toggle, press, click } = setUp();
    press();
    click();
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('does not toggle when the press travelled, as in a scroll', () => {
    setSelection(true);
    const { toggle, press, click } = setUp();
    press(100, 400);
    click(100, 200);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('does not toggle on the tap that clears a selection', () => {
    setSelection(false);
    const { toggle, press, click } = setUp();
    press();
    // The press collapses the selection before the click arrives.
    setSelection(true);
    click();
    expect(toggle).not.toHaveBeenCalled();
  });

  it('does not toggle on the click that ends making a selection', () => {
    setSelection(true);
    const { toggle, press, click } = setUp();
    press();
    setSelection(false);
    click();
    expect(toggle).not.toHaveBeenCalled();
  });

  it('toggles again on the next tap once the selection is gone', () => {
    setSelection(false);
    const { toggle, press, click } = setUp();
    press();
    setSelection(true);
    click();
    press();
    click();
    expect(toggle).toHaveBeenCalledTimes(1);
  });
});
