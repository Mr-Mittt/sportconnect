/** The fixed skill-level set offered at sport-profile creation (`AddSportFields`) and reused for
 * editing one afterward (`SportProfileSettingsTab`, PROFILE-4) — `UserSportProfile.skillLevel` is a
 * free `String` server-side (no enum), so this is a client-only convention, not a backend contract.
 * Declared in its own file, not a component, so it can be exported without breaking Fast Refresh. */
export const SKILL_LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];
