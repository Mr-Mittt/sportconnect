/*
 * CLIENT-GL-50: the app's one name-matching rule on the client, a copy of the server's (SESSION-GL-64):
 * word-start only (no "contains"), accent-insensitive (Vietnamese first: `tuan` finds "Tuấn", `dang` finds "Đặng"),
 * case-insensitive, and every typed word has to start some word of the name, in any order (`anh tu` finds "Tuấn Anh").
 */

/** The most words and the longest word the server reads from a query; the client cuts the same way. */
export const MAX_QUERY_WORDS = 5;
export const MAX_QUERY_WORD_LENGTH = 30;

/** Lower-case, no accents (`đ` is `d`): the form two names are compared in. */
export function foldName(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd');
}

/** The words of a query in folded form, cut to the server's limits. */
export function queryWords(query: string): string[] {
  return foldName(query)
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, MAX_QUERY_WORDS)
    .map((word) => word.slice(0, MAX_QUERY_WORD_LENGTH));
}

/** True when every word of the query starts some word of the name. An empty query matches every name. */
export function matchesName(name: string, query: string): boolean {
  const words = queryWords(query);
  if (words.length === 0) return true;
  const nameWords = foldName(name)
    .split(/\s+/)
    .filter((word) => word.length > 0);
  return words.every((word) => nameWords.some((nameWord) => nameWord.startsWith(word)));
}
