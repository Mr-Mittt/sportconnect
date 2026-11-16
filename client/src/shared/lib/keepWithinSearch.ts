/**
 * CLIENT-GL-50: `placeholderData` for the people search behind an `@` list. The previous list stays on screen while the
 * next request of the SAME `@` word loads (typing "b" then "ba" does not flicker), but never across two `@` words: the
 * owner of the search counts them (`search` goes up every time the box reports that no `@` word is left: a pick, Esc,
 * blur, the caret leaving the word), and a list from an older one is dropped. The next `@` therefore starts empty, so a
 * request that then fails shows no list, not the last one the user saw. (TanStack hands over the last query that had
 * data, idle or not, so the idle state itself cannot tell the two apart.) Each request marks itself with
 * `meta: { search }`.
 */
export function keepWithinSearch<T>(search: number) {
  return (
    previousData: T | undefined,
    previousQuery: { meta?: Record<string, unknown> } | undefined,
  ): T | undefined => (previousQuery?.meta?.search === search ? previousData : undefined);
}
