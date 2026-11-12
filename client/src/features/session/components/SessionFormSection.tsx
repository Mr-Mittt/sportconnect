import { IconCheck, IconPencil, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/shared/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { cn } from '@/shared/lib/utils';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import type { MissingField } from '../sessionReadiness';

/** What a section can be missing: a piece needed to schedule, or (the Who section of the create form) the
 * open slot, which is needed to create at all. */
export type SectionMissing = MissingField | 'openSlot';

/** How long the un-collapse border flick lasts (matches the `section-flick` animation in `index.css`). */
const FLICK_MS = 1000;

interface SessionFormSectionProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is still needed to schedule that this section owns; renders the amber "Missing: ..." chip. */
  missing?: SectionMissing[];
  /** Shown under the header while the section is collapsed (`field: value` pairs). */
  summary?: ReactNode;
  /** Header right-hand side: the Edit button, or Save and Discard while editing. */
  actions?: ReactNode;
  /** Highlights the section that is being edited. */
  isEditing?: boolean;
  /** Detail modal only: scroll the modal body so the whole section is visible once it opens. */
  scrollIntoViewOnOpen?: boolean;
  /**
   * Also scroll when the section *mounts* already open. Only for a section that is remounted open on
   * purpose (the detail modal remounts a section when its Edit starts). Never for the create form: its
   * sections all mount open, and scrolling each into view on mount would leave it on the last one.
   */
  scrollIntoViewOnMount?: boolean;
  /**
   * `false`: not collapsible — the section is a static block: its title, the amber "Missing: ..." chip and
   * the `field: value` summary, always shown, with no toggle, no body and no actions. The detail modal
   * uses this for everyone who cannot edit the session (a viewer, or the host once it is no longer
   * Preparing); only the create form and a host's Preparing session get collapsible sections.
   */
  collapsible?: boolean;
  children: ReactNode;
}

/**
 * CLIENT-SESSION-34: one of the form's sections — a collapsible block with a header (title, the amber
 * "Missing: ..." chip, and an optional actions slot) and, while collapsed, a `field: value` summary
 * row. Shared by the create form (open by default, no actions) and the detail modal (collapsed by
 * default, Edit / Save / Discard in the header). The chip is information, not an error: amber tokens
 * and text that carries the meaning on its own.
 *
 * `scrollIntoViewOnOpen` keeps the whole section on screen when it opens near the bottom of the
 * modal's scrolling body (`block: 'nearest'`: no movement when it already fits, the minimum otherwise;
 * a section taller than the body aligns its top). It only runs on a close -> open change (a mount that is
 * already open counts), and is skipped where `scrollIntoView` doesn't exist (jsdom).
 */
