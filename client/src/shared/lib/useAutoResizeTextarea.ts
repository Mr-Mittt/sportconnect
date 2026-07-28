import { useLayoutEffect, useRef } from 'react';

const DEFAULT_MAX_HEIGHT_PX = 120;

/**
 * Grows a textarea's height to fit its content as the user types (up to
 * maxHeightPx, beyond which it scrolls internally instead of growing
 * further) — re-measures whenever `value` changes, including an external
 * reset (e.g. clearing the draft after sending shrinks it back to one line).
 */
export function useAutoResizeTextarea(value: string, maxHeightPx = DEFAULT_MAX_HEIGHT_PX) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = 'auto';
    const nextHeight = Math.min(node.scrollHeight, maxHeightPx);
    node.style.height = `${nextHeight}px`;
    node.style.overflowY = node.scrollHeight > maxHeightPx ? 'auto' : 'hidden';
  }, [value, maxHeightPx]);

  return textareaRef;
}
