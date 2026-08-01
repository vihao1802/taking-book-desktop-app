import { useMemo, useState } from 'react';
import type { BookFile, BookStatus } from '../../shared/types';
import { useLibrary } from './useLibrary';

const STATUS_OPTIONS: BookStatus[] = ['unread', 'reading', 'finished'];

export function Library({ onOpen }: { onOpen: (file: BookFile) => void }) {
  const { files, error, busy, addFile, setStatus, setTags } = useLibrary();
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        f.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [files, query]);

  const handleOpen = async () => {
    const file = await addFile();
    if (file) onOpen(file);
  };

  return (
    <div className="library">
      <header className="library-header">
        <h1 className="library-title">Library</h1>
        <div className="library-actions">
          <input
            className="library-search"
            type="search"
            placeholder="Search title or tag…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="library-add" onClick={handleOpen} disabled={busy}>
            {busy ? 'Adding…' : 'Add PDF'}
          </button>
        </div>
      </header>

      {error && <p className="library-error">{error}</p>}

      {visible.length === 0 ? (
        <div className="library-empty">
          <p>{files.length === 0 ? 'No books yet. Add a PDF to get started.' : 'No matches.'}</p>
        </div>
      ) : (
        <ul className="library-grid">
          {visible.map((file) => (
            <BookCard
              key={file.id}
              file={file}
              onOpen={() => onOpen(file)}
              onSetStatus={(status) => setStatus(file.id, status)}
              onSetTags={(tags) => setTags(file.id, tags)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function BookCard({
  file,
  onOpen,
  onSetStatus,
  onSetTags,
}: {
  file: BookFile;
  onOpen: () => void;
  onSetStatus: (status: BookStatus) => void;
  onSetTags: (tags: string[]) => void;
}) {
  const [draftTag, setDraftTag] = useState('');

  const commitTag = () => {
    const tag = draftTag.trim();
    setDraftTag('');
    if (tag && !file.tags.includes(tag)) onSetTags([...file.tags, tag]);
  };

  return (
    <li className="book-card">
      <button className="book-card-open" onClick={onOpen}>
        <span className="book-card-title">{file.title}</span>
      </button>

      <div className="book-card-meta">
        <select
          className="book-status"
          value={file.status}
          onChange={(e) => onSetStatus(e.target.value as BookStatus)}
          aria-label={`Status for ${file.title}`}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="book-tags">
        {file.tags.map((tag) => (
          <button
            key={tag}
            className="book-tag"
            onClick={() => onSetTags(file.tags.filter((t) => t !== tag))}
            title="Remove tag"
          >
            {tag}
          </button>
        ))}
        <form
          className="book-tag-form"
          onSubmit={(e) => {
            e.preventDefault();
            commitTag();
          }}
        >
          <input
            className="book-tag-input"
            value={draftTag}
            placeholder="+ tag"
            onChange={(e) => setDraftTag(e.target.value)}
            aria-label={`Add tag to ${file.title}`}
          />
        </form>
      </div>

      <p className="book-added">
        Added {new Date(file.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString()}
      </p>
    </li>
  );
}
