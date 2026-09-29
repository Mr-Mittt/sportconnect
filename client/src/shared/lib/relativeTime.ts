import { differenceInDays, differenceInHours, differenceInMinutes } from 'date-fns';
import i18next from 'i18next';

/**
 * Formats an ISO timestamp as the mockup's short relative style: "just now",
 * "5m ago", "2h ago", "3d ago". Uses date-fns for the date math (per HF-3's
 * "use a date lib" requirement); the unit labels come from `common:relativeTime.*`.
 *
 * CLIENT-I18N-4: this is a plain function, not a component, so it can't call
 * `useTranslation()` — it reads the i18next singleton directly instead (`i18next.t()`),
 * which always reflects the app's current language since `app/i18n.ts` keeps i18next's
 * active language following `localeStore`. First use of this pattern in the codebase;
 * every prior i18n ticket only ever needed to translate inside a component.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const minutes = differenceInMinutes(now, date);
  if (minutes < 1) {
    return i18next.t('common:relativeTime.justNow');
  }
  if (minutes < 60) {
    return i18next.t('common:relativeTime.minutesAgo', { count: minutes });
  }
  const hours = differenceInHours(now, date);
  if (hours < 24) {
    return i18next.t('common:relativeTime.hoursAgo', { count: hours });
  }
  const days = differenceInDays(now, date);
  return i18next.t('common:relativeTime.daysAgo', { count: days });
}
