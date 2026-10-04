import { useCallback, useEffect, useState } from 'react';
import type { Annotation, BookFile } from '@/reader-api';
import { AddPdfFab } from './components/AddPdfFab';
import { DropOverlay } from './components/DropOverlay';
import { ImportNotice } from './components/ImportNotice';
import { NavRail, type View } from './components/NavRail';
import { UpdateNotice } from './components/UpdateNotice';
import { Favorites } from './favorites/Favorites';
import { FocusProvider } from './focus/FocusProvider';
import { Home } from './home/Home';
import { Library } from './library/Library';
import { LibraryProvider } from './library/LibraryProvider';
import { NotesView } from './notes/NotesView';
import { Reader } from './reader/Reader';
import { Settings } from './settings/Settings';
import { Statistics } from './statistics/Statistics';
import { ThemeProvider } from './theme';
import { useCapabilities } from './lib/useCapabilities';
import { useWindowSizeClass } from './lib/useWindowSizeClass';
import { cn } from './lib/utils';
import { useUpdateCheck } from './updates/useUpdateCheck';

export function App() {
  const { dropImport } = useCapabilities();
  const [file, setFile] = useState<BookFile | null>(null);
  // A Note chosen in the Notes view, which the reader opens the book at; null for every other way of opening a book.
  const [noteToOpen, setNoteToOpen] = useState<Annotation | null>(null);
  // A Quiz question's source page, which the reader opens the book at; null for every other way of opening a book.
  const [pageToOpen, setPageToOpen] = useState<number | null>(null);
  // At compact the navigation is a bar below the content instead of a rail beside it.
  const isBottomBar = useWindowSizeClass() === 'compact';
  const [view, setView] = useState<View>('home');
  // Checked here, above the Reader branch, so opening and closing a Book neither re-checks nor brings back a dismissed notice.
  const updateCheck = useUpdateCheck();

  const navigate = (next: View) => {
    setView(next);
    window.scrollTo(0, 0);
  };

  const openBookAtNote = (book: BookFile, note: Annotation) => {
    setNoteToOpen(note);
    setFile(book);
  };
  const openBookAtPage = (book: BookFile, page?: number) => {
    setPageToOpen(page ?? null);
    setFile(book);
  };
  const closeReader = useCallback(() => {
    setFile(null);
    setNoteToOpen(null);
    setPageToOpen(null);
  }, []);

  // Stable, because the Library provider re-runs its share import whenever this changes.
  const showLibrary = useCallback(() => {
    setView('library');
    window.scrollTo(0, 0);
  }, []);

  // Files shared from another app are imported by the Library, which a Book that is open hides: close it first.
  useEffect(() => window.api.onSharedFiles(closeReader), [closeReader]);

  // The providers sit above both branches: the Focus timer belongs to the app,
  // so opening or leaving a Book must not remount it.
  return (
    <ThemeProvider>
      <FocusProvider>
        {file ? (
          <Reader key={file.id} file={file} noteToOpen={noteToOpen} pageToOpen={pageToOpen} onClose={closeReader} />
        ) : (
          <LibraryProvider onSharedFilesReceived={showLibrary}>
            <div className={cn('bg-background flex h-full overflow-hidden', isBottomBar && 'flex-col-reverse')}>
              <NavRail current={view} onNavigate={navigate} />
              <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                {view === 'home' ? (
                  <Home onOpen={setFile} onNavigate={navigate} />
                ) : view === 'library' ? (
                  <Library onOpen={openBookAtPage} />
                ) : view === 'favorites' ? (
                  <Favorites onOpen={setFile} onNavigate={navigate} />
                ) : view === 'notes' ? (
                  <NotesView onOpenNote={openBookAtNote} />
                ) : view === 'statistics' ? (
                  <Statistics onOpen={setFile} />
                ) : (
                  <Settings />
                )}
                <AddPdfFab onOpen={setFile} />
                <ImportNotice onOpen={setFile} />
                {/* Settings has its own About & updates section, which the floating notice would cover. */}
                {view !== 'settings' && <UpdateNotice {...updateCheck} />}
                {dropImport && <DropOverlay />}
              </main>
            </div>
          </LibraryProvider>
        )}
      </FocusProvider>
    </ThemeProvider>
  );
}
