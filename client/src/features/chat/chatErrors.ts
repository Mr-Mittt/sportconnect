import { getApiError } from '@/shared/lib/apiError';

/** How an open-conversation or history-load failure is shown: the chat is gone for this user, or worth retrying. */
export type ChatLoadFailure = 'unavailable' | 'transient';

/** How a send failure is shown: no longer allowed, a rejected message (400), or worth retrying. */
export type ChatSendFailure = 'unavailable' | 'invalid' | 'transient';

/** How an edit or delete failure is shown: not the sender's message, the message is gone, or anything else. */
export type ChatActionFailureKind = 'notOwner' | 'gone' | 'failed';

/**
 * CLIENT-ERR-9: the chat service answers with a status (plain text or `{error, message}` JSON,
 * never an `errorCode`), so every chat failure is told apart by the classifier's category alone.
 * A 403/404 on open means the user is not a member or not friends (terminal for this chat).
 */
export function getChatLoadFailure(error: unknown): ChatLoadFailure {
  const { category } = getApiError(error);
  return category === 'FORBIDDEN' || category === 'NOT_FOUND' ? 'unavailable' : 'transient';
}

/** A 400 is an empty or over-long message: retrying the same text cannot succeed. */
export function getChatSendFailure(error: unknown): ChatSendFailure {
  const { category } = getApiError(error);
  if (category === 'FORBIDDEN' || category === 'NOT_FOUND') return 'unavailable';
  return category === 'VALIDATION' ? 'invalid' : 'transient';
}

/** An edit or delete 403 is `ErrNotSender`; a 404 is `ErrMessageNotFound`. */
export function getChatActionFailureKind(error: unknown): ChatActionFailureKind {
  const { category } = getApiError(error);
  if (category === 'FORBIDDEN') return 'notOwner';
  return category === 'NOT_FOUND' ? 'gone' : 'failed';
}