export function SessionFormSection({
  title,
  open,
  onOpenChange,
  missing = [],
  summary,
  actions,
  isEditing = false,
  scrollIntoViewOnOpen = false,
  scrollIntoViewOnMount = false,
  collapsible = true,
  children,
  i18nOverridePrefix,
}: SessionFormSectionProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const rootRef = useRef<HTMLDivElement>(null);
  // A section that mounts open counts as "was open" (no scroll on first render) unless it asked to scroll
  // on mount — the create form opens with every section open and must stay on top.
  const wasOpen = useRef(scrollIntoViewOnMount ? false : open);

  // The border flicks for a second each time the section is un-collapsed (same on-mount rule as the scroll).
  const [isFlicking, setIsFlicking] = useState(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      if (scrollIntoViewOnOpen) {
        const element = rootRef.current;
        if (element !== null && typeof element.scrollIntoView === 'function') {
          element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
      setIsFlicking(true);
    }
    wasOpen.current = open;
  }, [open, scrollIntoViewOnOpen]);

  useEffect(() => {
    if (!isFlicking) return;
    const timer = window.setTimeout(() => setIsFlicking(false), FLICK_MS);
    return () => window.clearTimeout(timer);
  }, [isFlicking]);

  const chip =
    missing.length > 0 ? (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-medium text-amber-800">
        {t('form.missing', {
          list: missing.map((field) => t(`form.missingItem.${field}`)).join(', '),
        })}
      </span>
    ) : null;

  if (!collapsible) {
    return (
      <div className="border-hairline shrink-0 overflow-hidden rounded-xl border-border">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 bg-surface-1 px-3 py-2 text-2xs font-semibold text-text-secondary">
          <span>{title}</span>
          {chip}
        </div>
        {summary !== undefined && <div className="px-3 py-2">{summary}</div>}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        // `shrink-0`: the create form's body is a scrolling flex column, and `overflow-hidden` lets a flex
        // item shrink below its content — without it the sections squash and overlap instead of scrolling.
        'border-hairline shrink-0 overflow-hidden rounded-xl border-border',
        isEditing && 'border-border-accent',
        isFlicking && 'section-flick',
      )}
    >
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <div className="flex items-center gap-2 bg-surface-1 pr-2">
          <CollapsibleTrigger className="min-w-0 flex-1 justify-start gap-2 rounded-none px-3 py-2 text-2xs font-semibold text-text-secondary">
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <span>{title}</span>
              {chip}
            </span>
          </CollapsibleTrigger>
          {actions !== undefined && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
        {!open && summary !== undefined && <div className="px-3 py-2">{summary}</div>}
        <CollapsibleContent>
          <div className="flex flex-col gap-3 px-3 py-3">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export interface SectionSummaryItem {
  label: string;
  /** `null`, `undefined` or an empty string renders as the amber "..." placeholder. */
  value: ReactNode | null | undefined;
}

/**
 * The collapsed section's `field: value` row (a wrapping flex row; a missing value reads "...",
 * in the amber warning colour; no items at all reads "..." too, so the row is never blank). Presentational.
 */
export function SectionSummary({ items }: { items: SectionSummaryItem[] }) {
  // A section with no field to list (e.g. a sport whose schema has no available attribute) still shows
  // its summary row: just the placeholder.
  if (items.length === 0) return <span className="text-2xs text-amber-800 italic">...</span>;
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-0.5 text-2xs text-text-primary">
      {items.map((item) => {
        const isMissing = item.value === null || item.value === undefined || item.value === '';
        return (
          <span key={item.label}>
            <span className="text-text-muted">{item.label}:</span>{' '}
            {isMissing ? <span className="text-amber-800 italic">...</span> : item.value}
          </span>
        );
      })}
    </div>
  );
}

/** One header button: icon always, text from `sm` up (icon-only at 375px, with its `aria-label`). */
function SectionActionButton({
  label,
  icon,
  onClick,
  disabled,
  primary = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={primary ? 'primary' : 'outline'}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="h-7 gap-1 rounded-full px-2 sm:px-3"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

interface SectionEditActionsProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  mode: 'view' | 'edit';
  /** Host on a PREPARING session; without it nothing renders in view mode. */
  canEdit: boolean;
  /** Another section is being edited — Edit stays visible but disabled. */
  editDisabled: boolean;
  isSaving: boolean;
  /** Edit mode: Save is disabled while nothing changed or the draft is invalid. */
  canSave: boolean;
  onEdit: () => void;
  onSave: () => void;
  onDiscard: () => void;
}

/**
 * CLIENT-SESSION-34: the detail modal's section header actions — an Edit button in view mode (only
 * for the host of a PREPARING session), replaced in the same spot by Discard and Save in edit mode.
 * Icon-only below `sm` (every button has an `aria-label`).
 */
export function SectionEditActions({
  mode,
  canEdit,
  editDisabled,
  isSaving,
  canSave,
  onEdit,
  onSave,
  onDiscard,
  i18nOverridePrefix,
}: SectionEditActionsProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  if (mode === 'edit') {
    return (
      <>
        <SectionActionButton
          label={t('form.discard')}
          icon={<IconX className="size-3.5" aria-hidden="true" />}
          onClick={onDiscard}
          disabled={isSaving}
        />
        <SectionActionButton
          primary
          label={isSaving ? t('form.saving') : t('form.save')}
          icon={<IconCheck className="size-3.5" aria-hidden="true" />}
          onClick={onSave}
          disabled={!canSave || isSaving}
        />
      </>
    );
  }
  if (!canEdit) return null;
  return (
    <SectionActionButton
      label={t('form.edit')}
      icon={<IconPencil className="size-3.5" aria-hidden="true" />}
      onClick={onEdit}
      disabled={editDisabled}
    />
  );
}
