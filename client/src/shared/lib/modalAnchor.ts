import { createContext, useContext, useEffect, useState, type RefObject } from 'react';

/**
 * Viewport-relative bottom edge (px) of the page element every modal on the
 * current page should appear below (user decision) — the sport pill row on
 * Home Feed, the group pill row on the Groups page (specifically the pill
 * row, even when the group cover banner also renders underneath it — a
 * group's own `GroupsPage` tracks that banner separately for unrelated
 * sizing, not for this). `null` means "no page-level anchor configured" —
 * `DialogContent` falls back to its default centered position, so any modal
 * used outside one of these pages is unaffected.
 */
const ModalAnchorContext = createContext<number | null>(null);

export const ModalAnchorProvider = ModalAnchorContext.Provider;

export function useModalAnchor(): number | null {
  return useContext(ModalAnchorContext);
}

/**
 * Measures an element's viewport-relative bottom edge, re-measuring on
 * resize/scroll/content-size changes (the anchor's height can change — e.g.
 * SportSwitcher's pills wrapping to a second line at narrow widths, or
 * GroupCoverBanner's height once its group data loads in).
 */
export function useAnchorBottom(ref: RefObject<HTMLElement | null>): number | null {
  const [bottom, setBottom] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => setBottom(element.getBoundingClientRect().bottom);
    update();

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(element);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [ref]);

  return bottom;
}
