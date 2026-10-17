/*
 * AUTH-15: the few Keycloak admin REST calls the real-Keycloak e2e needs — a test user to sign in
 * with, and placeholder identity providers so the provider buttons render without A29's real
 * Google / Facebook / Zalo apps. Everything created here lives in the e2e Keycloak container only
 * (infra/scripts/run-keycloak-e2e.sh starts a throwaway one); none of it is in the realm file.
 */
const keycloakUrl = process.env.KEYCLOAK_URL ?? 'http://localhost:8081';
const REALM = 'sportconnect';

async function adminToken(): Promise<string> {
  const response = await fetch(`${keycloakUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: process.env.KEYCLOAK_ADMIN ?? 'admin',
      password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
    }),
  });
  if (!response.ok) throw new Error(`Keycloak admin login failed: ${response.status}`);
  return ((await response.json()) as { access_token: string }).access_token;
}

async function admin(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await adminToken();
  return fetch(`${keycloakUrl}/admin/realms/${REALM}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers },
  });
}

export interface TestUser {
  username: string;
  email: string;
  password: string;
}

/** A fresh, enabled user with a password and a verified email. Returns its credentials. */
export async function createTestUser(label: string): Promise<TestUser & { id: string }> {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  // The username is the email (the realm no longer forces that: A27 sets it to the email when the form sends none).
  const email = `e2e-${label}-${stamp}@example.test`;
  const user = {
    username: email,
    email,
    password: `Pw-${stamp}-aA1!`,
  };
  const created = await admin('/users', {
    method: 'POST',
    body: JSON.stringify({
      username: user.username,
      email: user.email,
      emailVerified: true,
      enabled: true,
      firstName: 'E2E',
      lastName: 'User',
      credentials: [{ type: 'password', value: user.password, temporary: false }],
    }),
  });
  if (created.status !== 201) throw new Error(`create user failed: ${created.status} ${await created.text()}`);
  const id = created.headers.get('location')?.split('/').pop();
  if (!id) throw new Error('create user: no id in the Location header');
  return { ...user, id };
}

/** A user's profile attributes as Keycloak stores them (each value is a list), looked up by username. */
export async function getUserAttributes(username: string): Promise<Record<string, string[]>> {
  const found = await admin(`/users?username=${encodeURIComponent(username)}&exact=true`);
  const users = (await found.json()) as Array<{ attributes?: Record<string, string[]> }>;
  return users[0]?.attributes ?? {};
}

export async function deleteUserByUsername(username: string): Promise<void> {
  const found = await admin(`/users?username=${encodeURIComponent(username)}&exact=true`);
  const users = (await found.json()) as Array<{ id: string }>;
  for (const { id } of users) await admin(`/users/${id}`, { method: 'DELETE' });
}

/**
 * The realm file allows only the dev client's own origin (`http://localhost:5173`) as a redirect
 * URI. The e2e client runs on its own port, so this adds that origin to the web client of the e2e
 * Keycloak container (never to the committed realm).
 */
export async function allowClientOrigin(origin: string): Promise<void> {
  const found = await admin('/clients?clientId=sportconnect-web');
  const [client] = (await found.json()) as Array<{
    id: string;
    redirectUris: string[];
    webOrigins: string[];
    attributes: Record<string, string>;
  }>;
  if (!client) throw new Error('client sportconnect-web not found in the realm');
  const updated = await admin(`/clients/${client.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...client,
      redirectUris: [...new Set([...client.redirectUris, `${origin}/*`])],
      webOrigins: [...new Set([...client.webOrigins, origin])],
      attributes: {
        ...client.attributes,
        'post.logout.redirect.uris': `${client.attributes['post.logout.redirect.uris'] ?? ''}##${origin}/*`,
      },
    }),
  });
  if (!updated.ok) throw new Error(`update client failed: ${updated.status} ${await updated.text()}`);
}

/** Adds a placeholder OIDC provider (never used to sign in: its endpoints are not real). */
export async function ensureIdentityProvider(alias: string, displayName: string): Promise<void> {
  const existing = await admin(`/identity-provider/instances/${alias}`);
  if (existing.ok) return;
  const created = await admin('/identity-provider/instances', {
    method: 'POST',
    body: JSON.stringify({
      alias,
      displayName,
      providerId: 'oidc',
      enabled: true,
      config: {
        clientId: 'placeholder',
        clientSecret: 'placeholder',
        authorizationUrl: `https://${alias}.example.test/authorize`,
        tokenUrl: `https://${alias}.example.test/token`,
      },
    }),
  });
  if (created.status !== 201) {
    throw new Error(`create identity provider ${alias} failed: ${created.status} ${await created.text()}`);
  }
}
