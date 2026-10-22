#!/usr/bin/env node
/**
 * Imports the 75 standalone Badminton test sessions from
 * documentation/md/BADMINTON_STANDALONE_SESSIONS_TEST_DATA.xlsx into the local dev backend
 * (localhost:8080, sportconnect_dev) for a given date, via the real POST /api/sessions endpoint —
 * not a raw DB insert, so the service layer's own side effects (companion SESSION_POST creation,
 * creator auto-join, validation) all run exactly as they would for a session created through the
 * UI. Authenticates as each row's assigned author by signing in at the dev Keycloak (A28: the old POST
 * /api/auth/login is gone; see loginAs below for the scripted Authorization Code + PKCE login). All 6 bao.mmo*
 * dev accounts share one known password — see AUTHOR_PASSWORD below. One login per distinct author, cached and
 * reused across that author's rows rather than logging in per row.
 *
 * Usage: node add-test-data.mjs --date 2026-09-25
 *
 * For each of the 75 rows (case design lives in the xlsx, not here — this script only reads it):
 *   1. Computes scheduledStart as `${date}T${hour}:00:00+07:00` (mirrors the xlsx's own formula;
 *      +07:00 is Asia/Ho_Chi_Minh, the timezone of both real locations used — see the xlsx's Read
 *      Me tab).
 *   2. Logs in as that row's assigned author (xlsx columns S/T), reusing a cached token if this
 *      author already logged in earlier in this run.
 *   3. POSTs the session to /api/sessions with that token.
 *   4. For the 15 rows flagged "Manual DB fix needed = YES" (isPublic can't be set via the API —
 *      see the xlsx's Read Me tab), runs the UPDATE sessions SET is_public=false directly against
 *      the dev Postgres container using the just-created session's real id.
 *
 * Prerequisites: `npm install` once in this folder (installs exceljs), the dev backend running on
 * :8080 (./gradlew :server:bootRun), the dev Keycloak up on :8081 (docker compose -f infra/docker-compose.dev.yml
 * up -d keycloak; the six author accounts must exist in its sportconnect realm), and the dev Postgres container up (docker compose -f
 * infra/docker-compose.dev.yml up -d) for the private-row fix step.
 *
 * Not idempotent — running this twice for the same date creates 75 more (duplicate) sessions.
 * There is no dedup/upsert; re-running is only safe if you're fine with duplicates or clean up
 * first.
 */

import ExcelJS from 'exceljs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XLSX_PATH = path.resolve(__dirname, '../../md/BADMINTON_STANDALONE_SESSIONS_TEST_DATA.xlsx');
const BACKEND_BASE_URL = 'http://localhost:8080';
const KEYCLOAK_OIDC = process.env.KEYCLOAK_OIDC_URL ?? 'http://localhost:8081/realms/sportconnect/protocol/openid-connect';
const KEYCLOAK_CLIENT_ID = 'sportconnect-web';
const KEYCLOAK_REDIRECT_URI = 'http://localhost:5173/auth/callback'; // only has to be a registered redirect; nothing listens
// All 6 bao.mmo* dev accounts share this password (confirmed by the user directly, 2026-09-23) —
// dev-only test accounts, not real credentials.
const AUTHOR_PASSWORD = '123123123';
const POSTGRES_CONTAINER = 'sportconnect-dev-postgres-1';
const POSTGRES_DB = 'sportconnect_dev';
const POSTGRES_USER = 'postgres';
const POSTGRES_PASSWORD = 'sa'; // application-dev.yml's own checked-in dev password

const HEADER_ROW = 9;
const FIRST_DATA_ROW = HEADER_ROW + 1; // 10
const LAST_DATA_ROW = FIRST_DATA_ROW + 75 - 1; // 84
const COL = {
  hour: 3,
  title: 4,
  sportId: 7,
  locationId: 9,
  capacity: 11,
  feeType: 12,
  feeAmountVnd: 13,
  autoApprove: 14,
  manualDbFix: 16,
  authorEmail: 19,
  authorUserId: 20,
};

function parseArgs(argv) {
  const dateIdx = argv.indexOf('--date');
  const date = dateIdx !== -1 ? argv[dateIdx + 1] : argv[0];
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('Usage: node add-test-data.mjs --date YYYY-MM-DD');
    process.exit(1);
  }
  return { date };
}

function readCaseRows(ws) {
  const rows = [];
  for (let r = FIRST_DATA_ROW; r <= LAST_DATA_ROW; r++) {
    rows.push({
      rowNumber: r,
      hour: ws.getCell(r, COL.hour).value,
      title: ws.getCell(r, COL.title).value,
      sportId: ws.getCell(r, COL.sportId).value,
      locationId: ws.getCell(r, COL.locationId).value,
      capacity: ws.getCell(r, COL.capacity).value,
      feeType: ws.getCell(r, COL.feeType).value,
      feeAmountVnd: ws.getCell(r, COL.feeAmountVnd).value || null,
      autoApprove: String(ws.getCell(r, COL.autoApprove).value).toUpperCase() === 'TRUE',
      manualDbFix: String(ws.getCell(r, COL.manualDbFix).value).toUpperCase() === 'YES',
      authorEmail: ws.getCell(r, COL.authorEmail).value,
      authorUserId: ws.getCell(r, COL.authorUserId).value,
    });
  }
  return rows;
}

function scheduledStartFor(date, hour) {
  return `${date}T${String(hour).padStart(2, '0')}:00:00+07:00`;
}

function flipIsPublicFalse(sessionId) {
  execFileSync(
    'docker',
    [
      'exec',
      '-e',
      `PGPASSWORD=${POSTGRES_PASSWORD}`,
      POSTGRES_CONTAINER,
      'psql',
      '-U',
      POSTGRES_USER,
      '-d',
      POSTGRES_DB,
      '-c',
      `UPDATE sessions SET is_public = false WHERE id = ${sessionId};`,
    ],
    { stdio: 'pipe' },
  );
}

