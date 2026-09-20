import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isOk, stepZoomMultiplier, type LastPosition, type PageLocation, type ReadMode } from '@taking-book/core';
import type { Annotation, AnnotationColor, BookFile, NoteAnchor } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { Overlay, clampZoom } from './Overlay';
import { SidebarPanel, type SidebarTab } from './SidebarPanel';
import { ThumbnailsView } from './ThumbnailsView';
import { OutlineView } from './OutlineView';
import { NotesSidebar } from './NotesSidebar';
import { usePdfOutline } from './usePdfOutline';
import { fileUrl, getScrollbarWidth, useElementSize, usePageLayout, usePdfDocument } from './pdf';
import { PdfPages, type PdfPagesHandle } from './PdfPages';
import { ReaderToast, type ReaderNotice } from './ReaderToast';
import { ReflowReader } from './ReflowReader';
import { useReflowDocument } from './useReflowDocument';
import { useReadingSession } from './useReadingSession';
import { useAnnotations } from './useAnnotations';
import { useNotesSidebar } from './useNotesSidebar';
import { useNoteDraft } from './useNoteDraft';
import { useNoteJump } from './useNoteJump';
import { useOpenToNote } from './useOpenToNote';
import { findRangeIgnoringWhitespace } from './highlights';
import type { PageTextSelection } from './PdfPageView';
import { ReaderBars } from './ReaderBars';
import { useDocumentSearch } from './useDocumentSearch';
import { usePageTexts } from './usePageTexts';
import { useReaderShortcuts } from './useReaderShortcuts';
import { useFullScreen } from './useFullScreen';
import { usePersistedSidebarWidth } from './usePersistedSidebarWidth';
import { usePersistedZoom } from './usePersistedZoom';
import { getThumbnailWidth } from './sidebar-width';

const HIDE_DELAY_MS = 2500;

const MODE_LABELS: Record<ReadMode, string> = {
  page: 'Page view',
  reflow: 'Reflow view',
};

interface ReaderProps {
  file: BookFile;
  onClose: () => void;
  /** A Note chosen in the Notes view: the book opens at it with the Notes sidebar on its card. Null for a normal open. */
  noteToOpen?: Annotation | null;
}

