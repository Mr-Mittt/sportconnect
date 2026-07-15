import type { HttpHandler } from 'msw';
import { authHandlers } from './auth.ts';
import { feedHandlers } from './feed.ts';
import { groupHandlers } from './groups.ts';

// Sport handlers are deliberately NOT here yet — SPORT-1 (which creates
// its own types.ts) hasn't shipped. See the MSW-0 backlog entry's delta
// note; SPORT-1 adds sport.ts here when it lands, same pattern FEED-0 just
// followed for feed.ts.
export const handlers: HttpHandler[] = [...authHandlers, ...feedHandlers, ...groupHandlers];
