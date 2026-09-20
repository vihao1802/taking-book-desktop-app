const FLASH_CLASS = 'tb-note-flash';

/**
 * Plays the one-second Note flash on the given highlight elements. It works on
 * the DOM directly instead of through React state because the flash is a
 * transient effect on elements React keeps mounted: routing it through state
 * would re-render the whole reflow article for something that never changes
 * what is on the page. Calling it again on a flashing element restarts it.
 */
export function flashHighlight(elements: Iterable<Element>): void {
  for (const element of elements) {
    element.classList.remove(FLASH_CLASS);
    // Reading a layout property forces the removal to apply, so re-adding the
    // class starts the animation from its first frame instead of being a no-op.
    void (element as HTMLElement).offsetWidth;
    element.classList.add(FLASH_CLASS);
    element.addEventListener('animationend', () => element.classList.remove(FLASH_CLASS), { once: true });
  }
}
