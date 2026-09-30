import { format } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { vi } from 'date-fns/locale/vi';
import type { Locale } from 'date-fns';
import i18next from 'i18next';

/**
 * CLIENT-I18N-10: the date-fns `Locale` matching i18next's active language. Read from the
 * singleton (not a hook) because its callers are plain formatting functions, same as
 * `relativeTime` / `formatNameList`.
 */
export function getDateFnsLocale(): Locale {
  return i18next.language === 'vi' ? vi : enUS;
}

/**
 * Formats `date` with the `session:dateFormat.<patternKey>` pattern of the active language, using
 * the matching date-fns locale for weekday/month names. The pattern itself is translated (not just
 * the names) because word order differs — English is month-first ("Oct 15"), Vietnamese day-first
 * ("15 thg 10") — which a locale object alone can't express.
 */
export function formatLocalized(date: Date, patternKey: string): string {
  return format(date, i18next.t(`session:dateFormat.${patternKey}`), { locale: getDateFnsLocale() });
}
