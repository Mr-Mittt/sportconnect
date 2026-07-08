import type { HttpHandler } from 'msw';
import { authHandlers } from './auth.ts';

// Feed/groups/sport handlers are deliberately NOT here yet — MSW-0's own
// acceptance criteria requires handlers to be typed against real types.ts
// files, and FEED-0/SPORT-1 (which create those files) haven't shipped. See
// the MSW-0 backlog entry's delta note. FEED-0/FEED-6/FEED-7/SPORT-1 add
// feed.ts/groups.ts/sport.ts here when they land — same pattern as
// home-feed-journey.spec.ts's documented MSW upgrade map.
export const handlers: HttpHandler[] = [...authHandlers];
