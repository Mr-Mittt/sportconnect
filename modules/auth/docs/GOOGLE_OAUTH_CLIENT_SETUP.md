# Google sign-in: creating the OAuth client and wiring it into Keycloak (A29)

SportConnect signs users in with Google through Keycloak's built-in Google identity provider. Keycloak is the OAuth
client of Google; the browser never talks to Google on behalf of the app directly. What you need once:

## 1. Create the OAuth client (Google Cloud Console)

1. APIs & Services, OAuth consent screen: user type External, app name, support email, the developer contact. Scopes
   `openid`, `email`, `profile` are non-sensitive, so no Google review is needed to publish.
   **While the app is in "Testing" only the listed test users can sign in** (everyone else gets "access blocked").
   Add the testers, or switch to "In production" when the app should be open to all.
2. APIs & Services, Credentials, Create credentials, **OAuth client ID**, application type **Web application**.
3. **Authorised redirect URIs**: Keycloak's broker endpoint, exactly:
   - dev (Compose Keycloak): `http://localhost:8081/realms/sportconnect/broker/google/endpoint`
   - production: `https://<keycloak host>/realms/sportconnect/broker/google/endpoint` (INFRA-14 decides the host)
   Authorised JavaScript origins are not needed (the flow is a server-side redirect).
4. Download the JSON (`client_secret_<id>.apps.googleusercontent.com.json`).

`infra/scripts/realm-google-provider.mjs api` prints the redirect URI to register and says when the downloaded file does
not list it yet (a redirect URI that is not registered fails at Google with `redirect_uri_mismatch`).

## 2. Give it to Keycloak (never to git)

- Save the JSON as `infra/keycloak/providers/client_secret_*.json` (git-ignored), or export `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET`.
- `infra/scripts/apply-realm-google-provider.sh` creates or updates provider `google` in the running realm and enables it
  (idempotent; with no client it changes nothing). The committed realm file only holds a **disabled** `google` with
  placeholder credentials, so a re-imported realm never has a secret and no live Google button until the script ran.
- Production: the same script with `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` from the secret store (INFRA-14).

## 3. How an account is linked (and why it is never silent)

| Situation | What happens |
|---|---|
| Google email matches nobody | The account is created (names and email from Google, username filled by the A27 rule) and the user is in. |
| Same Google account again | Matched by Google's stable `sub`, straight in. |
| Email matches an existing account, not linked yet (any spelling of the same Gmail: A35) | One page says this email already has an account and offers two proofs: **Use my password** (default; the password field is on the page) or **Verify by email** (a link to the **existing** address, valid 30 minutes). A wrong password stays on the page. After the email, the page asks the user to check the mailbox, with Resend (opens after 60 s) and Back to log in (the email pre-filled). Either proof links Google to that account. The step is `sc-link-existing-account` (extensions JAR); `infra/scripts/apply-realm-link-existing-account.sh` puts it in the flow. |
| Deactivated account | A social sign-in reactivates it (A26, via the `identity_provider` claim). |

The provider has `trustEmail: false` on purpose: with it true Keycloak would link without proof, and while email
verification is off (A33) an unverified, pre-registered account could be taken over. Phone is never used to link.

## 4. Checking it

- `node infra/scripts/verify-google-provider.mjs`: the provider's configuration, plus the full "already signed up" path
  (confirmation page, email, link, password way, token claim) through a stub OpenID provider (Keycloak's Google provider
  cannot be pointed at a stub). Needs Keycloak and Mailpit running.
- A real Google sign-in is done by hand in a browser once the redirect URI is registered: `http://localhost:5173`, Log in,
  Continue with Google.
