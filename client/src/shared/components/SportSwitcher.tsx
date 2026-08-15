import { IconLayoutGrid, IconPlus } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { SportIcon } from './SportIcon';

interface SportSwitcherProps {
  /** The user's sport profiles — without a synthetic "All" entry; this component adds it. */
  sports: SportProfile[];
  active: SportKey | 'all';
  onChange: (key: SportKey | 'all') => void;
  /** Only fired while the user is below the sport cap — at the cap the pill is aria-disabled. */
  onAddSport: () => void;
  /** SPORT-3: callers should pass the live catalog's size here (falling back to this default only
   * before the catalog's first fetch resolves) — hardcoding 3 stopped reflecting reality once the
   * real active catalog shrank to 2 sports (A6). */
  maxSports?: number;
}

interface PillProps {
  label: string;
  /** Pre-rendered by the caller (a `SportIcon` for a real sport, a plain
   * Tabler icon for the synthetic "All" pill) — resolving it inside this
   * component would create a new component reference on every render, which
   * `eslint-plugin-react-hooks` flags. */
  icon: ReactNode;
  isActive: boolean;
  onClick: () => void;
}

function Pill({ label, icon, isActive, onClick }: PillProps) {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={onClick}
      className={cn(
        'flex cursor-pointer items-center gap-1.5 rounded-full bg-surface-1 px-3 py-1.75 text-2sm text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0',
        // The 2px active border is the design system's one approved exception
        // to the hairline border rule.
        isActive ? 'border-2 border-border-accent font-medium' : 'border-hairline border-border',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Controlled pill row for switching between sport profiles — the primary
 * filter for the Home Feed (drives Feed and UpcomingMatches via the parent).
 * Always renders the dashed "Add sport" pill (mockup parity — decided in HF-2);
 * at the cap it becomes a no-op with aria-disabled instead of disappearing.
 */
export function SportSwitcher({
  sports,
  active,
  onChange,
  onAddSport,
  maxSports = 3,
}: SportSwitcherProps) {
  const atCap = sports.length >= maxSports;

  return (
    <div role="group" aria-label="Sport filter" className="flex flex-wrap gap-2">
      <Pill
        label="All"
        icon={<IconLayoutGrid className="size-4" aria-hidden="true" />}
        isActive={active === 'all'}
        onClick={() => onChange('all')}
      />
      {sports.map((sport) => (
        <Pill
          key={sport.key}
          label={sport.label}
          icon={<SportIcon iconUrl={sport.iconUrl} className="size-4" />}
          isActive={active === sport.key}
          onClick={() => onChange(sport.key)}
        />
      ))}
      <button
        type="button"
        aria-disabled={atCap}
        title={atCap ? 'You have reached the maximum number of sports' : undefined}
        onClick={() => {
          if (!atCap) {
            onAddSport();
          }
        }}
        className="border-hairline flex cursor-pointer items-center gap-1.5 rounded-full border-dashed border-border-strong px-3 py-1.75 text-2sm text-text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
      >
        <IconPlus className="size-4" aria-hidden="true" />
        Add sport
      </button>
    </div>
  );
}
