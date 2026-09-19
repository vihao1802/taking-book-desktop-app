import type { DocumentSearch } from './useDocumentSearch';
import type { PageTextsProgress } from './usePageTexts';
import { FindBar } from './FindBar';
import { GoToPageBar } from './GoToPageBar';

interface ReaderBarsProps {
  search: DocumentSearch;
  indexing: PageTextsProgress | null;
  /** Non-zero while the go-to-page bar is open; a new value remounts it focused. */
  goToRequest: number;
  totalPages: number;
  currentPage: number;
  onGoToPage: (page: number) => void;
  onCloseGoTo: () => void;
}

/**
 * The reader's on-demand bars (find and go to page), stacked top right below
 * the overlay. Neither is visible until its shortcut is pressed, so the
 * reading view stays free of permanent controls.
 */
export function ReaderBars({
  search,
  indexing,
  goToRequest,
  totalPages,
  currentPage,
  onGoToPage,
  onCloseGoTo,
}: ReaderBarsProps) {
  if (!search.open && goToRequest === 0) return null;
  return (
    <div className="pointer-events-none fixed top-16 right-4 z-30 flex flex-col items-end gap-2">
      {search.open && (
        <FindBar
          query={search.query}
          activeIndex={search.activeIndex}
          matchCount={search.matches.length}
          indexing={indexing}
          focusRequest={search.focusRequest}
          onQueryChange={search.setQuery}
          onNext={search.next}
          onPrevious={search.previous}
          onClose={search.close}
        />
      )}
      {goToRequest !== 0 && (
        <GoToPageBar
          key={goToRequest}
          total={totalPages}
          currentPage={currentPage}
          onGoTo={onGoToPage}
          onClose={onCloseGoTo}
        />
      )}
    </div>
  );
}
