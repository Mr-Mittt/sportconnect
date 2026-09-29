import i18next from 'i18next';

/** Shared copy for the zero-sport-profile "add a sport first" gate (CLIENT-SESSION-7 follow-up)
 * — the page-access trigger on Groups/Matches/Profile uses this exact wording on every page, unlike
 * the create/join gates inside CreateSessionModal/SessionDiscoverModal, which are action-specific and
 * define their own message locally.
 *
 * CLIENT-I18N-7: a getter over `sharedComponents:addSport.pagePrompt` (was a string constant) — a
 * plain function reading the i18next singleton, like `relativeTime`. Call it at the moment the gate
 * fires, not at module load, so it reflects the active locale. */
export function getPageAccessNoSportsPrompt(): string {
  return i18next.t('sharedComponents:addSport.pagePrompt');
}
