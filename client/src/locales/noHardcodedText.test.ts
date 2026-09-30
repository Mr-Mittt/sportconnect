import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CLIENT-I18N-12 recurrence guard. The en/vi parity test compares keys, never whether visible
 * text goes through `t()`, so a new component could ship hardcoded English unnoticed. This scans
 * every non-admin, non-test, non-story `.tsx` for (a) user-facing attributes (`aria-label`,
 * `title`, `placeholder`, `alt`) given a plain-English string literal and (b) JSX text lines that
 * start with a letter. Add a line to `ALLOWED` only for genuinely locale-neutral text.
 */
const SRC = join(__dirname, '..');
const ATTR = /\b(aria-label|title|placeholder|alt)="([^"{}]*[A-Za-z]{2}[^"{}]*)"/;
const JSX_TEXT = /^\s+([A-Za-z][A-Za-z ,.'’!?…—:&-]*[A-Za-z.!?…])\s*$/;
const ALLOWED = new Set<string>([
  'SportHub', // brand name
  'VND', // locale-neutral currency placeholder
  'https://maps.app.goo.gl/…', // example URL, locale-neutral
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'admin' || name === 'locales' || name === 'node_modules') continue;
      walk(full, out);
    } else if (
      name.endsWith('.tsx') &&
      !/\.(test|stories)\.tsx$/.test(name)
    ) {
      out.push(full);
    }
  }
  return out;
}

describe('no hardcoded user-facing text', () => {
  it('routes every visible string and a11y attribute through t()', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      let inBlockComment = false;
      let inTag = false;
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .forEach((line, index) => {
          const trimmed = line.trim();
          if (inBlockComment) {
            if (trimmed.includes('*/')) inBlockComment = false;
            return;
          }
          if (trimmed.startsWith('/*') || trimmed.startsWith('{/*')) {
            if (!trimmed.includes('*/')) inBlockComment = true;
            return;
          }
          if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
          if (/[a-z][A-Z]/.test(trimmed) && !trimmed.includes(' ')) return; // identifier, not prose
          const where = `${relative(SRC, file)}:${index + 1}: ${trimmed}`;
          const attr = ATTR.exec(line);
          if (attr && !ALLOWED.has(attr[2])) offenders.push(where);
          // Bare JSX text only counts on a line that is not inside a multi-line opening tag.
          if (!inTag) {
            const text = JSX_TEXT.exec(line);
            if (text && !ALLOWED.has(text[1]) && /^[A-Z]/.test(text[1]) && !/^(import|export|return|const|type|else|case|default)\b/.test(text[1])) {
              offenders.push(where);
            }
          }
          const opens = (line.match(/<[A-Za-z][\w.]*(?=[\s>]|$)/g) ?? []).length;
          const closes = (line.match(/\/?>/g) ?? []).length;
          if (opens > closes) inTag = true;
          else if (inTag && closes > 0) inTag = false;
        });
    }
    expect(offenders).toEqual([]);
  });
});
