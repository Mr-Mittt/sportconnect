import { IconShare } from '@tabler/icons-react';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';

interface ShareSessionButtonProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  onClick: () => void;
}

/**
 * CLIENT-SESSION-49: the Players section header's icon-only Share button (a share icon, `aria-label` and tooltip "Share this
 * session"). Same look as the section header buttons (`SectionActionButton`): a small outlined pill. `relative z-10` keeps it
 * above the host header's stretched toggle (see `SessionDetailModal`).
 */
export function ShareSessionButton({ onClick, i18nOverridePrefix }: ShareSessionButtonProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-label={t('detail.share.open')}
      title={t('detail.share.open')}
      onClick={onClick}
      className="relative z-10 h-7 shrink-0 rounded-full px-2"
    >
      <IconShare className="size-3.5" aria-hidden="true" />
    </Button>
  );
}
