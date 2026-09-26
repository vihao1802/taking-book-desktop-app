import { useState } from 'react';
import type { Annotation, BookFile } from '../shared/types';
import { AddPdfFab } from './components/AddPdfFab';
import { ImportNotice } from './components/ImportNotice';
import { NavRail, type View } from './components/NavRail';
import { Favorites } from './favorites/Favorites';
import { Home } from './home/Home';
import { Library } from './library/Library';
import { LibraryProvider } from './library/LibraryProvider';
import { NotesView } from './notes/NotesView';
import { Reader } from './reader/Reader';
import { Settings } from './settings/Settings';
import { Statistics } from './statistics/Statistics';
import { ThemeProvider } from './theme';

export function App() {
  const [file, setFile] = useState<BookFile | null>(null);
  // A Note chosen in the Notes view, which the reader opens the book at; null for every other way of opening a book.
  const [noteToOpen, setNoteToOpen] = useState<Annotation | null>(null);
  const [view, setView] = useState<View>('home');

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

  if (file) {
    return (
      <ThemeProvider>
        <Reader key={file.id} file={file} noteToOpen={noteToOpen} onClose={closeReader} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
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
          </main>
        </div>
      </LibraryProvider>
    </ThemeProvider>
  );
}