export function Reader({ file, onClose, noteToOpen = null }: ReaderProps) {
  const [mode, setMode] = useState<ReadMode>('page');
  const [notice, setNotice] = useState<ReaderNotice | null>(null);
  const { pdf, error: pdfError } = usePdfDocument(fileUrl(file.path));
  const {
    paragraphs,
    pageTexts,
    error: reflowError,
    progress: reflowProgress,
    hasText,
    images,
    getImageData,
  } = useReflowDocument(pdf, mode === 'reflow', { fileHash: file.hash });
  const { annotations, create, saveNoteDraft, editActions } = useAnnotations(file.hash);
  const notesSidebar = useNotesSidebar(annotations);
  const noteDraft = useNoteDraft({ fileHash: file.hash, saveNote: saveNoteDraft });
  // The draft's passage is painted as a temporary highlight next to the saved
  // ones, but stays out of the Notes list, which only shows what is stored.
  const { highlight: draftHighlight } = noteDraft;
  const paintedAnnotations = useMemo(
    () => (draftHighlight ? [...annotations, draftHighlight] : annotations),
    [annotations, draftHighlight],
  );
  const { noteJump, jumpToNote, finishNoteJump } = useNoteJump(mode, setNotice);
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

  // Page and reflow keep separate zoom levels: reflow scales font size while
  // page mode scales the page width, so one shared number would make a switch
  // between the views jump to a size chosen for the other.
  const [fitWidth, setFitWidth] = useState(true);
  // A saved page zoom of exactly 100% means the book was left in fit-to-width;
  // anything else means it was zoomed, so fit-to-width must be off or the
  // toolbar would show a zoom the layout isn't applying.
  const restorePageZoom = useCallback((restored: number) => setFitWidth(restored === 1), []);
  const [zoom, setZoom] = usePersistedZoom(file.id, 'page', restorePageZoom);
  const [reflowZoom, setReflowZoom] = usePersistedZoom(file.id, 'reflow');
  const { fullScreen, toggleFullScreen } = useFullScreen();

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
  // The saved position and its reader mode are applied together, so this also
  // says the mode a jump is planned in is the one the book will be shown in.
  useOpenToNote({
    note: noteToOpen,
    modeApplied: initialPosition !== undefined,
    annotations,
    jumpToNote,
    editAnnotation: notesSidebar.editAnnotation,
  });
  // Where the reader is right now, as a page plus how far down it. Both views
  // report it, and it is handed to the other view on a mode toggle: a scroll
  // fraction means different places in a PDF layout and in re-wrapped text, but
  // a page number means the same place in both.
  const locationRef = useRef<PageLocation | null>(null);
  const [handoffLocation, setHandoffLocation] = useState<PageLocation | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab | null>(null);
  const [sidebarWidth, setSidebarWidth] = usePersistedSidebarWidth();
  const { nodes: outlineNodes, loading: outlineLoading } = usePdfOutline(pdf);
  const hideTimerRef = useRef<number>(0);
  // Null until the saved position has been read: saving before that would
  // overwrite it with the placeholder page 1 if the reader is closed early.
  const positionRef = useRef<LastPosition | null>(null);
  const saveTimerRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    window.api.getLastPosition(file.id).then((res) => {
      if (cancelled || !isOk(res)) return;
      const saved = res.data;
      positionRef.current = saved ?? { page: 1, position: 0, mode: 'page' };
      setInitialPosition(saved?.position ?? 0);
      if (!saved) return;
      // Reopen in the view the book was last read in. Reflow saves a page plus
      // how far down it, the same shape the mode toggle hands over, so it can
      // reopen on the exact spot instead of the top of the document.
      if (saved.mode === 'reflow') {
        const location = { page: saved.page, fraction: Math.min(Math.max(saved.position, 0), 1) };
        locationRef.current = location;
        setHandoffLocation(location);
      }
      setMode(saved.mode);
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

  const persistPosition = useCallback(() => {
    const current = positionRef.current;
    if (current) window.api.saveLastPosition(file.id, current.page, current.position, current.mode);
  }, [file.id]);

  const savePosition = useCallback(
    (page: number, position: number, mode: ReadMode = 'page') => {
      positionRef.current = { page, position, mode };
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(persistPosition, 400);
    },
    [persistPosition],
  );

  // Both views report where they are as a page plus how far down it. Page mode
  // saves through its own scroll callback (a whole-layout fraction); reflow has
  // no other writer, so its location is saved here. Reader is the single writer
  // of the last position, so a view closing can't overwrite the other's save.
  const recordLocation = useCallback(
    (location: PageLocation) => {
      locationRef.current = location;
      if (mode === 'reflow') savePosition(location.page, location.fraction, 'reflow');
    },
    [mode, savePosition],
  );

  useEffect(() => {
    const saveNow = () => {
      window.clearTimeout(saveTimerRef.current);
      persistPosition();
    };
    window.addEventListener('beforeunload', saveNow);
    return () => {
      window.removeEventListener('beforeunload', saveNow);
      saveNow();
    };
  }, [persistPosition]);

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

  const changeZoom = useCallback(
    (value: number) => {
      setFitWidth(false);
      setZoom(clampZoom(value));
    },
    [setZoom],
  );
  const changeReflowZoom = useCallback((value: number) => setReflowZoom(clampZoom(value)), [setReflowZoom]);
  const fitToWidth = useCallback(() => {
    setFitWidth(true);
    setZoom(1);
  }, [setZoom]);
  const stepZoom = (direction: 'in' | 'out') => {
    const stepped = stepZoomMultiplier(zoom, direction);
    if (stepped !== null) changeZoom(stepped);
  };

  const toggleMode = useCallback(() => {
    // The tracked page is the fallback for a location that was never recorded;
    // handing over nothing would drop the other view onto page 1.
    setHandoffLocation(locationRef.current ?? { page: currentPage, fraction: 0 });
    const next: ReadMode = mode === 'page' ? 'reflow' : 'page';
    setMode(next);
    setNotice({ id: Date.now(), message: MODE_LABELS[next] });
  }, [currentPage, mode]);
  const clearNotice = useCallback(() => setNotice(null), []);

  const toggleSidebarTab = (tab: SidebarTab) => setSidebarTab((current) => (current === tab ? null : tab));

  // Escape peels off one layer at a time: find bar, go-to bar, Notes sidebar,
  // Reader sidebar, then the reader itself. Selection toolbars close themselves
  // first (they consume Escape before it gets here), and so does a Note draft's
  // text box, which discards the draft.
  const dismiss = () => {
    if (search.open) search.close();
    else if (goToRequest !== 0) closeGoToPage();
    else if (notesSidebar.open) notesSidebar.close();
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
      nextScreen: () => pagesRef.current?.scrollToPage(currentPage + 1, { smooth: true }),
      nextPage: () => pagesRef.current?.scrollToPage(currentPage + 1, { smooth: true }),
      previousScreen: () => pagesRef.current?.scrollToPage(currentPage - 1, { smooth: true }),
      previousPage: () => pagesRef.current?.scrollToPage(currentPage - 1, { smooth: true }),
      toggleThumbnails: () => toggleSidebarTab('thumbnails'),
      toggleOutline: () => toggleSidebarTab('outlines'),
      toggleNotes: notesSidebar.toggle,
      ...(hasText ? { toggleReflow: toggleMode } : {}),
      dismiss,
    },
    mode === 'page' && !pdfError,
  );

  // A selection made in page view also gets a best-effort reflow anchor so its
  // highlight appears in reflow mode too (whitespace-insensitive search, since
  // the two views join fragments differently).
  const anchorFromPage = useCallback(
    (selection: PageTextSelection): NoteAnchor => {
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
      return {
        page: selection.page,
        pageStart: selection.start,
        pageEnd: selection.end,
        quote: selection.quote,
        paraIndex,
        paraStart,
        paraEnd,
      };
    },
    [paragraphs],
  );

  const createFromPage = useCallback(
    (selection: PageTextSelection, color: AnnotationColor): Promise<Annotation | null> =>
      create({ ...anchorFromPage(selection), color, note: null }),
    [anchorFromPage, create],
  );

  // Choosing "Add note" opens the Notes sidebar on a fresh draft card.
  const { start: startDraft } = noteDraft;
  const { show: showNotesSidebar } = notesSidebar;
  const startNote = useCallback(
    (anchor: NoteAnchor) => {
      startDraft(anchor);
      showNotesSidebar();
    },
    [startDraft, showNotesSidebar],
  );
  // Clicking a highlight edits its card. The draft's temporary highlight is
  // painted like a stored one but has no card to edit, so it is skipped.
  const { editAnnotation } = notesSidebar;
  const openAnnotation = useCallback(
    (annotation: Annotation) => {
      const stored = annotations.find((candidate) => candidate.id === annotation.id);
      if (stored) editAnnotation(stored);
    },
    [annotations, editAnnotation],
  );
  const startNoteFromPage = useCallback(
    (selection: PageTextSelection) => startNote(anchorFromPage(selection)),
    [startNote, anchorFromPage],
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
      <>
        <ReflowReader
          file={file}
          pdf={pdf}
          paragraphs={paragraphs}
          images={images}
          pageTexts={pageTexts}
          error={reflowError}
          progress={reflowProgress}
          onClose={onClose}
          initialLocation={handoffLocation}
          onLocationChange={recordLocation}
          onToggleMode={toggleMode}
          zoom={reflowZoom}
          onZoomChange={changeReflowZoom}
          search={search}
          onOpenFind={openFind}
          goToRequest={goToRequest}
          onOpenGoTo={openGoToPage}
          onCloseGoTo={closeGoToPage}
          annotations={paintedAnnotations}
          onCreate={create}
          onAddNote={startNote}
          onOpenAnnotation={openAnnotation}
          editActions={editActions}
          notesSidebar={notesSidebar}
          noteDraft={noteDraft}
          onJumpToNote={jumpToNote}
          noteJump={noteJump}
          onNoteJumpDone={finishNoteJump}
          getImageData={getImageData}
        />
        <ReaderToast notice={notice} onDone={clearNotice} />
      </>
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
        // `isolate` traps the pdf.js text layer (z-10) and highlight rects
        // (z-20) in their own stacking context; otherwise they paint above
        // the sidebar (z-5) and swallow every click meant for it. The right
        // inset is how the Notes sidebar pushes the page instead of covering it.
        <div
          className="absolute inset-y-0 left-0 isolate"
          style={{ right: notesSidebar.pageInset }}
          ref={scrollRef}
          onClick={handleClick}
        >
          {ready ? (
            <PdfPages
              ref={pagesRef}
              pdf={pdf}
              layout={layout}
              containerWidth={viewWidth}
              containerHeight={height}
              dpr={dpr}
              initialPosition={initialPosition}
              initialLocation={handoffLocation}
              onLocationChange={recordLocation}
              onScrollPosition={savePosition}
              onCurrentPage={setCurrentPage}
              pageTexts={pageTexts}
              annotations={paintedAnnotations}
              searchMatches={search.matches}
              searchActiveIndex={search.activeIndex}
              searchScrollRequest={search.scrollRequest}
              onCreate={createFromPage}
              onAddNote={startNoteFromPage}
              onOpenAnnotation={openAnnotation}
              noteJump={noteJump}
              onNoteJumpDone={finishNoteJump}
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
          fullScreen={fullScreen}
          onFitWidth={fitToWidth}
          onToggleFullScreen={toggleFullScreen}
          onZoomChange={changeZoom}
          reflowDisabled={!hasText}
          onToggleMode={toggleMode}
          onClose={onClose}
          onSeek={(p) => pagesRef.current?.scrollToPage(p)}
          onOpenGoTo={openGoToPage}
          onInteract={reveal}
          sidebarTab={sidebarTab}
          onSelectSidebarTab={setSidebarTab}
          notesOpen={notesSidebar.open}
          onToggleNotes={notesSidebar.toggle}
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
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
        >
          {sidebarTab === 'thumbnails' ? (
            <ThumbnailsView
              pdf={pdf}
              total={pdf.numPages}
              currentPage={currentPage}
              thumbWidth={getThumbnailWidth(sidebarWidth)}
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
      {notesSidebar.open && <NotesSidebar state={notesSidebar} noteDraft={noteDraft} readingPage={currentPage} editActions={editActions} onJump={jumpToNote} />}
      <ReaderToast notice={notice} onDone={clearNotice} />
    </div>
  );
}