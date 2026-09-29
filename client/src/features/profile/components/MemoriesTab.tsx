import { ComingSoonPage } from '@/shared/components/ComingSoonPage';
import { useOverridableText } from '@/shared/lib/useOverridableText';

/**
 * The `/profile` page's Memories tab (PROFILE-3) — placeholder only. No
 * backend concept exists for "on this day" memories yet, so this renders
 * `ComingSoonPage` as-is rather than a mock timeline against nothing.
 */
export function MemoriesTab({ i18nOverridePrefix }: { i18nOverridePrefix?: string }) {
  const t = useOverridableText('profilePage', i18nOverridePrefix);
  return <ComingSoonPage title={t('tabs.memories')} />;
}
