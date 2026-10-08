import { useTranslation } from 'react-i18next';
import type { ChatActionFailureKind, ChatLoadFailure, ChatSendFailure } from '../chatErrors';
import type { ConnectionStatus } from '../types';

export type ChatVariant = 'direct' | 'group';

export interface ChatActionFailure {
  action: 'edit' | 'delete';
  kind: ChatActionFailureKind;
}

const RETRY_BUTTON_CLASS =
  'cursor-pointer rounded-lg border-hairline border-border px-3 py-1 text-2xs font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent';

/**
 * CLIENT-ERR-9: what the message area shows in place of the transcript when the conversation or
 * its history could not load. `unavailable` (403/404) is terminal and has no retry, so the rest of
 * the page keeps working without chat; `transient` offers a Retry.
 */
export function ChatLoadFailureNotice({
  failure,
  variant,
  onRetry,
}: {
  failure: ChatLoadFailure;
  variant: ChatVariant;
  onRetry?: () => void;
}) {
  const { t } = useTranslation('errors');
  if (failure === 'unavailable') {
    return (
      <p role="alert" className="text-2sm text-text-danger">
        {t(variant === 'group' ? 'chat.unavailableGroup' : 'chat.unavailableDirect')}
      </p>
    );
  }
  return (
    <div role="alert" className="flex flex-col items-start gap-1.5">
      <p className="text-2sm text-text-danger">{t('chat.loadFailed')}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={RETRY_BUTTON_CLASS}>
          {t('chat.retry')}
        </button>
      )}
    </div>
  );
}

/**
 * CLIENT-ERR-9: the lines above the composer — a failed send (the draft stays in the box, so Retry
 * re-sends it), a failed edit or delete, and the muted "Reconnecting…" while the WebSocket is down
 * (sends go over REST, so the composer stays usable).
 */
export function ChatComposerNotices({
  connectionStatus,
  sendFailure,
  actionFailure,
  onRetrySend,
}: {
  connectionStatus?: ConnectionStatus;
  sendFailure?: ChatSendFailure | null;
  actionFailure?: ChatActionFailure | null;
  onRetrySend?: () => void;
}) {
  const { t } = useTranslation('errors');
  // `unavailable` replaces the whole panel via `isError`, so no composer line is needed for it.
  const showSend = sendFailure === 'invalid' || sendFailure === 'transient';
  const actionKey = actionFailure
    ? actionFailure.kind === 'failed'
      ? `chat.${actionFailure.action}Failed`
      : `chat.${actionFailure.kind}`
    : null;
  return (
    <>
      {connectionStatus === 'reconnecting' && (
        <p className="px-3.5 pb-1 text-2xs text-text-muted" role="status">
          {t('chat.reconnecting')}
        </p>
      )}
      {showSend && (
        <div role="alert" className="flex items-center gap-2 px-3.5 pb-1">
          <p className="text-2xs text-text-danger">
            {t(sendFailure === 'invalid' ? 'chat.sendInvalid' : 'chat.sendFailed')}
          </p>
          {sendFailure === 'transient' && onRetrySend && (
            <button type="button" onClick={onRetrySend} className={RETRY_BUTTON_CLASS}>
              {t('chat.retry')}
            </button>
          )}
        </div>
      )}
      {actionKey && (
        <p role="alert" className="px-3.5 pb-1 text-2xs text-text-danger">
          {t(actionKey)}
        </p>
      )}
    </>
  );
}
