import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CLIENT-SESSION-33 — re-split guard. These Radix packages keep module-level state (a layer stack,
 * a focus-scope stack, a focus-guard counter), so two installed copies each run an independent
 * copy of that state: a Popover's Escape/focus trap and its parent Dialog's stop seeing each
 * other (CLIENT-SESSION-27's Escape bug, and the focus-yank family behind CLIENT-SESSION-28/29).
 * Reads `pnpm-lock.yaml` rather than `node_modules/.pnpm`, which can carry stale directories the
 * lockfile no longer resolves. `portal` / `presence` are deliberately not listed: they are
 * stateless, and several versions of them are installed.
 */
const SINGLE_COPY_PACKAGES = [
  '@radix-ui/react-dismissable-layer',
  '@radix-ui/react-focus-scope',
  '@radix-ui/react-focus-guards',
];

const LOCK_ENTRY = /^ {2}'?(@[^@\s]+\/[^@\s]+)@([^':(\s]+)/;

function resolvedVersions(lockfile: string, pkg: string): string[] {
  const versions = new Set<string>();
  for (const line of lockfile.split(/\r?\n/)) {
    const match = LOCK_ENTRY.exec(line);
    if (match !== null && match[1] === pkg) versions.add(match[2]);
  }
  return [...versions];
}

describe('Radix packages with shared module-level state', () => {
  const lockfile = readFileSync(resolve(process.cwd(), 'pnpm-lock.yaml'), 'utf8');

  it.each(SINGLE_COPY_PACKAGES)('%s resolves to exactly one version', (pkg) => {
    const versions = resolvedVersions(lockfile, pkg);
    expect(
      versions,
      `${pkg} resolves to ${versions.length} versions (${versions.join(', ')}). Add a ` +
        `"pnpm.overrides" entry for it in package.json (see CLIENT-SESSION-33) and re-run pnpm install.`,
    ).toHaveLength(1);
  });
});
