# A35 · `email_normalized`: one mailbox, one account (registration, profile update, first Google login)

**Status:** `DONE` (2026-10-18) · **Type:** Enhancement (Security) · **Depends on:** A27 (the provider JAR and realm-script pattern) · **Gates:** A29 (Google must find an existing account by its normalized email)

**Filed:** 2026-10-18, while scoping A29 with the owner: `jordan.lee.smith@gmail.com` and `jordan.leesmith@gmail.com` are the same Gmail mailbox, but Keycloak compares emails as exact lowercase strings, so a Google login would not find the password account and would create a second one (and two dotted variants can both register). Design agreed with the owner: store a normalized copy of the email and run the uniqueness checks on it.

## What

- **Rule (`EmailRules`, shared static helper like `PhoneRules`).** Lowercase everything. For `gmail.com` and `googlemail.com` only: remove dots and the `+tag` from the local part, and treat `googlemail.com` as `gmail.com`. Every other domain stays lowercase only (dots and `+` are significant there). The registered email stays as the user typed it (Keycloak already lowercases on save); only the copy is compared.
- **User attribute `email_normalized`**, declared in the realm user profile as admin-only (not editable or visible to the user, hidden on the register page like `username`). Set by an event listener on register, email change and first broker login; backfilled for existing users by a script.
- **Validator `sc-unique-email-normalized`** on the `email` attribute (registration and profile update), same shape as `sc-unique-phone`: another user with the same normalized value rejects it with a message key (en and vi in the extension's message bundles).
- **First broker login.** A custom step in the `sportconnect` copy of the first-broker-login flow replaces the exact-email "detect existing user" check with a lookup on `email_normalized`. A match goes into Keycloak's built-in "account already exists" confirmation (a link emailed to the existing address, or its password), **never a silent link**, so a pre-registered dotted variant cannot take over the real owner's Google login while email verification (A33) is still off. Linking by phone stays forbidden.
- Realm side through the admin API (`infra/scripts/realm-email-normalized.mjs`, `api|file` modes, plus an apply script) and mirrored in `infra/keycloak/realm/sportconnect-realm.json`, per the CLAUDE.md realm-change rule.
- Backend unchanged: `users.id` is the token `sub`, and Keycloak enforces uniqueness (no `users.email_normalized` column).

## Out of scope

The Google provider itself (A29), Facebook and Zalo (A34), a database-level unique index (Keycloak has none for attributes; two simultaneous registrations can race past the validator, as accepted for phones in A27), verifying emails (A33), any other domain's aliasing rules.

## Done when

Registering a second dotted/`+`/`googlemail` variant of an existing Gmail is rejected; a non-Gmail pair that differs by a dot stays distinct; the first-broker-login step finds the existing account by the normalized value and routes it to the confirmation (checked with a stubbed identity provider; the real Google check belongs to A29); backfill leaves every existing user with the attribute. Spock specs for the rule and validator, live verify script, and the `keycloak-e2e` job green.

---

## Built (2026-10-18)

**Design as approved, no divergence.** One Gmail mailbox, one account: a normalized copy of the email is stored and every uniqueness / existing-account check runs on it.

**Provider JAR (`infra/keycloak-extensions`)**
- `EmailRules.normalized`: lowercase for every domain; for `gmail.com` / `googlemail.com` only also no dots, no `+tag`, `googlemail.com` read as `gmail.com`. Other domains stay lowercase only (dots and `+` are significant there). A one-line domain table, so a provider can be added after checking its own documentation. Blank or not `local@domain` gives no key; a local part that would collapse to nothing keeps its lowercase form.
- `UniqueNormalizedEmailValidator` (`sc-unique-email-normalized`, message key `emailAlreadyUsed`, en and vi): refuses an email whose key belongs to another user, the edited user excluded. It is **skipped in the first-broker-login review step** (`IDP_REVIEW`), so a clash reaches the existing-account confirmation instead of showing a profile error.
- `EmailNormalizingEventListener` (`sc-email-normalizer`): sets or clears `email_normalized` on `REGISTER`, `UPDATE_PROFILE`, `UPDATE_EMAIL` and `IDENTITY_PROVIDER_FIRST_LOGIN`.
- `NormalizedCreateUserIfUniqueAuthenticator` (`sc-create-user-if-unique-normalized`): subclass of Keycloak's stock step; when the exact username / email check finds nobody it looks up `email_normalized` and reports the match like the stock check, so the flow goes on to "Handle Existing Account" (emailed link to the existing address, or its password). **Never a silent link.**

**Realm (`infra/scripts/realm-email-normalized.mjs`, `apply-realm-email-normalized.sh`, mirrored in `sportconnect-realm.json`)**
- Admin-only profile attribute `email_normalized` (never shown on the register or account pages), the validator on `email`, the listener, the flow `sportconnect first broker login` (stock flow copy with the step replaced), bound as the realm's `firstBrokerLoginFlow` and set on any provider that names the stock flow; `backfill` fills existing users (9 in dev, 0 problems). `file` mode copies the full flow set from the running Keycloak (additions only in the diff).
- **For A29:** create the Google provider **without** a `firstBrokerLoginFlowAlias`; Keycloak then uses the realm binding (checked on a stub provider). Naming the stock flow on a provider would bypass this ticket.

**Verification**
- Extension specs: 72 green (36 new: `EmailRulesSpec` 20, `EmailNormalizationSpec` 16).
- Live `infra/scripts/verify-email-normalized.mjs` against the dev Keycloak, 20 of 20: dotted / undotted / `+tag` / `googlemail` / upper-case spellings refused at registration; two Outlook addresses differing by a dot both accepted; the JavaScript backfill twin agrees with the Java listener; admin-API email change to a taken spelling refused, own save not a clash; first broker login through a **stub OpenID provider**: an unknown email creates the account (with its key), another spelling of a registered Gmail lands on the existing-account confirmation (no profile error, no second account, no link yet). `verify-phone-rules.mjs` still 18 of 18.
- A real Google login is **not** covered here: that is A29.

**Side fix in the same change (theme, owner decision 2026-10-18):** two visible regressions from A27 were fixed here instead of in a ticket of their own. The register page puts the email first again (`Register.tsx` places the hidden `username` attribute right after `email`; Keycloakify puts the password fields after it, so the page reads Email, Password, Confirm password, names, phone, zone), and the login field is labelled "Email" instead of "Username or email" (`Login.tsx`; the "Email or phone number" wording stays in client AUTH-18, parked with the phone OTP decision). `keycloak-e2e` gained assertions for the field order and the label (11 of 11 passed). The theme's register and login visual baselines change and wait for the `update-baselines` GitHub dispatch with the AUTH-15 / AUTH-16 ones already pending.

**Known limits:** Keycloak has no database unique index on an attribute, so two simultaneous registrations can race past the validator (accepted for phones in A27 as well). The JavaScript copy of the rule exists only for `backfill`; the Java class is the source of truth.

**Consumer census:** backend, chat and client never read or write `email_normalized` and never call the Keycloak admin API for email lookups: compatible as-is. The e2e helper `client/e2e/keycloak/keycloakAdmin.ts` only creates users and placeholder providers (compatible). **E2E:** `keycloak-e2e` (real Keycloak 26.4, fresh import of the updated realm file and the JAR): 11 of 11 passed, the register page still hides the new attribute. Main client `e2e` / visual regression not run: no `client/src` change.
