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
  /**
   * SPORT-5: now fired on **every** click, including when the user already holds every
   * catalogue sport. The caller re-reads the catalogue and then opens either the picker or
   * `NoSportsToAddDialog`. Previously the pill was `aria-disabled` at the cap and the click
   * was swallowed — silent, and invisible to anyone not hovering for the `title` tooltip.
   */
  onAddSport: () => void;
  /** SPORT-5: the catalogue re-read is in flight; the pill is disabled and says so. */
  isCheckingCatalog?: boolean;
  /** SPORT-3: callers should pass the live catalog's size here (falling back to this default only
   * before the catalog's first fetch resolves) — hardcoding 3 stopped reflecting reality once the
   * real active catalog shrank to 2 sports (A6). */
  maxSports?: number;
  /** PROFILE-4: `/profile` has no `'all'` state on its page (`profilePageStore` never holds it) —
   * editing a per-sport profile has no sane "all" meaning, and the user decided the whole page,
   * not just the Settings tab, drops it for consistency. Every other caller (Home Feed, Groups,
   * Matches) is unaffected by the default. */
  showAllPill?: boolean;
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
        'flex cursor-pointer items-center gap-1.5 rounded-full bg-surface-1 px-3 py-1.75 text-2sm text-text-primary transition-[color,background-color,border-color,transform] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0 motion-reduce:transition-none motion-reduce:hover:scale-100',
        // PROFILE-10: the active pill itself scales too (not just hover) —
        // stacks additively with the 2px border below, same "additive, not
        // a swapped variant" reasoning that border already followed.
        isActive && 'scale-105 motion-reduce:scale-100',
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
 * Always renders the dashed "Add sport" pill (mockup parity — decided in HF-2).
 *
 * **SPORT-5 reverses HF-2's "no-op with aria-disabled at the cap".** The pill is now
 * always clickable; the caller re-reads the catalogue and opens either the picker or
 * `NoSportsToAddDialog`. HF-2's disabled pill was correct about *state* and wrong about
 * *communication* — it left the one interaction a capped user attempts with no response
 * at all beyond a hover tooltip. `aria-disabled` now marks the in-flight re-read only.
 */
export function SportSwitcher({
  sports,
  active,
  onChange,
  onAddSport,
  maxSports = 3,
  isCheckingCatalog = false,
  showAllPill = true,
}: SportSwitcherProps) {
  // SPORT-5: retained only for the tooltip. It no longer gates the click — being at the cap is
  // now something the dialog explains, not something the pill refuses to discuss. Note this is
  // equivalent to `availableSports.length === 0` at every call site, because they all pass the
  // catalogue length as `maxSports`.
  const atCap = sports.length >= maxSports;

  return (
    <div role="group" aria-label="Sport filter" className="flex flex-wrap gap-2">
      {showAllPill && (
        <Pill
          label="All"
          icon={<IconLayoutGrid className="size-4" aria-hidden="true" />}
          isActive={active === 'all'}
          onClick={() => onChange('all')}
        />
      )}
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
        aria-disabled={isCheckingCatalog}
        title={atCap ? 'You have added every sport available' : undefined}
        onClick={() => {
          if (!isCheckingCatalog) {
            onAddSport();
          }
        }}
        className="border-hairline flex cursor-pointer items-center gap-1.5 rounded-full border-dashed border-border-strong px-3 py-1.75 text-2sm text-text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
      >
        <IconPlus className="size-4" aria-hidden="true" />
        {isCheckingCatalog ? 'Checking…' : 'Add sport'}
      </button>
    </div>
  );
}
