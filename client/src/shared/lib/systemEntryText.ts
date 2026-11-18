import i18next from 'i18next';
import { fieldChangeEntryText, isFieldChangeCode } from '@/shared/lib/fieldChangeEntry';

/**
 * CLIENT-GL-51: the en/vi sentence for a server-written entry (a `SESSION_SYSTEM` comment or the group
 * welcome post) from its `systemCode` and `systemParams` (SESSION-GL-63). The stored English `content` is the
 * fallback for every case this cannot show faithfully: an entry written before the codes existed (no code),
 * a code from a newer server (no key here), or params that do not fill the sentence (a name missing).
 *
 * CLIENT-SESSION-51: the `SESSION_*_CHANGED` codes (a host's edit of a `PREPARING` session) have one sentence per shape
 * (added, updated, changed, removed) chosen from their `old`/`new` params, where an empty string is a value, not a hole:
 * see `fieldChangeEntry.ts`. `SESSION_ATTRIBUTES_CHANGED` has only `name`, so it is an ordinary template below.
 */
export function systemEntryText(
  code: string | null | undefined,
  params: Record<string, string> | null | undefined,
  fallback: string,
): string {
  if (code === null || code === undefined) return fallback;
  if (isFieldChangeCode(code)) return fieldChangeEntryText(code, params) ?? fallback;
  const path = `systemEntries.${code}`;
  const template: unknown =
    i18next.getResource(i18next.language, 'enums', path) ?? i18next.getResource('en', 'enums', path);
  if (typeof template !== 'string') return fallback;
  const values = params ?? {};
  // Every `{{placeholder}}` of the sentence needs a param, otherwise i18next would print a hole.
  const missing = [...template.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].some(
    (match) => values[match[1]] === undefined || values[match[1]] === '',
  );
  return missing ? fallback : i18next.t(`enums:${path}`, values);
}
