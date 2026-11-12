# ACCOUNT-8 · First name is required when editing the profile in account settings

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** none (pairs with auth A38) ·
**Filed:** 2026-11-11, from SESSION-49: the client's default session title uses the signed-in
user's `firstName`, which is optional today. SESSION-49 accepts that as a known gap; this closes
it for the profile edit path.

The form that edits the user's name rejects an empty first name, with the field marked required,
inline error text and en and vi copy (`client/CLAUDE.md` § i18n). If the backend `user` module also
accepts an empty first name on `PUT` of the profile, that is a backend change to settle at pickup:
a coded error (C12) and its `errors:codes` entry, in this ticket or a filed `user` ticket.

To settle at pickup: what an existing account with an empty first name sees (the form should block
saving until it is filled, without blocking unrelated settings); the I18N-4 census row for this
form (`documentation/md/I18N_READINESS.md`).

**Out of scope:** the Keycloak register page (auth A38); last name.

**Tests:** Vitest for the validation and its en/vi messages; an e2e case if the account-settings
flow already has a spec; consumer census of every place that builds a name from `firstName`.
