# ADMIN-1 · `/admin` area — route, role guard, and shell

**Status:** `TODO` · **Type:** Feature (routing/infra) · **Filed:** 2026-08-20 ·
**Depends on:** nothing · **Blocks:** `ADMIN-2` ·
**Design:** `documentation/md/SPORT_ATTRIBUTE_SCHEMA_DESIGN.md` (the first thing `/admin` will host)

## Why a separate ticket

The app has **no admin surface at all** today — every `hasRole('ADMIN')` endpoint on the backend
(sport create/update/delete, location admin writes, and now `A9`'s schema `PUT`) is reachable only
by hand-crafted requests. `ADMIN-2` needs somewhere to live, and "where do admin pages go and who
can see them" is a routing/auth decision that outlives any single admin page. Splitting it keeps
`ADMIN-2` about the schema editor rather than about routing.

## The guard is nearly free — don't rebuild it

`ProtectedRoute` **already takes a `requiredRole` prop** and already implements exactly the needed
behaviour: waits for `authStore.isBootstrapping`, redirects to `/login` with the attempted path when
there's no user, and redirects to `/` when `requiredRole` is missing from `user.roles`. Its own doc
comment notes "no route uses requiredRole yet" — this ticket is that first use.

`User.roles` is `string[]` and the backend stores roles **unprefixed** (`'ADMIN'`, not
`'ROLE_ADMIN'` — `JwtAuthenticationFilter` adds the `ROLE_` prefix on the server side for Spring's
benefit only). So the guard is:

```tsx
<Route
  path="/admin"
  element={
    <ProtectedRoute requiredRole="ADMIN">
      <AdminLayout />
    </ProtectedRoute>
  }
>
  {/* ADMIN-2 adds its child route here */}
</Route>
```

Do **not** write a new `AdminRoute` component. If anything about `requiredRole` turns out to be
wrong, fix `ProtectedRoute`.

## What ships

- **Route** — `/admin` added to `router.tsx`'s tree, guarded as above.
- **`AdminLayout`** — a deliberately plain shell: a heading, a nav slot for future admin sections,
  and an `<Outlet />`. It sits **outside** `AppShell` (no TopBar/NavTabs) — admin is not part of the
  member-facing app chrome. Landing on `/admin` with no child route renders a minimal index listing
  the available sections (just "Sport attribute schemas" once `ADMIN-2` lands).
- **No nav entry.** `/admin` is not linked from anywhere in the member-facing UI in this ticket —
  an admin types the URL. Adding a conditional nav item is a later call, and keeping it unlinked
  avoids leaking the area's existence into every non-admin's DOM.

## Decision to confirm at pickup

**A non-admin currently gets silently redirected to `/`** (that is `ProtectedRoute`'s existing
behaviour, and its comment notes "no dedicated 'unauthorized' page exists"). That's acceptable for
an unlinked URL — arguably better than confirming the area exists. Flagged rather than changed:
building a 403 page is out of scope here, but if one is wanted it should be a `ProtectedRoute`-level
change serving every future role-gated route, not something `/admin` does for itself.

## Explicitly out of scope

Any actual admin functionality — that's `ADMIN-2` and whatever follows it. This ticket is the empty
room, and is verifiable on its own: an ADMIN user reaches `/admin`, a normal user doesn't, a logged-
out visitor gets the login redirect with bounce-back.

## Tests

- Vitest/RTL against `createMemoryRouter(routes, { initialEntries: ['/admin'] })` — the `routes`
  export exists precisely so tests build their own router instead of duplicating the tree. Cases:
  ADMIN user renders `AdminLayout`; `roles: ['USER']` redirects to `/`; no user redirects to
  `/login` carrying `state.from`; `isBootstrapping` shows the loading state rather than deciding
  early.
- Storybook: `AdminLayout` with and without a child route.
