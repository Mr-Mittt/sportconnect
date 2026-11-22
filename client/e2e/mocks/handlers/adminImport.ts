import { http, HttpResponse, type HttpHandler } from 'msw';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import { createSessionStore, sessionIdFromRequest } from '../sessionStore.ts';

/*
 * CLIENT-ADMIN-IMPORT-1 / SESSION-70: `POST /api/sessions/import/preview` and `POST /api/sessions/import`. One group (id 46,
 * "B-k-B-g") with six members, one location that fits (id 7); any other group is 404 `GROUP_NOT_FOUND`, any other location
 * `SESSION_LOCATION_SPORT_MISMATCH`. Names are matched by first name, ignoring accents and case, like the real server; an alias
 * settles a clash; a name matching none or several is unresolved and blocks the apply with 409. The sessions "created" are
 * kept per test session, so a repeated apply skips them.
 */

const GROUP_ID = 46;
const LOCATION_ID = 7;
const OWNER_ID = 'member-bao';

interface Member { userId: string; fullName: string; firstName: string }

const MEMBERS: Member[] = [
  { userId: 'member-bao', fullName: 'Bảo Nguyễn', firstName: 'Bảo' },
  { userId: 'member-hieu', fullName: 'Hiếu Nguyễn', firstName: 'Hiếu' },
  { userId: 'member-duc', fullName: 'Đức Trần', firstName: 'Đức' },
  { userId: 'member-vien', fullName: 'Viên Nguyễn', firstName: 'Viên' },
  { userId: 'member-anh-a', fullName: 'Ánh Nguyễn', firstName: 'Ánh' },
  { userId: 'member-anh-b', fullName: 'Ánh Vãng Lai', firstName: 'Ánh' },
];

interface ImportedGame { winners: string[]; losers: string[] }
interface ImportedSession { title: string; localDate: string; startTime: string; endTime: string; games: ImportedGame[] }
interface ImportBody { groupId: number; locationId: number; aliases?: Record<string, string>; sessions: ImportedSession[] }

interface ImportSession {
  /** `start|title` of every session already imported. */
  imported: Set<string>;
  nextId: number;
}

const importSessions = createSessionStore<ImportSession>(() => ({ imported: new Set(), nextId: 900 }));

function normalize(name: string): string {
  return name.normalize('NFD').replace(/\p{M}+/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();
}

function apiResponse<T>(data: T): ApiResponse<T> {
  return { success: true, message: 'Success', data, timestamp: new Date().toISOString() };
}

function apiError(message: string, errorCode: string, errorParams?: Record<string, unknown>): ApiResponse<null> {
  return { success: false, message, data: null, timestamp: new Date().toISOString(), errorCode, errorParams };
}

const candidate = (m: Member) => ({ userId: m.userId, fullName: m.fullName });

/** Vietnam is UTC+7 all year. */
const instant = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`).toISOString();

/** The request's own problems, as the real server answers them; null when it is fine. */
function requestProblem(body: ImportBody): Response | null {
  if (body.groupId !== GROUP_ID) {
    return HttpResponse.json(apiError('Group not found', 'GROUP_NOT_FOUND'), { status: 404 });
  }
  if (body.locationId !== LOCATION_ID) {
    return HttpResponse.json(apiError('locationId does not match this session\'s sport', 'SESSION_LOCATION_SPORT_MISMATCH'), { status: 400 });
  }
  return null;
}

/** Matches every name of every game; returns the preview pieces and the unresolved names (first-seen order). */
function plan(body: ImportBody, store: ImportSession) {
  const unresolved = new Map<string, Member[]>();
  const aliases = new Map(Object.entries(body.aliases ?? {}).map(([name, id]) => [normalize(name), id]));
  const resolve = (name: string) => {
    const aliasId = aliases.get(normalize(name));
    const aliased = aliasId ? MEMBERS.find((m) => m.userId === aliasId) : undefined;
    if (aliased) return { name, userId: aliased.userId, fullName: aliased.fullName };
    const matches = MEMBERS.filter((m) => normalize(m.firstName) === normalize(name));
    if (matches.length === 1) return { name, userId: matches[0].userId, fullName: matches[0].fullName };
    if (!unresolved.has(name)) unresolved.set(name, matches);
    return { name, userId: null, fullName: null };
  };
  const sessions = body.sessions.map((s) => ({
    title: s.title,
    localDate: s.localDate,
    scheduledStart: instant(s.localDate, s.startTime),
    scheduledEndAt: instant(s.localDate, s.endTime),
    exists: store.imported.has(`${instant(s.localDate, s.startTime)}|${s.title}`),
    games: s.games.map((g) => ({ winners: g.winners.map(resolve), losers: g.losers.map(resolve) })),
  }));
  return { sessions, unresolved };
}

export const adminImportHandlers: HttpHandler[] = [
  http.post('/api/sessions/import/preview', async ({ request }) => {
    if (!request.headers.get('Authorization')) return HttpResponse.json(apiError('Unauthorized', 'UNAUTHORIZED'), { status: 401 });
    const body = (await request.json()) as ImportBody;
    const problem = requestProblem(body);
    if (problem) return problem;
    const { sessions, unresolved } = plan(body, importSessions.get(sessionIdFromRequest(request)));
    return HttpResponse.json(apiResponse({
      hostUserId: OWNER_ID,
      sessions,
      unresolved: [...unresolved].map(([name, matches]) => ({ name, candidates: matches.map(candidate) })),
      canApply: unresolved.size === 0,
      members: [...MEMBERS].sort((a, b) => normalize(a.fullName).localeCompare(normalize(b.fullName))).map(candidate),
    }));
  }),

  http.post('/api/sessions/import', async ({ request }) => {
    if (!request.headers.get('Authorization')) return HttpResponse.json(apiError('Unauthorized', 'UNAUTHORIZED'), { status: 401 });
    const body = (await request.json()) as ImportBody;
    const problem = requestProblem(body);
    if (problem) return problem;
    const store = importSessions.get(sessionIdFromRequest(request));
    const { sessions, unresolved } = plan(body, store);
    if (unresolved.size > 0) {
      return HttpResponse.json(
        apiError('Some names do not match exactly one member of the group', 'SESSION_IMPORT_UNRESOLVED_NAMES', { names: [...unresolved.keys()] }),
        { status: 409 },
      );
    }
    const results = sessions.map((s) => {
      const key = `${s.scheduledStart}|${s.title}`;
      if (store.imported.has(key)) return { title: s.title, localDate: s.localDate, status: 'SKIPPED', sessionId: null };
      store.imported.add(key);
      return { title: s.title, localDate: s.localDate, status: 'CREATED', sessionId: store.nextId++ };
    });
    return HttpResponse.json(apiResponse({
      created: results.filter((r) => r.status === 'CREATED').length,
      skipped: results.filter((r) => r.status === 'SKIPPED').length,
      failed: 0,
      results,
    }));
  }),
];
