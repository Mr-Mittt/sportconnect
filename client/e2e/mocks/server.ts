import { setupWorker } from 'msw/browser';
import { handlers } from './handlers/index.ts';

// Loaded directly by the browser under test (see test.ts's `page.addInitScript`
// dynamic import of this file's URL) — never imported by src/, so production
// bundles have zero knowledge MSW exists.
export const worker = setupWorker(...handlers);
