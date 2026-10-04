import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';

export type ResourceUnavailableVariant =
  | 'notFound'
  | 'forbidden'
  | 'unavailable'
  | 'error'
  | 'network'
  | 'crash';

interface ResourceUnavailableProps {
  variant: ResourceUnavailableVariant;
  /** Primary action (go back, try again, reload). Omit to render the message alone. */
  onAction?: () => void;
  /** Overrides the variant's default action label (`errors:screens.<variant>.action`). */
  actionLabel?: string;
  /** Heading element; use `h1` when this is the whole page, `h2` (default) inside a page. */
  headingAs?: 'h1' | 'h2';
}

/** Body copy that lives under `screens.<variant>.body`; the rest reuse the category copy. */
const OWN_BODY: ReadonlySet<ResourceUnavailableVariant> = new Set(['notFound', 'crash']);

const CATEGORY_FOR_VARIANT = {
  forbidden: 'FORBIDDEN',
  unavailable: 'NOT_FOUND',
  error: 'INTERNAL',
  network: 'NETWORK',
} as const;

/**
 * CLIENT-ERR-1: the shared "can't show this" state — a deleted or invisible resource, a failed
 * page load, an offline client, an unknown route or a render crash. Presentational and
 * controlled: the page decides which variant applies (from `getApiError(error).category`) and
 * what the action does. Used by the router's catch-all and `errorElement`, and by page-level
 * queries from CLIENT-ERR-2..9 onward.
 */
export function ResourceUnavailable({
  variant,
  onAction,
  actionLabel,
  headingAs: Heading = 'h2',
}: ResourceUnavailableProps) {
  const { t } = useTranslation('errors');
  const body = OWN_BODY.has(variant)
    ? t(`screens.${variant}.body`)
    : t(`category.${CATEGORY_FOR_VARIANT[variant as keyof typeof CATEGORY_FOR_VARIANT]}`);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-10 text-center">
      <Heading className="text-xl font-bold text-text-primary">{t(`screens.${variant}.title`)}</Heading>
      <p className="text-2sm text-text-muted">{body}</p>
      {onAction && (
        <Button variant="primary" onClick={onAction} className="mt-2">
          {actionLabel ?? t(`screens.${variant}.action`)}
        </Button>
      )}
    </div>
  );
}
