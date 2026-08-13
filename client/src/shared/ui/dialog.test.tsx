import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalAnchorProvider } from '@/shared/lib/modalAnchor';
import { Dialog, DialogContent, DialogHeader } from './dialog';

/**
 * Regression coverage for the "modal renders off-screen" bug (CLIENT-SESSION-10 follow-up, found
 * live): `DialogContent`'s anchored positioning trusted `useAnchorBottom`'s value unconditionally,
 * so once the anchor (e.g. the sport switcher) scrolled above the viewport — a negative
 * `getBoundingClientRect().bottom` — the modal's `position: fixed; top: <negative>` rendered the
 * whole dialog, Close button included, above the visible viewport. Fixed by falling back to the
 * same centered treatment used when there's no anchor configured at all whenever the anchor isn't
 * currently within the viewport, rather than trusting an out-of-range value.
 */
function renderAnchoredDialog(anchorBottom: number | null) {
  return render(
    <ModalAnchorProvider value={anchorBottom}>
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader title="Test dialog" />
        </DialogContent>
      </Dialog>
    </ModalAnchorProvider>,
  );
}

describe('DialogContent anchored positioning', () => {
  beforeEach(() => {
    vi.stubGlobal('innerHeight', 800);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('anchors below the anchor row when its bottom edge is within the viewport', () => {
    renderAnchoredDialog(120);
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.top).toBe('132px'); // anchorBottom (120) + ANCHOR_GAP_PX (12)
    expect(dialog.className).not.toContain('top-1/2');
  });

  it('falls back to centered when the anchor has scrolled above the viewport (negative bottom)', () => {
    renderAnchoredDialog(-137);
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.top).toBe('');
    expect(dialog.className).toContain('top-1/2');
    expect(dialog.className).toContain('-translate-y-1/2');
  });

  it('falls back to centered when the anchor is (implausibly) below the viewport', () => {
    renderAnchoredDialog(900); // > the stubbed innerHeight (800)
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.top).toBe('');
    expect(dialog.className).toContain('top-1/2');
  });

  it('falls back to centered when there is no anchor configured (unchanged prior behavior)', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader title="Test dialog" />
        </DialogContent>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.top).toBe('');
    expect(dialog.className).toContain('top-1/2');
  });
});
