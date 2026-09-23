import { IconSearch } from '@tabler/icons-react';
import type { SessionSearchMode } from '../types';

/** Only 'sessions' filters for real (server-side `title`, CLIENT-SESSION-22) — 'location'/'gear'
 * render disabled since this app has no gear/equipment domain yet, and real location filtering is
 * the dedicated Location pill, not this dropdown. */
const SEARCH_MODE_OPTIONS: { value: SessionSearchMode; label: string; disabled?: boolean }[] = [
  { value: 'sessions', label: 'Sessions' },
  { value: 'location', label: 'Location', disabled: true },
  { value: 'gear', label: 'Gear', disabled: true },
];

interface DiscoverSearchBoxProps {
  searchMode: SessionSearchMode;
  onSearchModeChange: (mode: SessionSearchMode) => void;
  searchText: string;
  onSearchTextChange: (text: string) => void;
}

/** The search-scope `<select>` + text input row, shared by `SessionDiscoverPanel` (the full
 * `/matches` page) and `SessionDiscoverModal`'s own simplified layout (CLIENT-SESSION-22 delta,
 * 2026-09-22) — extracted so the two don't duplicate this markup once the modal stopped rendering
 * the shared `SessionDiscoverPanel` wholesale. */
export function DiscoverSearchBox({
  searchMode,
  onSearchModeChange,
  searchText,
  onSearchTextChange,
}: DiscoverSearchBoxProps) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={searchMode}
        onChange={(event) => onSearchModeChange(event.target.value as SessionSearchMode)}
        aria-label="Search scope"
        className="border-hairline cursor-pointer rounded-lg border-border bg-surface-2 px-2.5 py-2 text-2sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
      >
        {SEARCH_MODE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="relative min-w-0 flex-1">
        <IconSearch
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <input
          type="text"
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
          placeholder="Search"
          aria-label="Search sessions"
          className="border-hairline w-full rounded-lg border-border bg-surface-2 py-2 pr-2.5 pl-8 text-2sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
        />
      </div>
    </div>
  );
}
