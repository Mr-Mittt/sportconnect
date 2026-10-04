import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CLIENT-ERR-1 recurrence guard (sibling of `locales/noHardcodedText.test.ts`). Every read of an
 * HTTP error's status or body must go through `shared/lib/apiError.ts` (`getApiError` /
 * `getErrorMessage` / `shouldRetry`), so a failure is classified, localized and retried the same
 * way everywhere. This scans non-test, non-story source for the raw patterns a hook copies when it
 * does that by hand: `isAxiosError(`, `.response?.status`, `.response?.data`, `.response.status`,
 * `.response.data`.
 *
 * `ALLOWED` lists the files that may still read a raw error, each with its owner. An entry is
 * removed by the ticket named next to it (and this test then forces the removal: a stale entry
 * fails below). Add a new entry only with a filed ticket that removes it.
 */
const SRC = join(__dirname, '..');
const RAW_ERROR_READ = /isAxiosError\(|\.response\??\.(status|data)\b/;

const ALLOWED: Record<string, string> = {
  'shared/lib/apiError.ts': 'the classifier itself',
  'app/apiClient.ts': 'owns the 401 silent-refresh flow; the classifier must not interfere with it',
  'features/feed/hooks/usePost.ts': 'CLIENT-ERR-6: 404 skips retry',
  'features/feed/hooks/useComments.ts': 'CLIENT-ERR-6: 404 skips retry',
  'features/session/hooks/useSessionComments.ts': 'CLIENT-ERR-7: 403/404 skips retry',
  'features/session/useSessionCommentsData.ts': 'CLIENT-ERR-7: isForbidden read from a 403',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === 'locales') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function offenders(): string[] {
  return walk(SRC)
    .filter((file) => RAW_ERROR_READ.test(readFileSync(file, 'utf8')))
    .map((file) => relative(SRC, file).split(sep).join('/'));
}

describe('no raw HTTP error reads outside the shared classifier', () => {
  it('only the allowlisted files read a raw error status or body', () => {
    const unexpected = offenders().filter((file) => !(file in ALLOWED));

    expect(unexpected).toEqual([]);
  });

  it('has no stale allowlist entries (a migrated file must leave the list)', () => {
    const present = new Set(offenders());
    const stale = Object.keys(ALLOWED).filter((file) => !present.has(file));

    expect(stale).toEqual([]);
  });
});
