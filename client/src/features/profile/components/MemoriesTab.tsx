import { ComingSoonPage } from '@/shared/components/ComingSoonPage';

/**
 * The `/profile` page's Memories tab (PROFILE-3) — placeholder only. No
 * backend concept exists for "on this day" memories yet, so this renders
 * `ComingSoonPage` as-is rather than a mock timeline against nothing.
 */
export function MemoriesTab() {
  return <ComingSoonPage title="Memories" />;
}
