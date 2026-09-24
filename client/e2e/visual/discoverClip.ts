import type { Locator, Page } from '@playwright/test';

/**
 * CLIENT-SESSION-31: page-coordinate clip covering `container` *and* an open popover, for the
 * Discover visual specs' popover states. A Discover filter's popover is portaled outside the
 * region/dialog it belongs to (to `<body>` on the panel; into the dialog's own Content node inside
 * the modal, where it can overhang the dialog's box), so neither a bare region nor a bare dialog
 * screenshot frames it. A full-page or viewport screenshot would frame it but drag unrelated page
 * chrome (rail, cards, top bar) into the baseline, churning it whenever that chrome changes.
 *
 * Page coordinates (viewport box + scroll offset), because the specs pass this to
 * `toHaveScreenshot({ fullPage: true, clip })`. The scroll offset is added *before* taking the
 * union — opening a popover can scroll the page, leaving the container's top above the viewport
 * (a negative viewport y), and clamping that to 0 first would crop the container's top off.
 */
export async function clipAround(
  page: Page,
  container: Locator,
  popover: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const containerBox = await container.boundingBox();
  const popoverBox = await popover.boundingBox();
  if (!containerBox || !popoverBox) {
    throw new Error('clipAround: container or popover is not rendered');
  }
  // String form, like every other `page.evaluate` in e2e/: this tsconfig has no DOM lib.
  const scroll = (await page.evaluate('({ x: window.scrollX, y: window.scrollY })')) as {
    x: number;
    y: number;
  };
  const boxes = [containerBox, popoverBox].map((box) => ({
    left: box.x + scroll.x,
    top: box.y + scroll.y,
    right: box.x + scroll.x + box.width,
    bottom: box.y + scroll.y + box.height,
  }));
  const left = Math.max(0, Math.min(...boxes.map((b) => b.left)));
  const top = Math.max(0, Math.min(...boxes.map((b) => b.top)));
  const right = Math.max(...boxes.map((b) => b.right));
  const bottom = Math.max(...boxes.map((b) => b.bottom));
  return {
    x: Math.floor(left),
    y: Math.floor(top),
    width: Math.ceil(right - left),
    height: Math.ceil(bottom - top),
  };
}

/**
 * Waits for web fonts *and* every `<img>` (sport icons on the session cards) to finish loading. The
 * other visual specs only await `document.fonts.ready`; an icon still in flight renders as a blank
 * circle and made the first local Discover frames non-deterministic.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(
    `Promise.all([
      document.fonts.ready,
      ...Array.from(document.images).map((img) =>
        img.complete ? null : new Promise((resolve) => { img.onload = img.onerror = resolve; }),
      ),
    ])`,
  );
}

/**
 * Pins the initial `GET /sessions/discover/counts` to the frozen clock's "today". With no `date`
 * param the client relies on the server's own default window (today + 7 days), but the mock server
 * computes that from the *real* clock while these specs freeze the browser's — so "today" was never
 * in the returned window and the section header rendered "Today (0)" above a visible card. Adding the
 * explicit `date` makes the mock echo it, as the real backend would report today's count.
 */
export async function pinDiscoverCountsToDate(page: Page, isoDate: string): Promise<void> {
  await page.route('**/api/sessions/discover/counts**', async (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has('date')) url.searchParams.set('date', isoDate);
    await route.continue({ url: url.toString() });
  });
}
