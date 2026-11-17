import i18next from 'i18next';

/**
 * The time left until `targetIso` as "2 days, 03:04:05" (en) or "2 ngày, 03:04:05" (vi); the days part is
 * dropped when there are none left ("03:04:05"). Returns null once the target has been reached.
 * A plain function reading the i18next singleton, like `formatRelativeTime`.
 */
export function formatCountdownSpan(targetIso: string, now: Date): string | null {
  const totalSeconds = Math.floor((new Date(targetIso).getTime() - now.getTime()) / 1000);
  if (!(totalSeconds > 0)) return null;
  const days = Math.floor(totalSeconds / 86400);
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(Math.floor((totalSeconds % 86400) / 3600))}:${pad(Math.floor((totalSeconds % 3600) / 60))}:${pad(totalSeconds % 60)}`;
  return days === 0
    ? i18next.t('session:countdown.span', { time })
    : i18next.t('session:countdown.spanWithDays', { count: days, time });
}
