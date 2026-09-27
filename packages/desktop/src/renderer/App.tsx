import { useState } from 'react';
import type { Annotation, BookFile } from '../shared/types';
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
import { useUpdateCheck } from './updates/useUpdateCheck';

export function App() {
  const [file, setFile] = useState<BookFile | null>(null);
  // A Note chosen in the Notes view, which the reader opens the book at; null for every other way of opening a book.
  const [noteToOpen, setNoteToOpen] = useState<Annotation | null>(null);
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
  const closeReader = () => {
    setFile(null);
    setNoteToOpen(null);
  };

  // The providers sit above both branches: the Focus timer belongs to the app,
  // so opening or leaving a Book must not remount it.
  return (
    <ThemeProvider>
      <FocusProvider>
        {file ? (
          <Reader key={file.id} file={file} noteToOpen={noteToOpen} onClose={closeReader} />
        ) : (
          <LibraryProvider>
            <div className="bg-background flex h-full overflow-hidden">
              <NavRail current={view} onNavigate={navigate} />
              <main className="min-w-0 flex-1 overflow-y-auto">
                {view === 'home' ? (
                  <Home onOpen={setFile} onNavigate={navigate} />
                ) : view === 'library' ? (
                  <Library onOpen={setFile} />
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
                <DropOverlay />
              </main>
            </div>
          </LibraryProvider>
        )}
      </FocusProvider>
    </ThemeProvider>
  );
}
