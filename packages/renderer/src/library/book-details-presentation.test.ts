import { describe, expect, it } from 'vitest';
import { getBookDetailsPresentation } from './book-details-presentation';

describe('getBookDetailsPresentation', () => {
  it('is a pane beside the list in the List view at expanded', () => {
    expect(getBookDetailsPresentation({ view: 'list', sizeClass: 'expanded' })).toBe('pane');
  });

  it.each(['compact', 'medium'] as const)('is a bottom sheet in the List view at %s', (sizeClass) => {
    expect(getBookDetailsPresentation({ view: 'list', sizeClass })).toBe('sheet');
  });

  it.each(['compact', 'medium', 'expanded'] as const)('is a bottom sheet in the Grid view at %s', (sizeClass) => {
    expect(getBookDetailsPresentation({ view: 'grid', sizeClass })).toBe('sheet');
  });
});
