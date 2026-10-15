/**
 * AUTH-15: tiny static file server for the built theme Storybook
 * (`client/keycloak-theme/storybook-static`), so Playwright can capture and axe-scan the Keycloak
 * pages without Keycloak. Started by the `webServer` entry in playwright.config.ts.
 *
 *   node e2e/mocks/staticServer.ts [dir] [port]
 *
 * `GET /__health` answers 200 even when `dir` does not exist yet, so Playwright can start the
 * server for runs (`pnpm e2e`) that never touch the theme; the theme specs themselves fail loudly
 * with the build hint when `index.json` is missing (see themeStorybook.ts).
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? 'keycloak-theme/storybook-static');
const port = Number(process.argv[3] ?? process.env.THEME_STORYBOOK_PORT ?? 6007);

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
};

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname);
  if (pathname === '/__health') {
    response.writeHead(200).end('ok');
    return;
  }
  const file = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
}).listen(port, () => {
  console.log(`theme storybook static server on :${port} serving ${root}`);
});
