import { IconX } from '@tabler/icons-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as React from 'react';
import { cn } from '@/shared/lib/utils';
import { useModalAnchor } from '@/shared/lib/modalAnchor';

/** Gap (px) between the page anchor's bottom edge and an anchored modal's top edge. */
const ANCHOR_GAP_PX = 12;
/** Bottom margin (px) kept clear below an anchored modal, same visual breathing room as the default centered position. */
const ANCHOR_BOTTOM_MARGIN_PX = 16;
/** Fixed height for modals whose content amount varies a lot (CommentSection, JoinGroupModal — user decision). */
const FIXED_HEIGHT_VH = 60;

/*
 * shadcn/ui-style Dialog (Radix), hand-written (not CLI-generated — same
 * reasoning as dropdown-menu.tsx/AUTH-1's summary: the CLI writes to a
 * broken path on Windows) and restyled to the design tokens. Radix owns
 * focus trapping, Escape/outside-click dismissal, and scroll locking.
 */
function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn('fixed inset-0 z-50 bg-overlay', className)}
      {...props}
    />
  );
}

interface DialogContentProps extends React.ComponentProps<typeof DialogPrimitive.Content> {
  /**
   * Fixed (not shrink-to-fit) height at `60vh` by default, for modals whose content amount
   * varies a lot — CommentSection, SessionDetailModal, and JoinGroupModal (user decision). Every
   * other modal keeps shrinking to fit its content, up to whatever ceiling applies (the anchored
   * available space, or `85vh` when centered).
   */
  fixedHeight?: boolean;
  /**
   * Override the `60vh` default (e.g. CommentSection/SessionDetailModal at `72` — 20% taller,
   * user decision). No effect unless `fixedHeight` is also set.
   */
  fixedHeightVh?: number;
}

function DialogContent({
  className,
  children,
  style,
  fixedHeight = false,
  fixedHeightVh = FIXED_HEIGHT_VH,
  ...props
}: DialogContentProps) {
  // Page-level anchor (user decision) — Home Feed positions modals below the
  // sport pill row, Groups below the group pill row specifically (even when
  // a group's cover banner also renders underneath it). `null` outside those
  // pages' `ModalAnchorProvider`, which keeps today's viewport-centered
  // position.
  const anchorBottom = useModalAnchor();
  // The anchor row can scroll out of the viewport if the caller scrolled the page before opening
  // a modal — anchorBottom then goes negative (found live: a rail "View details" click after
  // scrolling past the sport switcher), and positioning a `position: fixed` modal from it would
  // render the whole modal off-screen above the viewport, Close button included. Falls back to
  // the same centered treatment used when there's no anchor configured at all — the anchoring
  // context is equally unavailable either way, and this reuses an already-correct code path
  // instead of inventing a new "pinned near top" state. (anchorBottom > window.innerHeight is
  // the symmetric case — the anchor pushed below the viewport — included for completeness, not
  // reachable in practice today since the sport switcher/group pill row sit at the top of the
  // page layout and can only scroll up, never down, from their initial position.)
  const anchored = anchorBottom !== null && anchorBottom > 0 && anchorBottom < window.innerHeight;

  let computedStyle: React.CSSProperties | undefined;
  if (anchored) {
    const top = anchorBottom + ANCHOR_GAP_PX;
    const available = `calc(100vh - ${top}px - ${ANCHOR_BOTTOM_MARGIN_PX}px)`;
    computedStyle = {
      top,
      // Fixed height is still capped by the space actually available below
      // the anchor, so it can never push past the viewport bottom.
      ...(fixedHeight ? { height: `min(${fixedHeightVh}vh, ${available})` } : { maxHeight: available }),
    };
  } else if (fixedHeight) {
    computedStyle = { height: `${fixedHeightVh}vh` };
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        style={{ ...computedStyle, ...style }}
        className={cn(
          // `max-w-md` (448px) is the default; CommentSection/SessionDetailModal override it via
          // `className="max-w-[35rem]"` (25% wider, user decision) — `cn()`'s tailwind-merge
          // correctly drops the base `max-w-md` when a caller's `className` sets another
          // max-width, same mechanism `fixedHeightVh` uses for height.
          'shadow-card fixed left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col overflow-hidden rounded-xl border-hairline border-border-strong bg-surface-2',
          !anchored && 'top-1/2 -translate-y-1/2',
          !anchored && !fixedHeight && 'max-h-[85vh]',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/**
 * Radix requires an accessible Title somewhere in Content — visually
 * stylable, or pass `className="sr-only"` when a consumer's own header
 * markup (e.g. CommentSection's post-context header) already conveys the
 * dialog's purpose visually and a plain title would be redundant.
 */
function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-sm font-semibold text-text-primary', className)}
      {...props}
    />
  );
}

function DialogClose({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      className={cn(
        'cursor-pointer rounded p-1 text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
        className,
      )}
      {...props}
    >
      <IconX className="size-4" aria-hidden="true" />
    </DialogPrimitive.Close>
  );
}

interface DialogHeaderProps {
  title: React.ReactNode;
  /** Applied to the header row itself — each modal's own border/padding treatment. */
  className?: string;
  /** Extra behavior beyond dismissing the dialog (e.g. SettingsUnsavedChangesDialog's onCancel). */
  onCloseClick?: () => void;
}

/**
 * Every modal's header, centered (user decision) — a 3-column grid (empty
 * spacer / centered title / close button) rather than `justify-between`,
 * which only looked centered by accident when the close button happened to
 * be the sole element on the right. Not used by `CommentSection`, whose
 * header shows post author/avatar/timestamp rather than a single title —
 * this component doesn't fit that shape.
 */
function DialogHeader({ title, className, onCloseClick }: DialogHeaderProps) {
  return (
    <div className={cn('grid grid-cols-[1fr_auto_1fr] items-center', className)}>
      <span aria-hidden="true" />
      <DialogTitle className="text-center">{title}</DialogTitle>
      <DialogClose aria-label="Close" className="justify-self-end" onClick={onCloseClick} />
    </div>
  );
}

export { Dialog, DialogContent, DialogTitle, DialogClose, DialogHeader };
