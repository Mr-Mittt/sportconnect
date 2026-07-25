/**
 * Oxford-comma joins a list of names for display — "A" for one, "A and B"
 * for two, "A, B, and C" for three or more. Used wherever B14's
 * `inviterFullNames` (every co-inviter on one invitation) needs to read as a
 * natural sentence fragment (GRP-8 parts 2 and 4).
 */
export function formatNameList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}
