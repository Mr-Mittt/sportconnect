#!/usr/bin/env node
/**
 * Imports the 75 standalone Badminton test sessions from
 * documentation/md/BADMINTON_STANDALONE_SESSIONS_TEST_DATA.xlsx into the local dev backend
 * (localhost:8080, sportconnect_dev) for a given date, via the real POST /api/sessions endpoint —
 * not a raw DB insert, so the service layer's own side effects (companion SESSION_POST creation,
 * creator auto-join, validation) all run exactly as they would for a session created through the
 * UI. Authenticates as each row's assigned author via the real POST /api/auth/login (all 6
 * bao.mmo* dev accounts share one known password — see AUTHOR_PASSWORD below), one login per
 * distinct author, cached and reused across that author's rows rather than logging in per row.
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
 * :8080 (./gradlew :server:bootRun), and the dev Postgres container up (docker compose -f
 * infra/docker-compose.dev.yml up -d) for the private-row fix step.
 *
 * Not idempotent — running this twice for the same date creates 75 more (duplicate) sessions.
 * There is no dedup/upsert; re-running is only safe if you're fine with duplicates or clean up
 * first.
 */

import ExcelJS from 'exceljs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XLSX_PATH = path.resolve(__dirname, '../../md/BADMINTON_STANDALONE_SESSIONS_TEST_DATA.xlsx');
const BACKEND_BASE_URL = 'http://localhost:8080';
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

async function loginAs(email) {
  if (tokenCache.has(email)) return tokenCache.get(email);

  const res = await fetch(`${BACKEND_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: AUTHOR_PASSWORD }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`login failed for ${email}: HTTP ${res.status}: ${json ? JSON.stringify(json) : await res.text()}`);
  }
  const token = json.data.accessToken;
  tokenCache.set(email, token);
  console.log(`  logged in as ${email}`);
  return token;
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
