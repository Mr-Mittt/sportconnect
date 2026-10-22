# A27 · Keycloak Java extension: unique phone, email-or-phone, phone login (spike first)

**Status:** `DONE` (2026-10-16) · **Type:** Spike, then feature · **Depends on:** INFRA-13 · **Gates:** nothing in the code path (A26 has a backend fallback)

**Filed:** 2026-10-14, from the A23 findings (Keycloak enforces neither a unique custom attribute nor email-or-phone, and does not log in by phone).

**Delivery rule (owner, 2026-10-14): this work has its own branch, its own commit(s) and its own PR, separate from every other ticket.**

## What

> **Delta 2026-10-15 (email as username):** the realm now has `registrationEmailAsUsername: true` (`sportconnect-realm.json`; `dev-keycloak-theme.sh` sets it on an existing dev realm). The register page has no username field and Keycloak stores the email as the username, so `preferred_username` is the email. For phone users this ticket must therefore also decide Keycloak's internal username: Keycloak requires one, so the extension sets it to the E.164 phone for a phone-only user (never shown), and the register and login pages become "email or phone number".

> **Decision 2026-10-16 (owner, at pickup): the phone never blocks a registration.** On register and profile update the extension tries to normalise the typed phone (libphonenumber, default region VN, the same rule as the backend's `PhoneNumbers`). If it parses, the E.164 form is what is validated (uniqueness) and stored. If it does not parse, the raw text is what is validated and stored. Nothing here refuses a phone for its format; the backend still saves an unparseable one as `INVALID` (U25). Consequences the spike must confirm: (a) an unparseable phone is compared as raw text for uniqueness; (b) to match the backend, an unparseable phone alone does **not** satisfy email-or-phone (the U25 rule: an `INVALID` phone is not an identifier, so a phone-only account with one would fail first sign-in with `IDENTIFIER_REQUIRED` after the Keycloak account exists); with an email present the registration goes through and the phone is kept raw; (c) phone login only matches a parseable number.

> **Spike result 2026-10-16 (measured on Keycloak 26.4.7) and scope change (owner asked "can we use the phone as username?", yes).** Unique phone, E.164 normalisation, login by phone and the error messages all work as validators, an event listener and a browser-flow form; Keycloak marks all three SPIs "internal, may change", so every Keycloak upgrade needs a rebuild and `infra/scripts/verify-phone-rules.mjs`. Phone-only **self-registration** does not work while the realm has `registrationEmailAsUsername: true`: Keycloak requires the email before any validator runs (measured; with the flag off and a `username` field it succeeds). Scope change: **the Keycloak username becomes the identifier the user registered with** (email for an email user, as today; the E.164 phone for a phone-only user). Concretely: (1) the realm sets `registrationEmailAsUsername: false` (script + realm file; `dev-keycloak-theme.sh` stops forcing it on); (2) a registration form action, in a copy of the `registration` flow placed before "Registration User Profile Creation", fills a missing `username` with the email, else with the canonical phone, so the register page does not have to send one; (3) the backend must not turn a phone username into the public `users.username` (`UserServiceImpl.availableUsername` already ignores one containing `@`; it must ignore a phone too); (4) the login label (currently "email") and the register page's "email or phone" field and phone input stay a client ticket filed on completion. Existing dev users keep their email as username.

1. **Half-day spike** against Keycloak 26.4 in INFRA-13's Compose: can the user-profile validator SPI enforce unique phone and email-or-phone, does a failing validator make first-broker-login show the "complete your profile" page, and can an authenticator resolve a phone number to a user? Record the answers here. If any cannot be done, stop and record the fallback.
2. On a go, a new Gradle module (`keycloak-extensions`) producing one provider JAR: the unique-phone validator, the email-or-phone validator, and the phone-login authenticator (E.164 normalisation). The database unique index and check (U23) stay as the backstop.
3. Document the upgrade cost: SPI APIs can change between Keycloak majors, so each upgrade needs a rebuild and a test.

## Fallback

The A26 callback enforces both rules at provisioning (`PHONE_ALREADY_USED`, `IDENTIFIER_REQUIRED`) and **phone login is dropped**; this ticket then closes with the findings only.

## Out of scope

The theme (AUTH-15), providers (A29).

## Done when

The spike is recorded; on a go the JAR loads in Compose and a test proves the three behaviours; CI builds the module.

---

## Implementation summary (2026-10-16)

**Design as approved.** A spike, then a go: a Keycloak provider JAR (`infra/keycloak-extensions`, Gradle project `:infra:keycloak-extensions`, bundles libphonenumber) plus a realm script. Three owner decisions shaped it: (1) the phone never blocks a registration (normalise when it parses, otherwise keep and compare the raw text); (2) phone as username (the Keycloak username is the identifier the user registered with); (3) the realm leaves "email as username". See the two Deltas at the top of this file.

### Spike findings (Keycloak 26.4.7, dev realm, measured through the real pages)

| Question | Answer |
|---|---|
| Unique phone as a user-profile validator | **Works** (`sc-unique-phone`). Compares the canonical form, so `0901234567` and `+84 901 234 567` clash; the user being edited is excluded. Runs on register, account update and the admin API. |
| Email-or-phone as a validator | **Works** (`sc-email-or-phone`, on both `email` and `phoneNumber`). An unparseable phone alone does not count (matches the backend's `INVALID` rule, U25). |
| Where a phone is normalised | A validator cannot rewrite a value; an **event listener** on `REGISTER` / `UPDATE_PROFILE` (`sc-phone-normalizer`) stores the canonical form. |
| Phone login | **Works**: `sc-phone-login-form` subclasses `UsernamePasswordForm`, resolves the typed phone to its account and lets Keycloak's own password check run (lockout and events unchanged). Wired into a copy of the browser flow. |
| Phone-only registration | **Blocked by "email as username"** (Keycloak makes the email mandatory before any validator runs; measured). With the flag off and a `username` field it works. Resolved by decisions (2) and (3) and the registration form action below. |
| A failing validator leads to the profile page | Shown for the post-registration profile check (our error text appears on Keycloak's update-profile page). The real first-broker-login with a provider is **not** exercised here: A29 re-checks it with real providers. |
| Internal SPIs | Keycloak logs `KC-SERVICES0047` for all three SPIs used (validator, authenticator, event listener): "internal and may change without notice". |

### What was built

- **`infra/keycloak-extensions`** (one JAR, `sportconnect-keycloak-extensions.jar`): `PhoneRules` (the backend's rule: libphonenumber, region `VN`), `UniquePhoneValidator`, `EmailOrPhoneValidator`, `PhoneNormalizingEventListener` (+Factory), `PhoneLoginForm` (+Factory), `RegistrationUsernameFormAction` (+Factory; fills a missing `username` with the email, else the canonical phone, ahead of "Registration User Profile Creation"), and en/vi texts for the two error keys (`phoneNumberAlreadyUsed`, `emailOrPhoneRequired`) under `theme-resources/messages`. Keycloak jars are `compileOnly`, pinned to 26.4.7 like the image.
- **Realm** through `infra/scripts/realm-phone-rules.mjs` (`api` and `file` modes) and `apply-realm-phone-rules.sh`: validators on the user profile, the listener, the flows `sportconnect browser` and `sportconnect registration` (copies of the built-in ones plus our execution), both bound, and `registrationEmailAsUsername: false`. `file` copies the result from the running Keycloak into `sportconnect-realm.json`, because a realm import that lists `authenticationFlows` replaces all of Keycloak's default flows. `infra/scripts/build-keycloak-extensions.sh` builds the JAR into `infra/keycloak/providers`. `dev-keycloak-theme.sh` no longer forces email-as-username.
- **Backend** (`UserServiceImpl.availableUsername`): a `preferred_username` that is a phone number is ignored, like one with `@`, so the phone never becomes the public `users.username`. Existing dev users keep their email as username.
- **Theme** (`Register.tsx`): the realm now lists a `username` attribute on the register page; it is rendered hidden and not required (the server fills it). It is hidden rather than removed because Keycloakify places the password fields after the username attribute.
- **CI**: the `server-ci` and `client-ci` path filters include the module; `run-keycloak-e2e.sh` builds the JAR (or takes `EXTENSION_JAR`) and mounts it next to the theme, because the committed realm now names its providers.
- **Filed**: client **AUTH-18** (register and login pages for a phone: phone field, "email or phone" label, error placement, en and vi).

### Behaviour, as verified (`infra/scripts/verify-phone-rules.mjs`, 18 checks against the dev Keycloak)

Register with an email and a national phone stores `+84...` and keeps the email as username; sign-in by the national form, the E.164 form and the email all return a token, and a wrong password by phone is refused; the same number in another spelling is refused; neither email nor phone is refused; a phone-only registration succeeds with the E.164 number as username and signs in by phone; an unparseable phone with an email is saved as typed, a second use of the same text is refused as taken, and one alone is not an identifier; an admin-API update to a taken number is refused while saving the user's own number is not a clash.

### Upgrade cost

The validator, authenticator and event-listener SPIs are Keycloak-internal and can change in any release. On each Keycloak upgrade: bump `keycloakVersion` in `infra/keycloak-extensions/build.gradle` and the image tag together, rebuild, run `:infra:keycloak-extensions:test`, run `infra/scripts/verify-phone-rules.mjs` against the new version, and re-run the `keycloak-e2e` job. The flow copies (`sportconnect browser`, `sportconnect registration`) are snapshots of the built-in flows at creation; after an upgrade compare them with the new built-ins (a new default step would be missing from the copy).

### Consumer census

| Consumer | Verdict |
|---|---|
| `preferred_username` readers: `AuthServiceImpl.callback` to `ExternalIdentity.username` to `UserServiceImpl.availableUsername` (the only ones; grep of all modules) | **updated in this change** (phone ignored) |
| Realm `registrationEmailAsUsername` readers: the theme's `Login.tsx` label logic, `Register.tsx` (`UserProfileFormFields` inserts the password fields after the username attribute), `dev-keycloak-theme.sh`, the e2e specs' comments | **updated in this change** (Register hides username; script stops forcing the flag; comments); the login label now reads "username or email", its phone wording is AUTH-18 |
| Existing dev Keycloak users (9) | **compatible as-is** (their username is their email; none has a phone) |
| `sportconnect-realm.json` consumers: `run-keycloak-e2e.sh` and the `keycloak-e2e` job | **updated in this change** (the JAR is built and mounted); INFRA-14 note below |
| Backend `phone_number` claim readers (`AuthServiceImpl`, `UserServiceImpl` provisioning) | **compatible as-is** (they receive the canonical form or the typed text; `PhoneNumbers.classify` already handles both) |
| Client register/login copy and phone field | **deferred with a filed ticket**: client AUTH-18 |
| Accounts with no email now being creatable by self-registration (recovery, notifications) | **deferred**: auth A22 (Delta added); AUTH-18 should not go live before A22's minimum path is decided |

### Account lifecycle

No new backend endpoint or job. A deactivated user who signs in by phone reaches `/api/auth/callback` like any password sign-in and gets A26's `ACCOUNT_DEACTIVATED` with a ticket (unchanged path).

### IT changes

`UserIdentifierConstraintsIntegrationTest` (+1, now 17): a phone-only first sign-in whose token `preferred_username` is the E.164 phone is provisioned with no email, status `VALID` and a null public `username` (real MockMvc, real H2 round-trip). No other server IT changed; Keycloak itself is covered by the live script and the `keycloak-e2e` job, not by a Testcontainers Keycloak.

### Tests and verification

- `:infra:keycloak-extensions:test`: 36 Spock cases (`PhoneRulesSpec` 14, `ValidatorsSpec` 16, `RegistrationUsernameFormActionSpec` 6).
- `UserProvisioningSpec` +2 cases (phone `preferred_username`, both spellings).
- Live: `verify-phone-rules.mjs` 18/18 against the dev Keycloak; a second run of `apply-realm-phone-rules.sh` reports "already applied".
- `keycloak-e2e` (`infra/scripts/run-keycloak-e2e.sh`, a **fresh import of the committed realm file** with both JARs): 11/11 passed. The first runs failed 4 and then 3 of 11 on the register page: the username input appeared and, when removed, the password fields went with it; fixed in `Register.tsx` as above. This run also proves the realm-file mirror imports cleanly.
- `:server:test` and `:modules:user:user-impl:test`: `:server:test` 611 passed, 0 failed (43 classes; 610 before this ticket plus the new IT); `:modules:user:user-impl:test` green.

**E2E.** The client's main `e2e` project was not run: no `client/src` file changed (only the Keycloak theme package and e2e comments). The real-Keycloak project above was run in full.

**Visual-regression expectation:** the register page's rendered output is unchanged (the username input is hidden), so no baseline change is expected; theme baselines remain pending the `update-baselines` dispatch from AUTH-15/AUTH-16. Not run.

### Divergences from the plan

1. The plan said the realm's email-as-username stays; the spike showed phone-only registration needs the realm to leave it, so the ticket gained a registration form action, the backend username guard and a small `Register.tsx` change (owner-approved scope change).
2. `file` mode of the realm script copies from a running Keycloak instead of holding its own definition (a flows list in the import replaces all built-in flows).
3. First-broker-login with a real provider was not exercised (A29).

### Production notes (for INFRA-14)

Ship `sportconnect-keycloak-extensions.jar` and the theme JAR in the Keycloak image; the committed realm file will not import without the extensions JAR. Keycloak 26.4.x only (pinned). Run `verify-phone-rules.mjs` against a production-like stack once.
