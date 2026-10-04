import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { installFakeCapabilities } from '@/lib/fake-capabilities';
import { NotesSidebar } from './NotesSidebar';
import type { NoteEditActions } from './useAnnotations';
import type { NoteDraftState } from './useNoteDraft';
import type { NotesSidebarState } from './useNotesSidebar';

const noop = (): void => undefined;

const NO_DRAFT: NoteDraftState = {
  draft: null,
  draftKey: 0,
  saving: false,
  error: null,
  start: noop,
  startPageNote: noop,
  changeText: noop,
  changeColor: noop,
  cancel: noop,
  save: async () => undefined,
  highlight: null,
};

const EDIT_ACTIONS = { saveEdit: noop, deleteAnnotation: noop } as unknown as NoteEditActions;

function sidebarState(sheet: boolean): NotesSidebarState {
  return {
    open: true,
    toggle: noop,
    show: noop,
    close: noop,
    width: 320,
    onWidthChange: noop,
    showHighlights: false,
    onShowHighlightsChange: noop,
    notes: [],
    editingId: null,
    selectedId: null,
    focusRequest: 0,
    editAnnotation: noop,
    selectAnnotation: noop,
    stopEditing: noop,
    sheet,
    pageInset: sheet ? 0 : 336,
  };
}

function renderSidebar(sheet: boolean): string {
  return renderToStaticMarkup(
    <NotesSidebar state={sidebarState(sheet)} noteDraft={NO_DRAFT} readingPage={3} editActions={EDIT_ACTIONS} onJump={noop} />,
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('NotesSidebar presentation', () => {
  it('is a bottom sheet over a scrim that closes it, with no resize handle', () => {
    installFakeCapabilities({}, 450);
    const html = renderSidebar(true);
    expect(html).toContain('inset-x-0 bottom-0');
    expect(html).toContain('bg-black/30');
    expect(html).not.toContain('role="separator"');
    expect(html).toContain('Add note to page 3');
  });

  it('is a panel on the right edge with its own width and a resize handle at expanded', () => {
    installFakeCapabilities({}, 1000);
    const html = renderSidebar(false);
    expect(html).toContain('width:320px');
    expect(html).toContain('right-2');
    expect(html).not.toContain('bg-black/30');
    expect(html).toContain('role="separator"');
  });
});
