import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
import { getApiError } from '@/shared/lib/apiError';
import { ResourceUnavailable, type ResourceUnavailableVariant } from './ResourceUnavailable';

/** Catch-all (`*`) route: a URL no route matches. Outside `AppShell` on purpose. */
export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-0">
      <ResourceUnavailable variant="notFound" headingAs="h1" onAction={() => navigate('/')} />
    </main>
  );
}

function variantFor(error: unknown): ResourceUnavailableVariant {
  if (isRouteErrorResponse(error)) return error.status === 404 ? 'notFound' : 'crash';
  const { category } = getApiError(error);
  switch (category) {
    case 'FORBIDDEN':
      return 'forbidden';
    case 'NOT_FOUND':
      return 'unavailable';
    case 'NETWORK':
      return 'network';
    case 'INTERNAL':
      return 'error';
    default:
      return 'crash';
  }
}

/**
 * Root `errorElement`: whatever a route throws while rendering (or a loader/action rejects) lands
 * here instead of React Router's raw default screen. Maps the error to a `ResourceUnavailable`
 * variant: a router 404 → not found; a classified API error → its category's variant; anything
 * else → the crash screen with a Reload action. "Back to home" for the not-found / no-access
 * variants and a reload for the rest, so the user always has a way out.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();
  const variant = variantFor(error);
  if (variant === 'crash') console.error(error);

  const goesHome = variant === 'notFound' || variant === 'forbidden' || variant === 'unavailable';
  const onAction = goesHome ? () => navigate('/') : () => window.location.reload();

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-0">
      <ResourceUnavailable variant={variant} headingAs="h1" onAction={onAction} />
    </main>
  );
}
