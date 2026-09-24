import { IconSearch } from '@tabler/icons-react';
import type { SessionSearchMode } from '../types';

/** Only 'sessions' ever filters for real (server-side `title`, CLIENT-SESSION-22) — 'location'
 * and 'gear' used to render here too, disabled, but a scope dropdown offering two options that
 * always no-op was itself the confusing part, not just their disabled state (CLIENT-SESSION-29
 * revision, 2026-09-23). Real location filtering is the dedicated Location pill; there's still no
 * gear/equipment domain. `SessionSearchMode` itself is unchanged — `useDiscoverBaseFilters` still
 * branches on it — only the dropdown's own option list shrank. */
const SEARCH_MODE_OPTIONS: { value: SessionSearchMode; label: string }[] = [
  { value: 'sessions', label: 'Sessions' },
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
          <option key={option.value} value={option.value}>
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
