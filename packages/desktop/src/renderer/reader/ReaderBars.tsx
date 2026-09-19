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
 * The reader's on-demand bars. Find sits top right below the overlay; go to
 * page is centered over the reading view like a dialog. Neither is visible
 * until its shortcut or the page indicator is used, so the reading view stays
 * free of permanent controls.
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
    <>
      {search.open && (
        <div className="pointer-events-none fixed top-16 right-4 z-30">
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
        </div>
      )}
      {goToRequest !== 0 && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
          <GoToPageBar
            key={goToRequest}
            total={totalPages}
            currentPage={currentPage}
            onGoTo={onGoToPage}
            onClose={onCloseGoTo}
          />
        </div>
      )}
    </>
  );
}
