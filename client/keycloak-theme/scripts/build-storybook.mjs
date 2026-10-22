// AUTH-16: builds the theme Storybook (storybook-static), retrying a known race.
//
// While `storybook build` copies `public/` into `storybook-static/`, the Keycloakify plugin also
// writes `keycloakify-dev-resources/` there, and the two sometimes collide with
// `EEXIST: file already exists, mkdir ...\keycloakify-dev-resources\...\node_modules` (about one build
// in three on the Windows dev machine; the build itself is fine). Clearing the output folder and
// running again succeeds, so this does that up to three times and only then fails.
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const ATTEMPTS = 3;

for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  rmSync('storybook-static', { recursive: true, force: true });
  const result = spawnSync('pnpm', ['exec', 'storybook', 'build', '--disable-telemetry'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status === 0) process.exit(0);
  if (attempt < ATTEMPTS) console.warn(`storybook build failed (attempt ${attempt} of ${ATTEMPTS}), retrying`);
}
console.error(`storybook build failed ${ATTEMPTS} times`);
process.exit(1);
