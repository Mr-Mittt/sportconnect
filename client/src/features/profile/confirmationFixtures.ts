import type { CodeSender } from './useConfirmationCode';

/** A `CodeSender` for stories and component tests: nothing sent yet, nothing failing. */
export function makeCodeSender(overrides: Partial<CodeSender> = {}): CodeSender {
  return {
    send: () => {},
    isSending: false,
    hasSent: false,
    resendSecondsLeft: 0,
    expiresInSeconds: 900,
    errorMessage: null,
    ...overrides,
  };
}