const tokenCache = new Map(); // email -> accessToken, one real login per distinct author per run

/** Collects the cookies of a response into a Cookie header value (a minimal jar: name=value only). */
function cookieHeader(jar, res) {
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(';');
    jar.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1));
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}

/**
 * A28: a real Keycloak sign-in without a browser. Starts the Authorization Code + PKCE flow the web app uses, posts the
 * credentials to the login form's action (the themed login page embeds it as "loginAction" in its kcContext), reads the
 * code from the redirect and exchanges it for an access token. Throws with Keycloak's own page text when the sign-in is
 * refused (unknown user, wrong password, or a required action such as a pending email verification).
 */
async function loginAs(email) {
  if (tokenCache.has(email)) return tokenCache.get(email);

  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const authUrl =
    `${KEYCLOAK_OIDC}/auth?client_id=${KEYCLOAK_CLIENT_ID}&response_type=code&scope=openid` +
    `&code_challenge=${challenge}&code_challenge_method=S256&redirect_uri=${encodeURIComponent(KEYCLOAK_REDIRECT_URI)}`;

  const jar = new Map();
  const page = await fetch(authUrl);
  cookieHeader(jar, page);
  const html = await page.text();
  const action = /"loginAction":\s*"([^"]+)"/.exec(html)?.[1];
  if (!page.ok || !action) {
    throw new Error(`login failed for ${email}: Keycloak's login page did not load (HTTP ${page.status}); is the dev Keycloak up on :8081?`);
  }

  const submit = await fetch(action, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader(jar, page) },
    body: new URLSearchParams({ username: email, password: AUTHOR_PASSWORD, credentialId: '' }),
  });
  const location = submit.headers.get('location') ?? '';
  const code = location.startsWith(KEYCLOAK_REDIRECT_URI) ? new URL(location).searchParams.get('code') : null;
  if (!code) {
    const text = (await submit.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300);
    throw new Error(`login failed for ${email}: HTTP ${submit.status}, no code in the redirect (${location || text})`);
  }

  const tokenRes = await fetch(`${KEYCLOAK_OIDC}/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: KEYCLOAK_CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: KEYCLOAK_REDIRECT_URI,
    }),
  });
  const json = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok || !json?.access_token) {
    throw new Error(`login failed for ${email}: token exchange HTTP ${tokenRes.status}: ${JSON.stringify(json)}`);
  }
  tokenCache.set(email, json.access_token);
  console.log(`  logged in as ${email}`);
  return json.access_token;
}

async function createSession(row, date) {
  const token = await loginAs(row.authorEmail);
  const body = {
    sportId: row.sportId,
    title: row.title,
    locationId: row.locationId,
    scheduledStart: scheduledStartFor(date, row.hour),
    durationMinutes: 90, // not represented in the xlsx — fixed assumption, ~1 badminton game
    capacity: row.capacity,
    feeType: row.feeType,
    feeAmountVnd: row.feeAmountVnd,
    autoApprove: row.autoApprove,
  };

  const res = await fetch(`${BACKEND_BASE_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${json ? JSON.stringify(json) : await res.text()}`);
  }
  return json.data.id;
}

async function main() {
  const { date } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(XLSX_PATH)) {
    console.error(`Workbook not found: ${XLSX_PATH}`);
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);
  const ws = wb.getWorksheet('Session Generator');
  if (!ws) {
    console.error('"Session Generator" sheet not found in the workbook.');
    process.exit(1);
  }
  const rows = readCaseRows(ws);

  console.log(`Importing ${rows.length} standalone Badminton sessions for ${date} into ${BACKEND_BASE_URL} ...`);

  const results = { created: [], failed: [], privateFixed: [], privateFixFailed: [] };

  for (const row of rows) {
    try {
      const sessionId = await createSession(row, date);
      results.created.push({ row: row.rowNumber, title: row.title, sessionId });
      console.log(`  [row ${row.rowNumber}] created session ${sessionId} — ${row.title}`);

      if (row.manualDbFix) {
        try {
          flipIsPublicFalse(sessionId);
          results.privateFixed.push({ row: row.rowNumber, sessionId });
          console.log(`  [row ${row.rowNumber}] isPublic flipped to false for session ${sessionId}`);
        } catch (e) {
          results.privateFixFailed.push({ row: row.rowNumber, sessionId, error: e.message });
          console.error(`  [row ${row.rowNumber}] FAILED to flip isPublic for session ${sessionId}: ${e.message}`);
        }
      }
    } catch (e) {
      results.failed.push({ row: row.rowNumber, title: row.title, error: e.message });
      console.error(`  [row ${row.rowNumber}] FAILED — ${row.title}: ${e.message}`);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Date: ${date}`);
  console.log(`Created: ${results.created.length} / ${rows.length}`);
  console.log(`Failed to create: ${results.failed.length}`);
  console.log(`Private-test isPublic fix applied: ${results.privateFixed.length}`);
  console.log(`Private-test isPublic fix FAILED: ${results.privateFixFailed.length}`);
  if (results.failed.length > 0) {
    console.log('\nFailures:');
    results.failed.forEach((f) => console.log(`  row ${f.row} (${f.title}): ${f.error}`));
  }
  if (results.privateFixFailed.length > 0) {
    console.log('\nPrivate-fix failures (session created, isPublic still true — fix manually):');
    results.privateFixFailed.forEach((f) =>
      console.log(`  row ${f.row}, session ${f.sessionId}: ${f.error}`),
    );
  }

  process.exit(results.failed.length > 0 || results.privateFixFailed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
