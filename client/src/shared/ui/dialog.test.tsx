import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalAnchorProvider } from '@/shared/lib/modalAnchor';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog';

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

  it('stays centered when `centered` is set, even with an in-viewport anchor', () => {
    render(
      <ModalAnchorProvider value={120}>
        <Dialog open onOpenChange={() => {}}>
          <DialogContent centered>
            <DialogHeader title="Test dialog" />
          </DialogContent>
        </Dialog>
      </ModalAnchorProvider>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.top).toBe('');
    expect(dialog.className).toContain('top-1/2');
    expect(dialog.className).toContain('-translate-y-1/2');
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

describe('DialogTitle (every dialog title is centered by default, owner rule 2026-11-13)', () => {
  it('is centered without any class from the caller', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>
          <DialogTitle>A plain title</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText('A plain title').classList.contains('text-center')).toBe(true);
  });

  it('DialogHeader centers its title too', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader title="Header title" />
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText('Header title').classList.contains('text-center')).toBe(true);
  });
});

describe('DialogContent insets (a dialog that leaves the dialog underneath its title bar and footer in view)', () => {
  beforeEach(() => {
    vi.stubGlobal('innerHeight', 800);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderInset(anchorBottom: number | null) {
    return render(
      <ModalAnchorProvider value={anchorBottom}>
        <Dialog open onOpenChange={() => {}}>
          <DialogContent fixedHeight fixedHeightVh={72} insetTop="4rem" insetBottom="3rem">
            <DialogTitle>Inset</DialogTitle>
          </DialogContent>
        </Dialog>
      </ModalAnchorProvider>,
    );
  }

  it('centered: the same 72vh box minus both insets, shifted by half their difference', () => {
    renderInset(null);
    const dialog = screen.getByRole('dialog');
    // jsdom re-serializes calc(), so check the pieces (the real box is measured in the e2e)
    expect(dialog.style.height).toContain('72vh');
    expect(dialog.style.height).toContain('4rem');
    expect(dialog.style.height).toContain('3rem');
    // (4rem - 3rem) / 2, which jsdom folds into 0.5rem
    expect(dialog.style.marginTop).toBe('calc(0.5rem)');
  });

  it('anchored: starts the top inset below the dialog underneath and is capped by the space left, like it', () => {
    renderInset(120);
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.top).toBe('132px');
    expect(dialog.style.marginTop).toBe('4rem');
    expect(dialog.style.height).toContain('72vh');
    expect(dialog.style.height).toContain('4rem');
    expect(dialog.style.height).toContain('3rem');
  });

  it('without insets the height is unchanged', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent fixedHeight fixedHeightVh={72}>
          <DialogTitle>Plain</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole('dialog').style.height).toBe('72vh');
  });
});
