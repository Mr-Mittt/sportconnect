import type { HttpHandler } from 'msw';
import { authHandlers } from './auth.ts';
import { chatHandlers } from './chat.ts';
import { feedHandlers } from './feed.ts';
import { friendHandlers } from './friends.ts';
import { groupHandlers } from './groups.ts';
import { locationHandlers } from './locations.ts';
import { sessionHandlers } from './sessions.ts';
import { sportHandlers } from './sport.ts';

export const handlers: HttpHandler[] = [
  ...authHandlers,
  ...feedHandlers,
  ...groupHandlers,
  ...sportHandlers,
  ...friendHandlers,
  ...chatHandlers,
  ...locationHandlers,
  ...sessionHandlers,
];
