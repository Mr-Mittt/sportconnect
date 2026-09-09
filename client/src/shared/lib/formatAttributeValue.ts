import type { SportAttributeType } from '@/shared/types/sport';
import { devWarn } from './devWarn';

/**
 * SPORT-13: render an attribute value as display text per a `layout.format` pattern.
 *
 * Display-only — callers pass the already-stored value and show the returned string next to (never
 * instead of) the editable control, or as the whole value in a `readonly-text` layout. SPORT-15
 * reuses this on the full read-only side (`SessionAttributesSummary`).
 *
 * Grammar (deliberately closed — not an open format DSL):
 * - **NUMBER** — a number token built from `0` `#` `,` `.` `%`, with an optional literal prefix
 *   and/or suffix around it:
 *   - decimals = digits after `.` in the token (`0.00` → 2)
 *   - `,` anywhere in the token → grouped
 *   - trailing `%` → percent style (`Intl` multiplies by 100: `0.5` + `0%` → `50%`)
 *   - `"$"` + `#,##0.00` → `"$1,234.50"`; `0.0` + `" lbs"` → `"12.0 lbs"`
 * - **STRING** — one of `uppercase`, `lowercase`, `titlecase`.
 *
 * A nullish/empty value returns `''` with no warning. An unparseable pattern, or a value whose
 * runtime type doesn't match `type`, returns `String(value)` and fires a deduped {@link devWarn}.
 *
 * `locale` defaults to `en-US` — the app has no i18n yet (client V1 `I18N-1`); once it does, the
 * caller passes the resolved UI locale so number separators follow it.
 */
export function formatAttributeValue(
  value: unknown,
  type: SportAttributeType,
  pattern: string | null | undefined,
  locale = 'en-US',
): string {
  if (value === null || value === undefined || value === '') return '';
  if (pattern == null || pattern === '') return String(value);

  if (type === 'STRING') return formatString(value, pattern);
  if (type === 'NUMBER') return formatNumber(value, pattern, locale);

  // No other type carries a `format` in SPORT-13's grammar — pass through untouched.
  return String(value);
}

function formatString(value: unknown, pattern: string): string {
  const text = String(value);
  switch (pattern) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'titlecase':
      return text.replace(/\b\p{L}[\p{L}']*/gu, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
    default:
      devWarn(`string-format:${pattern}`, `unknown STRING format "${pattern}" — showing the raw value`);
      return text;
  }
}

const NUMBER_TOKEN = /[0#][0#,]*(?:\.[0#]+)?%?/;

function formatNumber(value: unknown, pattern: string, locale: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    devWarn(`number-format:non-number`, `NUMBER format got a ${typeof value} — showing the raw value`);
    return String(value);
  }

  const match = NUMBER_TOKEN.exec(pattern);
  if (!match) {
    devWarn(`number-format:${pattern}`, `unparseable NUMBER format "${pattern}" — showing the raw value`);
    return String(value);
  }

  const token = match[0];
  const prefix = pattern.slice(0, match.index);
  const suffix = pattern.slice(match.index + token.length);
  const isPercent = token.endsWith('%');
  const dotIndex = token.indexOf('.');
  const decimals = dotIndex === -1 ? 0 : token.replace('%', '').length - dotIndex - 1;

  const formatted = new Intl.NumberFormat(locale, {
    style: isPercent ? 'percent' : 'decimal',
    useGrouping: token.includes(','),
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);

  return `${prefix}${formatted}${suffix}`;
}
