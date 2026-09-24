import { Popover, PopoverContent } from '@/shared/ui/popover';
import { SESSION_STATUS_LABEL } from '@/shared/lib/sessionStatus';
import type { SessionStatus } from '@/shared/types/session';
import { DISCOVERABLE_STATUSES } from '../useDiscoverBaseFilters';
import { DiscoverFilterTrigger } from './DiscoverFilterTrigger';

interface DiscoverStatusFilterProps {
  selectedStatuses: SessionStatus[];
  onToggleStatus: (status: SessionStatus) => void;
}

/**
 * CLIENT-SESSION-29's Status filter — a plain checklist, same shell as `DiscoverLocationFilter`'s
 * favorites list. Only offers `PREPARING`/`SCHEDULED` (`DISCOVERABLE_STATUSES`): `/discover`
 * never returns `ONGOING` (silently stripped server-side, SESSION-37) and rejects
 * `COMPLETED`/`CANCELLED` outright (400) — every other status would be a checkbox that visibly
 * does nothing or breaks the query, so neither is offered. `[]` selected = no filter (server
 * default), same "empty means unfiltered" convention every other Discover filter here uses.
 *
 * **Single-select (2026-09-23 revision):** Preparing and Scheduled both mean "the server default"
 * when neither is picked, so `selectedStatuses` only ever holds 0 or 1 entries — the parent hook
 * enforces the mutual exclusion (`useDiscoverBaseFilters.toggleStatus`), this component just
 * renders whatever it's given.
 */
export function DiscoverStatusFilter({
  selectedStatuses,
  onToggleStatus,
}: DiscoverStatusFilterProps) {
  const selectedSet = new Set(selectedStatuses);
  const selected = selectedStatuses[0];
  // 2026-09-23 revision — the trigger shows the selected value alone once set, no "Status " prefix
  // (same change applied to Fee).
  const triggerLabel = selected !== undefined ? SESSION_STATUS_LABEL[selected] : 'Status';
  // No separate "clear" handler needed — toggling the currently-selected status off is exactly
  // the mutual-exclusion hook's own reset-to-default (see useDiscoverBaseFilters.toggleStatus).
  const clear = () => {
    if (selected !== undefined) onToggleStatus(selected);
  };

  return (
    <Popover>
      <DiscoverFilterTrigger
        label={triggerLabel}
        isActive={selected !== undefined}
        onClear={clear}
        clearLabel="Clear status filter"
      />
      <PopoverContent align="start" className="w-44">
        <fieldset className="flex flex-col gap-0.5">
          <legend className="sr-only">Statuses to discover</legend>
          {DISCOVERABLE_STATUSES.map((status) => (
            <label
              key={status}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-2sm text-text-primary hover:bg-surface-1"
            >
              <input
                type="checkbox"
                checked={selectedSet.has(status)}
                onChange={() => onToggleStatus(status)}
                className="size-4 accent-accent-solid"
              />
              {SESSION_STATUS_LABEL[status]}
            </label>
          ))}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}
