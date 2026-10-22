import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/*
 * AUTH-15: the Keycloak theme's Storybook is built to keycloak-theme/storybook-static and served
 * by e2e/mocks/staticServer.ts (webServer entry in playwright.config.ts). The visual and a11y theme
 * specs walk every story in its index.json, so a new theme story is captured and axe-scanned with
 * no spec change.
 */
export const THEME_STORYBOOK_URL = `http://localhost:${process.env.THEME_STORYBOOK_PORT ?? 6007}`;

const indexFile = resolve('keycloak-theme/storybook-static/index.json');

/** Every story id in the built theme Storybook. Throws, with the fix, when it has not been built. */
export function themeStoryIds(): string[] {
  if (!existsSync(indexFile)) {
    throw new Error(
      `The theme Storybook is not built (${indexFile} is missing). Run \`pnpm build-theme-storybook\` first.`,
    );
  }
  const index = JSON.parse(readFileSync(indexFile, 'utf8')) as {
    entries: Record<string, { type: string }>;
  };
  return Object.entries(index.entries)
    .filter(([, entry]) => entry.type === 'story')
    .map(([id]) => id);
}

/** URL of one story rendered alone, in the given locale (the theme's locale toolbar global). */
export function themeStoryUrl(id: string, locale: 'en' | 'vi' = 'en'): string {
  return `${THEME_STORYBOOK_URL}/iframe.html?id=${id}&viewMode=story&globals=locale:${locale}`;
}

/** `login-pages--register-with-errors` -> `register-with-errors` (baseline and test names). */
export function themeStoryName(id: string): string {
  return id.replace(/^login-pages--/, '');
}
