import type { CSSProperties } from 'react';

// CLIENT-GL-50: where the `@` list of a `MentionInput` opens: at the caret.

/** Where the caret is, measured from the box (px), plus what a flip above needs. */
export interface CaretAnchor {
  left: number;
  top: number;
  bottom: number;
  wrapWidth: number;
  wrapHeight: number;
  viewportTop: number;
  viewportBottom: number;
}

const LIST_ROW_PX = 32;
const LIST_MAX_PX = 160;
const LIST_MIN_WIDTH_PX = 128;
const LIST_GAP_PX = 4;

/**
 * The caret's place for the `@` list. The rectangle of the character before the caret is the reliable one (a collapsed
 * range at an element boundary has none); without a layout engine (jsdom) there is no anchor and the list sits under
 * the box as before.
 */
export function measureCaret(wrap: HTMLElement | null): CaretAnchor | null {
  const selection = window.getSelection();
  if (wrap === null || selection === null || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!range.collapsed || typeof range.getClientRects !== 'function') return null;
  let left: number | null = null;
  let top = 0;
  let bottom = 0;
  if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
    const before = document.createRange();
    before.setStart(range.startContainer, range.startOffset - 1);
    before.setEnd(range.startContainer, range.startOffset);
    const rect = before.getClientRects()[0];
    if (rect !== undefined && rect.height > 0) {
      left = rect.right;
      top = rect.top;
      bottom = rect.bottom;
    }
  }
  if (left === null) {
    const rect = range.getClientRects()[0];
    if (rect === undefined || (rect.height === 0 && rect.width === 0)) return null;
    left = rect.left;
    top = rect.top;
    bottom = rect.bottom;
  }
  const box = wrap.getBoundingClientRect();
  return {
    left: left - box.left,
    top: top - box.top,
    bottom: bottom - box.top,
    wrapWidth: box.width,
    wrapHeight: box.height,
    viewportTop: top,
    viewportBottom: bottom,
  };
}

export function sameAnchor(a: CaretAnchor | null, b: CaretAnchor | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.bottom === b.bottom &&
    a.wrapWidth === b.wrapWidth &&
    a.wrapHeight === b.wrapHeight &&
    a.viewportTop === b.viewportTop &&
    a.viewportBottom === b.viewportBottom
  );
}

/** The list at the caret: just below it, or above it when there is no room below; never past the right edge of the box. */
export function listStyle(anchor: CaretAnchor | null, rows: number): CSSProperties | undefined {
  if (anchor === null) return undefined;
  const height = Math.min(rows * LIST_ROW_PX + LIST_GAP_PX, LIST_MAX_PX);
  const left = Math.max(0, Math.min(anchor.left, anchor.wrapWidth - LIST_MIN_WIDTH_PX));
  const flip =
    window.innerHeight - anchor.viewportBottom < height + LIST_GAP_PX && anchor.viewportTop > height + LIST_GAP_PX;
  return {
    left,
    maxWidth: `min(18rem, calc(100% - ${left}px))`,
    ...(flip ? { bottom: anchor.wrapHeight - anchor.top + LIST_GAP_PX } : { top: anchor.bottom + LIST_GAP_PX }),
  };
}
