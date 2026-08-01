import type { BookFile, BookStatus, LastPosition, OpenFileResult, Result, Theme } from '@taking-book/core';

/** Contract exposed on window.api by the preload bridge. */
export interface ReaderApi {
  openFile(): Promise<Result<OpenFileResult | null>>;
  getLastPosition(id: number): Promise<Result<LastPosition | null>>;
  saveLastPosition(id: number, page: number, position: number): Promise<Result<void>>;
  listFiles(): Promise<Result<BookFile[]>>;
  setFileStatus(id: number, status: BookStatus): Promise<Result<void>>;
  setFileTags(id: number, tags: string[]): Promise<Result<void>>;
  getTheme(): Promise<Result<Theme>>;
  setTheme(theme: Theme): Promise<Result<void>>;
}

export type { BookFile, BookStatus, LastPosition, OpenFileResult, Result, Theme };
