import i18next from 'i18next';

/**
 * Joins a list of names for display in the active UI locale (CLIENT-I18N-7) via
 * `Intl.ListFormat` — English gives "A" for one, "A and B" for two, "A, B, and C" (Oxford comma)
 * for three or more; Vietnamese gives "A, B và C". Used wherever B14's
 * `inviterFullNames` (every co-inviter on one invitation) needs to read as a
 * natural sentence fragment (GRP-8 parts 2 and 4).
 */
export function formatNameList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return new Intl.ListFormat(i18next.language, { style: 'long', type: 'conjunction' }).format(names);
}
