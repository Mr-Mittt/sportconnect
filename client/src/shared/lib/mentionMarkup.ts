/*
 * CLIENT-GL-50: tags in a session comment. The server stores the text as it is; a tagged person is written inside it
 * as `@[Full Name](userId)`. The end user never sees the id: the box and the thread show only the name, copy gives
 * `@Full Name`.
 */

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; userId: string; name: string };

/** A user id is a uuid today; any token without blanks or parentheses reads, so a different id format never breaks a thread. */
const USER_ID = '[^()\\s]+';

/** The name as stored: no brackets or parentheses (they would break the markup), single spaces. */
export function cleanName(name: string): string {
  const cleaned = name.replace(/[[\]()]/g, '').replace(/\s+/g, ' ').trim();
  return cleaned === '' ? '?' : cleaned;
}

/** Joins neighbouring text pieces and drops empty ones. */
export function mergeSegments(segments: Segment[]): Segment[] {
  const merged: Segment[] = [];
  for (const segment of segments) {
    if (segment.kind === 'text') {
      if (segment.text === '') continue;
      const last = merged[merged.length - 1];
      if (last?.kind === 'text') {
        merged[merged.length - 1] = { kind: 'text', text: last.text + segment.text };
        continue;
      }
    }
    merged.push(segment);
  }
  return merged;
}

/** Reads the stored text. Markup that cannot be read (no id, broken brackets) stays plain text. */
export function parseMarkup(content: string): Segment[] {
  const pattern = new RegExp(`@\\[([^\\]\\n]+)\\]\\((${USER_ID})\\)`, 'g');
  const segments: Segment[] = [];
  let from = 0;
  for (const match of content.matchAll(pattern)) {
    if (match.index > from) segments.push({ kind: 'text', text: content.slice(from, match.index) });
    segments.push({ kind: 'mention', userId: match[2], name: match[1] });
    from = match.index + match[0].length;
  }
  if (from < content.length) segments.push({ kind: 'text', text: content.slice(from) });
  return mergeSegments(segments);
}

/** The text to store: tags as `@[Name](userId)`. */
export function serialize(segments: Segment[]): string {
  return segments
    .map((segment) =>
      segment.kind === 'text' ? segment.text : `@[${cleanName(segment.name)}](${segment.userId})`,
    )
    .join('');
}

/** What a reader sees, and what copy gives: tags as `@Full Name`. */
export function plainText(segments: Segment[]): string {
  return segments.map((segment) => (segment.kind === 'text' ? segment.text : `@${segment.name}`)).join('');
}

/** The length of what would be stored; the comment limit counts this. */
export function storedLength(segments: Segment[]): number {
  return serialize(segments).length;
}

/** True when there is nothing to send: no tag and only blanks. */
export function isEmptyDraft(segments: Segment[]): boolean {
  return segments.every((segment) => segment.kind === 'text' && segment.text.trim() === '');
}

/** Cuts the end off so the stored length is at most `limit`: text is cut by characters, a tag goes whole or not at all. */
export function clipSegments(segments: Segment[], limit: number): Segment[] {
  const result: Segment[] = [];
  let used = 0;
  for (const segment of segments) {
    const length = storedLength([segment]);
    if (used + length <= limit) {
      result.push(segment);
      used += length;
      continue;
    }
    if (segment.kind === 'text' && limit - used > 0) {
      result.push({ kind: 'text', text: segment.text.slice(0, limit - used) });
    }
    break;
  }
  return result;
}

/** Removes the blanks around the whole text (the stored comment is trimmed, as before). */
export function trimSegments(segments: Segment[]): Segment[] {
  const copy = [...segments];
  const first = copy[0];
  if (first?.kind === 'text') copy[0] = { kind: 'text', text: first.text.trimStart() };
  const lastIndex = copy.length - 1;
  const last = copy[lastIndex];
  if (last?.kind === 'text') copy[lastIndex] = { kind: 'text', text: last.text.trimEnd() };
  return mergeSegments(copy);
}
