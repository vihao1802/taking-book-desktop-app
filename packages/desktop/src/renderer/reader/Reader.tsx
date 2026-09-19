import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isOk, stepZoomMultiplier } from '@taking-book/core';
import type { Annotation, AnnotationColor, BookFile, CreateAnnotationInput } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { Overlay, clampZoom } from './Overlay';
import { SidebarPanel, type SidebarTab } from './SidebarPanel';
import { ThumbnailsView } from './ThumbnailsView';
import { OutlineView } from './OutlineView';
import { usePdfOutline } from './usePdfOutline';
import { fileUrl, getScrollbarWidth, useElementSize, usePageLayout, usePdfDocument } from './pdf';
import { PdfPages, type PdfPagesHandle } from './PdfPages';
import { ReflowReader } from './ReflowReader';
import { useReflowDocument } from './useReflowDocument';
import { useReadingSession } from './useReadingSession';
import { useAnnotations } from './useAnnotations';
import { findRangeIgnoringWhitespace } from './highlights';
import type { PageTextSelection } from './PdfPageView';
import { ReaderBars } from './ReaderBars';
import { useDocumentSearch } from './useDocumentSearch';
import { usePageTexts } from './usePageTexts';
import { useReaderShortcuts } from './useReaderShortcuts';

const HIDE_DELAY_MS = 2500;

