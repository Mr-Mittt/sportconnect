import { IconArrowLeft } from '@tabler/icons-react';
import { SportIcon } from '@/shared/components/SportIcon';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { getRampBadgeClasses } from '@/shared/lib/rampStyles';
import type { SportProfile } from '@/shared/types/sport';

interface GroupCoverBannerPlaceholderProps {
  /** The pending group's sport, resolved from the persisted `selectedGroupSportId` — known
   * before the groups list is. Undefined (unknown/unloaded sport) falls back to neutral styling. */
  sport: SportProfile | undefined;
  onBack: () => void;
  /** CLIENT-I18N-7: `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * GRP-11: what `/groups` renders in `GroupCoverBanner`'s slot while a group is selected
 * (`selectedGroupId` set, e.g. handed off from Home Feed) but the groups list hasn't produced it —
 * still loading *or* failed, deliberately one state (no shimmer vs. error distinction, no retry;
 * same call as `ProfileHeaderPlaceholder`). Same card frame, cover band and icon tile as the real
 * banner so the page doesn't jump on swap, but only what's already known: the sport. The name and
 * member count need the group row, so they are omitted rather than faked. "All groups" stays, so
 * the user always has a way out of a selection that never resolves.
 */
export function GroupCoverBannerPlaceholder({
  sport,
  onBack,
  i18nOverridePrefix,
}: GroupCoverBannerPlaceholderProps) {
  const t = useOverridableText('groups', i18nOverridePrefix);
  const rampClasses = getRampBadgeClasses(sport?.colorRamp ?? '');

  return (
    <div
      data-testid="group-cover-banner-placeholder"
      className="border-hairline mb-3.5 overflow-hidden rounded-xl border-border bg-surface-2"
    >
      <div className={`relative flex h-24 items-end overflow-hidden p-3.5 ${rampClasses}`}>
        <span className="shadow-card relative z-10 flex size-13 items-center justify-center rounded-xl bg-surface-2">
          {sport !== undefined && <SportIcon iconUrl={sport.iconUrl} className="size-6.5" />}
        </span>
      </div>
      <div className="flex items-center justify-between px-3.5 py-3">
        <div className="min-w-0 text-base font-medium text-text-muted">{t('cover.loading')}</div>
        <button
          type="button"
          onClick={onBack}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border-hairline border-border px-3 py-1.5 text-2sm text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
        >
          <IconArrowLeft className="size-4" aria-hidden="true" />
          {t('cover.back')}
        </button>
      </div>
    </div>
  );
}
