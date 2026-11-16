import { mergeSegments, type Segment } from './mentionMarkup';

/** A person a pasted `@name` can become. */
export interface PastePerson {
  id: string;
  name: string;
}

export interface ResolvedPaste {
  segments: Segment[];
  /**
   * The `@word` still being typed at the very end of the pasted text, left as plain text (its trailing blanks are
   * removed) so the picker can open for it; `null` when the text does not end in an `@` word.
   */
  trailingQuery: string | null;
}

function lower(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase();
}

/**
 * CLIENT-GL-50, record commands only: turns every pasted `@name` into a tag chip. The longest name that fits wins (so
 * `@Bao 15` is "Bao 15", not "Bao" with a score), the first one in list order when two are equally long; a name has
 * to be followed by a blank or the end of the text. A name nobody has stays plain text (the command is then refused).
 * The last `@` word of the text is never resolved: it is left open for the picker. A normal comment never goes
 * through this: it keeps pasted text exactly as it came.
 */
export function resolvePaste(text: string, people: PastePerson[]): ResolvedPaste {
  const candidates = [...people].sort((a, b) => b.name.length - a.name.length);
  const lastAt = text.lastIndexOf('@');
  const trailingStart =
    lastAt >= 0 && (lastAt === 0 || /\s/.test(text[lastAt - 1])) && !text.slice(lastAt).includes('\n')
      ? lastAt
      : -1;

  const segments: Segment[] = [];
  let run = '';
  let index = 0;
  const flush = () => {
    if (run !== '') segments.push({ kind: 'text', text: run });
    run = '';
  };
  while (index < text.length) {
    if (index === trailingStart) {
      run += text.slice(index).trimEnd();
      break;
    }
    if (text[index] === '@' && (index === 0 || /\s/.test(text[index - 1]))) {
      const typed = lower(text.slice(index + 1));
      const hit = candidates.find((person) => {
        const name = lower(person.name);
        return typed.startsWith(name) && (typed.length === name.length || /\s/.test(typed[name.length]));
      });
      if (hit !== undefined) {
        flush();
        segments.push({ kind: 'mention', userId: hit.id, name: hit.name });
        index += 1 + hit.name.length;
        continue;
      }
    }
    run += text[index];
    index += 1;
  }
  flush();
  return {
    segments: mergeSegments(segments),
    trailingQuery: trailingStart >= 0 ? text.slice(trailingStart + 1).trimEnd() : null,
  };
}
