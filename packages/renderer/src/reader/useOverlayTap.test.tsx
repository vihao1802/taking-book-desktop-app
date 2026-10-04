import type { MouseEvent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOverlayTap } from './useOverlayTap';

const AREA = { left: 0, top: 0, width: 1000, height: 600 };

/** Renders the hook once so its handlers can be called the way React would. */
function setUp(): { toggle: ReturnType<typeof vi.fn>; press: () => void; click: (x: number, y: number) => void } {
  const toggle = vi.fn();
  let handlers: ReturnType<typeof useOverlayTap> | null = null;
  function Probe() {
    handlers = useOverlayTap(toggle);
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return {
    toggle,
    press: () => handlers?.onPointerDownCapture(),
    click: (x, y) =>
      handlers?.onClick({
        clientX: x,
        clientY: y,
        currentTarget: { getBoundingClientRect: () => AREA },
      } as unknown as MouseEvent<HTMLElement>),
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
  it('toggles the Overlay on a tap in the middle with no selection', () => {
    setSelection(true);
    const { toggle, press, click } = setUp();
    press();
    click(500, 300);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('leaves the Overlay alone for a tap near the edge', () => {
    setSelection(true);
    const { toggle, press, click } = setUp();
    press();
    click(20, 300);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('does not toggle on the tap that clears a selection', () => {
    setSelection(false);
    const { toggle, press, click } = setUp();
    press();
    // The press collapses the selection before the click arrives.
    setSelection(true);
    click(500, 300);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('does not toggle on the click that ends making a selection', () => {
    setSelection(true);
    const { toggle, press, click } = setUp();
    press();
    setSelection(false);
    click(500, 300);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('toggles again on the next tap once the selection is gone', () => {
    setSelection(false);
    const { toggle, press, click } = setUp();
    press();
    setSelection(true);
    click(500, 300);
    press();
    click(500, 300);
    expect(toggle).toHaveBeenCalledTimes(1);
  });
});
