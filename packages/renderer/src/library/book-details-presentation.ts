import type { WindowSizeClass } from '@/lib/window-size-class';

/** How the Library lays its Books out. */
export type LibraryView = 'grid' | 'list';

/**
 * How Book details are shown (CONTEXT.md: Book details): in a pane beside the
 * list only where the List view has the room, at expanded; as a bottom sheet
 * everywhere else, including the Grid view, which has no list to sit beside.
 */
export function getBookDetailsPresentation(layout: { view: LibraryView; sizeClass: WindowSizeClass }): 'pane' | 'sheet' {
  return layout.view === 'list' && layout.sizeClass === 'expanded' ? 'pane' : 'sheet';
}
