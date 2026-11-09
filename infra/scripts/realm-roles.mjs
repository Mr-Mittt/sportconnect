// A37: the realm roles the backend authorizes with. It reads them from the access token (`realm_access.roles`), so Keycloak must hold them.
//
//   node infra/scripts/realm-roles.mjs api    # apply to a running Keycloak through the admin API (+ the backfill of local users)
//   node infra/scripts/realm-roles.mjs file   # write the same roles and default-role entry into sportconnect-realm.json
//
// One definition, two targets, so the live realm and the realm file cannot drift (the realm-change rule in CLAUDE.md: every realm
// change goes through the admin API AND is mirrored in sportconnect-realm.json). Both modes are idempotent. Run `api` through
// infra/scripts/apply-realm-roles.sh; the live check is infra/scripts/verify-realm-roles.mjs.
//
// What it defines:
//   - the realm roles USER and ADMIN (ADMIN is created EMPTY: whoever is an admin is granted it by hand in the console);
//   - USER inside the realm default role `default-roles-<realm>`, so every account that holds the default role (every
//     registration, every existing normal account) has USER effectively and in its token;
//   - `api` only, the backfill (the safety net): any real user whose EFFECTIVE realm roles still lack USER (an account without the default
//     role) gets USER directly. Users are read 100 at a time; `service-account-*` users are skipped. Prints
//     "users: N checked, A already had USER, B fixed, C failed" and exits 1 if one could not be updated. The production twin of this is
//     infra/oracle/scripts/set-realm-roles.sh (INFRA-25), which runs inside the Keycloak container on the box.
//
// Overrides: REALM_FILE (`file` mode: another file than the committed realm, the tests use it); for `api`: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD (default admin/admin, the
// dev-only bootstrap account), KEYCLOAK_REALM (default sportconnect).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROLES = [
  { name: 'USER', description: 'Regular user; every account holds it through the realm default role' },
  { name: 'ADMIN', description: 'Platform administrator; granted by hand in the Keycloak console' },
];
const PAGE = 100;
const REALM_FILE = process.env.REALM_FILE ?? resolve(dirname(fileURLToPath(import.meta.url)), '../keycloak/realm/sportconnect-realm.json');

/** The default role's name for a realm: `default-roles-<realm>`. */
export const defaultRoleName = (realm) => `default-roles-${realm}`;


function applyToFile() {
  const raw = readFileSync(REALM_FILE, 'utf8');
  const realm = JSON.parse(raw);
  realm.roles = realm.roles ?? {};
  realm.roles.realm = realm.roles.realm ?? [];
  const upsert = (role) => {
    const existing = realm.roles.realm.find((r) => r.name === role.name);
    if (existing) Object.assign(existing, role);
    else realm.roles.realm.push(role);
  };
  // Keycloak's import wants the default role's members listed as realm roles too (found 2026-11-09 against Keycloak 26.4: without the two
  // built-ins in this list the import stops with "Unable to find composite realm role: uma_authorization").
  for (const [name, description] of [['offline_access', '${role_offline-access}'], ['uma_authorization', '${role_uma_authorization}']]) {
    if (!realm.roles.realm.some((r) => r.name === name)) realm.roles.realm.push({ name, description, composite: false, clientRole: false });
  }
  for (const role of ROLES) upsert({ name: role.name, description: role.description, composite: false, clientRole: false, attributes: {} });
  // The default role takes its members from the `roles.realm` entry of the same name; `defaultRole` only points at it. Both are needed: with
  // only the `roles.realm` entry Keycloak builds a second default role (`default-roles-<realm>-1`) and new users never get USER; with only
  // `defaultRole.composites` the members are ignored (both found against Keycloak 26.4 on 2026-11-09).
  const name = defaultRoleName(realm.realm);
  const existingEntry = realm.roles.realm.find((r) => r.name === name);
  const members = new Set(existingEntry?.composites?.realm ?? ['offline_access', 'uma_authorization']);
  members.add('USER');
  upsert({ name, description: existingEntry?.description ?? '${role_default-roles}', composite: true, clientRole: false, composites: { realm: [...members] } });
  realm.defaultRole = { name, description: '${role_default-roles}', composite: true, clientRole: false };
  writeFileSync(REALM_FILE, JSON.stringify(realm, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`realm file: roles ${ROLES.map((r) => r.name).join(', ')}; ${name} contains ${[...members].join(', ')}`);
}

async function applyToKeycloak() {
  const url = process.env.KEYCLOAK_URL ?? 'http://localhost:8081';
  const realm = process.env.KEYCLOAK_REALM ?? 'sportconnect';
  const tokenResponse = await fetch(`${url}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: process.env.KEYCLOAK_ADMIN ?? 'admin',
      password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
    }),
  });
  if (!tokenResponse.ok) throw new Error(`admin login failed: ${tokenResponse.status}`);
  const token = (await tokenResponse.json()).access_token;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const admin = `${url}/admin/realms/${realm}`;
  const call = async (method, path, body) => {
    const response = await fetch(`${admin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok && response.status !== 404) throw new Error(`${method} ${path} -> ${response.status} ${await response.text()}`);
    return response;
  };

  // 1. the roles
  for (const role of ROLES) {
    const found = await call('GET', `/roles/${role.name}`);
    if (found.status === 404) {
      await call('POST', '/roles', { name: role.name, description: role.description });
      console.log(`role ${role.name} created`);
    } else {
      console.log(`role ${role.name} exists`);
    }
  }
  const userRole = await (await call('GET', '/roles/USER')).json();

  // 2. USER in the realm default role
  const defaultRole = defaultRoleName(realm);
  const members = await (await call('GET', `/roles/${defaultRole}/composites`)).json();
  if (members.some((r) => r.name === 'USER')) {
    console.log('USER is already in the realm default role');
  } else {
    await call('POST', `/roles/${defaultRole}/composites`, [userRole]);
    console.log('USER added to the realm default role');
  }

  // 3. the backfill
  let checked = 0, had = 0, fixed = 0, failed = 0;
  for (let first = 0; ; first += PAGE) {
    const users = await (await call('GET', `/users?first=${first}&max=${PAGE}`)).json();
    for (const user of users) {
      if (user.username?.startsWith('service-account-')) continue;
      checked++;
      const effective = await (await call('GET', `/users/${user.id}/role-mappings/realm/composite`)).json();
      if (effective.some((r) => r.name === 'USER')) {
        had++;
        continue;
      }
      try {
        await call('POST', `/users/${user.id}/role-mappings/realm`, [userRole]);
        fixed++;
      } catch (error) {
        failed++;
        console.log(`could not give USER to user id ${user.id}`); // the id, never the email
      }
    }
    if (users.length < PAGE) break;
  }
  console.log(`users: ${checked} checked, ${had} already had USER, ${fixed} fixed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

const mode = process.argv[2];
if (mode === 'file') applyToFile();
else if (mode === 'api') await applyToKeycloak();
else {
  console.error('usage: node realm-roles.mjs <api|file>');
  process.exit(2);
}
