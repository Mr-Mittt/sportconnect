import type { HttpHandler } from 'msw';
import { authHandlers } from './auth.ts';
import { feedHandlers } from './feed.ts';
import { groupHandlers } from './groups.ts';
import { sportHandlers } from './sport.ts';

export const handlers: HttpHandler[] = [
  ...authHandlers,
  ...feedHandlers,
  ...groupHandlers,
  ...sportHandlers,
];
