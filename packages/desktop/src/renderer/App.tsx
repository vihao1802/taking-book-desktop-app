import { useState } from 'react';
import type { BookFile } from '../shared/types';
import { Library } from './library/Library';
import { Reader } from './reader/Reader';
import { ThemeProvider } from './theme';

export function App() {
  const [file, setFile] = useState<BookFile | null>(null);

  return (
    <ThemeProvider>
      {file ? (
        <Reader key={file.id} file={file} onClose={() => setFile(null)} />
      ) : (
        <Library onOpen={(f) => setFile(f)} />
      )}
    </ThemeProvider>
  );
}
