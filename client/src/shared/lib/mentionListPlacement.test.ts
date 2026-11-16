import { afterEach, describe, expect, it, vi } from 'vitest';
import { listStyle, measureCaret, sameAnchor, type CaretAnchor } from './mentionListPlacement';

// CLIENT-GL-50 part 3: the `@` list opens at the caret. jsdom has no layout, so the rectangles are stubbed.

const anchor: CaretAnchor = {
  left: 100,
  top: 20,
  bottom: 38,
  wrapWidth: 400,
  wrapHeight: 60,
  viewportTop: 220,
  viewportBottom: 238,
};

/** jsdom's Range has no `getClientRects`: give it one for the test. */
function stubRects(rects: unknown[]) {
  Object.defineProperty(Range.prototype, 'getClientRects', { value: () => rects, configurable: true, writable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Range.prototype, 'getClientRects');
});

describe('listStyle', () => {
  it('has no style without an anchor (the list stays under the box)', () => {
    expect(listStyle(null, 3)).toBeUndefined();
  });

  it('opens just below the caret, at its left, and never wider than what is left of the box', () => {
    vi.stubGlobal('innerHeight', 800);
    expect(listStyle(anchor, 3)).toEqual({ left: 100, top: 42, maxWidth: 'min(18rem, calc(100% - 100px))' });
  });

  it('keeps room for the narrowest list when the caret is near the right edge', () => {
    vi.stubGlobal('innerHeight', 800);
    expect(listStyle({ ...anchor, left: 390 }, 2)?.left).toBe(272);
    expect(listStyle({ ...anchor, left: 5, wrapWidth: 90 }, 2)?.left).toBe(0);
  });

  it('flips above the caret when there is no room below and there is room above', () => {
    vi.stubGlobal('innerHeight', 260);
    const style = listStyle(anchor, 5);
    expect(style).toMatchObject({ bottom: 60 - 20 + 4 });
    expect(style).not.toHaveProperty('top');
  });

  it('stays below when there is no room above either', () => {
    vi.stubGlobal('innerHeight', 260);
    const style = listStyle({ ...anchor, viewportTop: 40, viewportBottom: 58 }, 5);
    expect(style).toMatchObject({ top: 42 });
  });

  it('a short list needs less room than a full one before it flips', () => {
    vi.stubGlobal('innerHeight', 300);
    expect(listStyle(anchor, 1)).toHaveProperty('top');
    expect(listStyle(anchor, 5)).toHaveProperty('bottom');
  });
});

describe('measureCaret', () => {
  function setup() {
    const wrap = document.createElement('div');
    const text = document.createTextNode('hello @ab');
    wrap.appendChild(text);
    document.body.appendChild(wrap);
    vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue({ left: 50, top: 200, width: 300, height: 60 } as DOMRect);
    const range = document.createRange();
    range.setStart(text, 9);
    range.collapse(true);
    const selection = window.getSelection() as Selection;
    selection.removeAllRanges();
    selection.addRange(range);
    return { wrap };
  }

  it('anchors at the right edge of the character before the caret, relative to the box', () => {
    const { wrap } = setup();
    stubRects([{ left: 140, right: 148, top: 210, bottom: 228, width: 8, height: 18 }]);
    expect(measureCaret(wrap)).toEqual({
      left: 98,
      top: 10,
      bottom: 28,
      wrapWidth: 300,
      wrapHeight: 60,
      viewportTop: 210,
      viewportBottom: 228,
    });
    wrap.remove();
  });

  it('has no anchor where nothing can be measured (no layout)', () => {
    const { wrap } = setup();
    stubRects([]);
    expect(measureCaret(wrap)).toBeNull();
    wrap.remove();
  });

  it('has no anchor without a box or a selection', () => {
    expect(measureCaret(null)).toBeNull();
    window.getSelection()?.removeAllRanges();
    expect(measureCaret(document.createElement('div'))).toBeNull();
  });
});

describe('sameAnchor', () => {
  it('compares every field, and two nulls are the same', () => {
    expect(sameAnchor(null, null)).toBe(true);
    expect(sameAnchor(anchor, null)).toBe(false);
    expect(sameAnchor(anchor, { ...anchor })).toBe(true);
    expect(sameAnchor(anchor, { ...anchor, viewportBottom: 239 })).toBe(false);
  });
});
