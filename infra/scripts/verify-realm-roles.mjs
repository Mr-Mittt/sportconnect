// A37: live check of the realm roles on a RUNNING Keycloak (read-only). The backend reads the roles from the access token, so this proves
// the realm hands them out:
//
//   node infra/scripts/verify-realm-roles.mjs
//
//   - the realm roles USER and ADMIN exist;
//   - USER is part of the realm default role;
//   - no real user lacks USER (effective roles); service-account users are skipped;
//   - the access token of the real web client `sportconnect-web`, for one real user, carries USER in `realm_access.roles` (Keycloak's
//     "evaluate" endpoint builds the token the client would get, so no sign-in is needed). With no real user yet this one line is skipped.
//   - info: who holds ADMIN (never a failure; ADMIN is granted by hand).
//
// Prints "ok   ..." / "FAIL ..." per line and exits 1 if any FAIL. Overrides: KEYCLOAK_URL (default http://localhost:8081),
// KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD (default admin/admin), KEYCLOAK_REALM (default sportconnect).
const url = process.env.KEYCLOAK_URL ?? 'http://localhost:8081';
const realm = process.env.KEYCLOAK_REALM ?? 'sportconnect';
const PAGE = 100;

let bad = 0;
const say = (isOk, text) => {
  console.log(`${isOk ? 'ok  ' : 'FAIL'} ${text}`);
  if (!isOk) bad = 1;
};

const tokenResponse = await fetch(`${url}/realms/master/protocol/openid-connect/token`, {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: process.env.KEYCLOAK_ADMIN ?? 'admin',
    password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
  }),
});
if (!tokenResponse.ok) {
  console.error(`FAIL cannot log in to the master realm (${tokenResponse.status}); is Keycloak up at ${url}?`);
  process.exit(1);
}
const headers = { Authorization: `Bearer ${(await tokenResponse.json()).access_token}` };
const get = async (path) => {
  const response = await fetch(`${url}/admin/realms/${realm}${path}`, { headers });
  return response;
};
const json = async (path) => {
  const response = await get(path);
  if (!response.ok) throw new Error(`GET ${path} -> ${response.status}`);
  return response.json();
};

for (const name of ['USER', 'ADMIN']) {
  say((await get(`/roles/${name}`)).ok, `realm role ${name} exists`);
}
const members = await json(`/roles/default-roles-${realm}/composites`).catch(() => []);
say(members.some((r) => r.name === 'USER'), 'USER is in the realm default role');

const real = [];
for (let first = 0; ; first += PAGE) {
  const page = await json(`/users?first=${first}&max=${PAGE}`);
  real.push(...page.filter((u) => !u.username?.startsWith('service-account-')));
  if (page.length < PAGE) break;
}
let missing = 0;
for (const user of real) {
  const effective = await json(`/users/${user.id}/role-mappings/realm/composite`);
  if (!effective.some((r) => r.name === 'USER')) missing++;
}
say(missing === 0, missing === 0 ? `all ${real.length} real users hold USER` : `${missing} of ${real.length} real users lack USER (run apply-realm-roles.sh)`);

// the token the real web client would issue, for one real user
if (real.length === 0) {
  console.log('info no real user yet: the web client token line is skipped');
} else {
  const [web] = await json('/clients?clientId=sportconnect-web');
  const example = await get(`/clients/${web.id}/evaluate-scopes/generate-example-access-token?userId=${real[0].id}&scope=openid`);
  if (!example.ok) {
    say(false, `could not generate the web client's example token (${example.status})`);
  } else {
    const roles = (await example.json()).realm_access?.roles ?? [];
    say(roles.includes('USER'), `the sportconnect-web access token carries USER in realm_access.roles (${roles.sort().join(', ')})`);
  }
}

const admins = await json('/roles/ADMIN/users').catch(() => []);
console.log(`info ADMIN members: ${admins.length === 0 ? 'none (grant it by hand in the Keycloak console)' : admins.map((u) => u.username).join(', ')}`);

process.exit(bad);