export function Reader({ file, onClose }: { file: BookFile; onClose: () => void }) {
  const [mode, setMode] = useState<'page' | 'reflow'>('page');
  const { pdf, error: pdfError } = usePdfDocument(fileUrl(file.path));
  const {
    paragraphs,
    pageTexts,
    error: reflowError,
    progress: reflowProgress,
    hasText,
    images,
    getImageData,
  } = useReflowDocument(pdf, mode === 'reflow');
  const { annotations, create, setNote, remove } = useAnnotations(file.hash);
  useReadingSession(file.id);

  // Find-in-document searches page text in page mode and paragraph text in
  // reflow mode. Page text is only extracted once the user first opens find.
  const paragraphTexts = useMemo(() => paragraphs.map((paragraph) => paragraph.text), [paragraphs]);
  const [findRequested, setFindRequested] = useState(false);
  const { texts: searchPageTexts, progress: searchIndexing } = usePageTexts(
    pdf,
    mode === 'page' && findRequested,
  );
  const search = useDocumentSearch(mode === 'reflow' ? paragraphTexts : searchPageTexts);
  const { openBar: openSearchBar } = search;
  const [goToRequest, setGoToRequest] = useState(0);

  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const zoomLoadedRef = useRef(false);
  const zoomSaveTimerRef = useRef<number>(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<PdfPagesHandle>(null);
  const { width, height } = useElementSize(scrollRef);
  // `width` is the full content-box width of the reader wrapper. When pages
  // are taller than the viewport (always, for a real document) the vertical
  // scrollbar steals `getScrollbarWidth()` of that width, so a page laid out to
  // `width` would overflow horizontally. All zooms are relative to the usable
  // content width (width minus the scrollbar) so that "100%" and fit-to-width
  // agree, and floored to a whole pixel so the canvas/text-layer `Math.ceil`
  // rounding can't push one extra px over.
  const contentWidth = Math.max(width - getScrollbarWidth(), 1);
  const viewWidth = Math.max(Math.floor(fitWidth ? contentWidth : contentWidth * zoom), 1);
  const layout = usePageLayout(pdf, viewWidth);

  const [initialPosition, setInitialPosition] = useState<number | undefined>(undefined);
  const [restoreFraction, setRestoreFraction] = useState<number | undefined>(undefined);
  const lastFractionRef = useRef(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab | null>(null);
  const { nodes: outlineNodes, loading: outlineLoading } = usePdfOutline(pdf);
  const hideTimerRef = useRef<number>(0);
  const positionRef = useRef({ page: 1, position: 0, mode: 'page' as 'page' | 'reflow' });
  const saveTimerRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    window.api.getLastPosition(file.id).then((pos) => {
      if (cancelled || !isOk(pos) || !pos.data) return;
      setInitialPosition(pos.data.position);
      // Reopen in the view the book was last read in so a reflow session
      // never overwrites the page-mode position (or vice versa).
      setMode(pos.data.mode);
    });
    return () => {
      cancelled = true;
    };
  }, [file.id]);

  useEffect(() => {
    if (pdf && pdf.numPages > 0) {
      window.api.setFilePageCount(file.id, pdf.numPages);
    }
  }, [pdf, file.id]);

  // Restore the zoom level this book was last read at, so reopening doesn't
  // reset to 100% and force the reader to re-zoom. A saved zoom of exactly 100%
  // means the book was left in fit-to-width; anything else means it was zoomed,
  // so fit-to-width must be off or the toolbar would show a zoom the layout
  // isn't applying.
  useEffect(() => {
    let cancelled = false;
    window.api.getFileZoom(file.id).then((res) => {
      if (cancelled || !isOk(res) || res.data == null) return;
      zoomLoadedRef.current = true;
      const restored = clampZoom(res.data);
      setZoom(restored);
      setFitWidth(restored === 1);
    });
    return () => {
      cancelled = true;
    };
  }, [file.id]);

  // Persist zoom changes (debounced) once the saved value has been restored;
  // the initial load must not immediately overwrite what was just read.
  useEffect(() => {
    if (!zoomLoadedRef.current) return;
    window.clearTimeout(zoomSaveTimerRef.current);
    zoomSaveTimerRef.current = window.setTimeout(() => {
      window.api.setFileZoom(file.id, zoom);
    }, 400);
    return () => window.clearTimeout(zoomSaveTimerRef.current);
  }, [zoom, file.id]);

  useEffect(() => {
    positionRef.current.page = currentPage;
  }, [currentPage]);

  const savePosition = useCallback(
    (page: number, position: number, mode: 'page' | 'reflow' = 'page') => {
      positionRef.current = { page, position, mode };
      lastFractionRef.current = position;
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        window.api.saveLastPosition(
          file.id,
          positionRef.current.page,
          positionRef.current.position,
          positionRef.current.mode,
        );
      }, 400);
    },
    [file.id],
  );

  useEffect(() => {
    const saveNow = () => {
      window.clearTimeout(saveTimerRef.current);
      window.api.saveLastPosition(
        file.id,
        positionRef.current.page,
        positionRef.current.position,
        positionRef.current.mode,
      );
    };
    window.addEventListener('beforeunload', saveNow);
    return () => {
      window.removeEventListener('beforeunload', saveNow);
      saveNow();
    };
  }, [file.id]);

  // The overlay must not disappear while the user is typing (e.g. the custom
  // zoom field): focus in an editable element means an active editing session,
  // not a paused one.
  const isEditingText = useCallback(() => {
    const target = document.activeElement as HTMLElement | null;
    return (
      target?.tagName === 'INPUT' ||
      target?.tagName === 'TEXTAREA' ||
      target?.isContentEditable
    );
  }, []);

  const startHideTimer = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    if (isEditingText()) return;
    hideTimerRef.current = window.setTimeout(() => setOverlayVisible(false), HIDE_DELAY_MS);
  }, [isEditingText]);

  const reveal = useCallback(() => {
    setOverlayVisible(true);
    startHideTimer();
  }, [startHideTimer]);

  const handleClick = useCallback(() => {
    setOverlayVisible((visible) => {
      if (visible) {
        window.clearTimeout(hideTimerRef.current);
        return false;
      }
      startHideTimer();
      return true;
    });
  }, [startHideTimer]);

  const selectSidebarPage = useCallback((page: number) => {
    pagesRef.current?.scrollToPage(page);
  }, []);

  const openFind = useCallback(() => {
    setFindRequested(true);
    openSearchBar();
  }, [openSearchBar]);
  const openGoToPage = useCallback(() => setGoToRequest((request) => request + 1), []);
  const closeGoToPage = useCallback(() => setGoToRequest(0), []);

  const changeZoom = useCallback((value: number) => {
    setFitWidth(false);
    setZoom(clampZoom(value));
  }, []);
  const fitToWidth = useCallback(() => {
    setFitWidth(true);
    setZoom(1);
  }, []);
  const stepZoom = (direction: 'in' | 'out') => {
    const stepped = stepZoomMultiplier(zoom, direction);
    if (stepped !== null) changeZoom(stepped);
  };

  const toggleMode = useCallback(() => {
    setRestoreFraction(lastFractionRef.current);
    setMode((current) => (current === 'page' ? 'reflow' : 'page'));
  }, []);

  const toggleSidebarTab = (tab: SidebarTab) => setSidebarTab((current) => (current === tab ? null : tab));

  // Escape peels off one layer at a time: find bar, go-to bar, sidebar, then
  // the reader itself. Selection toolbars and note popups close themselves
  // first (they consume Escape before it gets here).
  const dismiss = () => {
    if (search.open) search.close();
    else if (goToRequest !== 0) closeGoToPage();
    else if (sidebarTab !== null) setSidebarTab(null);
    else onClose();
  };

  // Reflow mode registers its own handlers inside ReflowReader.
  useReaderShortcuts(
    {
      find: openFind,
      findNext: () => (search.open ? search.next() : openFind()),
      findPrevious: () => (search.open ? search.previous() : openFind()),
      goToPage: openGoToPage,
      zoomIn: () => stepZoom('in'),
      zoomOut: () => stepZoom('out'),
      zoomFit: fitToWidth,
      firstPage: () => pagesRef.current?.scrollToPage(1),
      lastPage: () => pagesRef.current?.scrollToPage(pdf?.numPages ?? 1),
      nextScreen: () => pagesRef.current?.scrollToPage(currentPage + 1),
      nextPage: () => pagesRef.current?.scrollToPage(currentPage + 1),
      previousScreen: () => pagesRef.current?.scrollToPage(currentPage - 1),
      previousPage: () => pagesRef.current?.scrollToPage(currentPage - 1),
      toggleThumbnails: () => toggleSidebarTab('thumbnails'),
      toggleOutline: () => toggleSidebarTab('outlines'),
      ...(hasText ? { toggleReflow: toggleMode } : {}),
      dismiss,
    },
    mode === 'page' && !pdfError,
  );

  // A highlight made in page view also gets a best-effort reflow anchor so it
  // appears in reflow mode too (whitespace-insensitive search, since the two
  // views join fragments differently).
  const createFromPage = useCallback(
    async (selection: PageTextSelection, color: AnnotationColor, note: string | null): Promise<Annotation | null> => {
      let paraIndex: number | null = null;
      let paraStart: number | null = null;
      let paraEnd: number | null = null;
      for (let i = 0; i < paragraphs.length; i++) {
        if (paragraphs[i].pageIndex !== selection.page - 1) continue;
        const range = findRangeIgnoringWhitespace(paragraphs[i].text, selection.quote);
        if (range) {
          paraIndex = i;
          paraStart = range[0];
          paraEnd = range[1];
          break;
        }
      }
      const input: CreateAnnotationInput = {
        page: selection.page,
        pageStart: selection.start,
        pageEnd: selection.end,
        quote: selection.quote,
        color,
        note,
        paraIndex,
        paraStart,
        paraEnd,
      };
      return create(input);
    },
    [paragraphs, create],
  );

  // A document with no extractable text (e.g. scanned pages) can only be read
  // as page images; never land or stay in reflow mode for it.
  useEffect(() => {
    if (mode === 'reflow' && !hasText && reflowProgress === null) {
      setMode('page');
    }
  }, [mode, hasText, reflowProgress]);

  const dpr = Math.min(window.devicePixelRatio || 1, 3);

  const error = pdfError;
  const total = pdf?.numPages ?? 0;
  const ready =
    pdf != null &&
    !pdf.loadingTask.destroyed &&
    layout != null &&
    height > 0 &&
    initialPosition !== undefined;

  if (mode === 'reflow') {
    return (
      <ReflowReader
        file={file}
        pdf={pdf}
        paragraphs={paragraphs}
        images={images}
        pageTexts={pageTexts}
        error={reflowError}
        progress={reflowProgress}
        onClose={onClose}
        initialFraction={restoreFraction}
        onScrollFraction={(frac) => {
          lastFractionRef.current = frac;
        }}
        onToggleMode={() => {
          setRestoreFraction(lastFractionRef.current);
          setMode('page');
        }}
        zoom={zoom}
        onZoomChange={setZoom}
        search={search}
        onOpenFind={openFind}
        goToRequest={goToRequest}
        onOpenGoTo={openGoToPage}
        onCloseGoTo={closeGoToPage}
        annotations={annotations}
        onCreate={create}
        onSetNote={setNote}
        onDelete={remove}
        getImageData={getImageData}
      />
    );
  }

  return (
    <div className="bg-background fixed inset-0" onMouseMove={reveal}>
      {error ? (
        <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3">
          <p>Could not open this document.</p>
          <pre className="text-muted-foreground max-w-[80%] text-xs whitespace-pre-wrap">{error}</pre>
          <Button onClick={onClose}>Back</Button>
        </div>
      ) : (
        <div className="absolute inset-0" ref={scrollRef} onClick={handleClick}>
          {ready ? (
            <PdfPages
              ref={pagesRef}
              pdf={pdf}
              layout={layout}
              containerWidth={viewWidth}
              containerHeight={height}
              dpr={dpr}
              initialPosition={restoreFraction ?? initialPosition}
              onScrollPosition={savePosition}
              onCurrentPage={setCurrentPage}
              pageTexts={pageTexts}
              annotations={annotations}
              searchMatches={search.matches}
              searchActiveIndex={search.activeIndex}
              searchScrollRequest={search.scrollRequest}
              onCreate={createFromPage}
              onSetNote={setNote}
              onDelete={remove}
            />
          ) : (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3">
              <p>Loading…</p>
            </div>
          )}
        </div>
      )}
      {!error && (
        <Overlay
          visible={overlayVisible}
          title={file.title}
          page={currentPage}
          total={total}
          mode={mode}
          zoom={zoom}
          fitWidth={fitWidth}
          onFitWidth={fitToWidth}
          onZoomChange={changeZoom}
          reflowDisabled={!hasText}
          onToggleMode={toggleMode}
          onClose={onClose}
          onSeek={(p) => pagesRef.current?.scrollToPage(p)}
          onInteract={reveal}
          sidebarTab={sidebarTab}
          onSelectSidebarTab={setSidebarTab}
        />
      )}
      {!error && (
        <ReaderBars
          search={search}
          indexing={searchIndexing}
          goToRequest={goToRequest}
          totalPages={total}
          currentPage={currentPage}
          onGoToPage={(page) => pagesRef.current?.scrollToPage(page)}
          onCloseGoTo={closeGoToPage}
        />
      )}
      {sidebarTab !== null && pdf !== null && (
        <SidebarPanel
          tab={sidebarTab}
          onTabChange={setSidebarTab}
          onClose={() => setSidebarTab(null)}
          showThumbnails
        >
          {sidebarTab === 'thumbnails' ? (
            <ThumbnailsView
              pdf={pdf}
              total={pdf.numPages}
              currentPage={currentPage}
              onSelect={selectSidebarPage}
            />
          ) : (
            <OutlineView
              nodes={outlineNodes}
              loading={outlineLoading}
              currentPage={currentPage}
              onSelect={selectSidebarPage}
            />
          )}
        </SidebarPanel>
      )}
    </div>
  );
}