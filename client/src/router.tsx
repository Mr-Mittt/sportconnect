import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router-dom';
import { AdminIndex } from './features/admin/AdminIndex';
import { AdminLayout } from './features/admin/AdminLayout';
import { AdminSportsPage } from './features/admin/AdminSportsPage';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { FriendsPage } from './features/friends/FriendsPage';
import { GroupsPage } from './features/groups/GroupsPage';
import { HomeFeedPage } from './features/home-feed/HomeFeedPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { MatchesPage } from './features/session/MatchesPage';
import { RootLayout } from './RootLayout';
import { AppShell } from './shared/components/AppShell';
import { ProtectedRoute } from './shared/components/ProtectedRoute';
import { PublicOnlyRoute } from './shared/components/PublicOnlyRoute';

/**
 * Route tree (ROUTER-1, filed during GRP-2) — migrated from the old App.tsx's
 * <Routes>/<Route> to createRoutesFromElements so `useBlocker` (GRP-2's
 * unsaved-Settings-changes guard) is available; the JSX itself is unchanged
 * from what App.tsx rendered. Exported as `routes` (not just `router`) so
 * tests can build their own `createMemoryRouter(routes, {...})` instead of
 * duplicating this tree.
 */
export const routes = createRoutesFromElements(
  <Route element={<RootLayout />}>
    {/* Pre-auth routes render outside AppShell — no TopBar/NavTabs for a
        logged-out visitor. PublicOnlyRoute sends an already-authenticated
        visitor to Home Feed instead of showing the form again. */}
    <Route
      path="/login"
      element={
        <PublicOnlyRoute>
          <LoginPage />
        </PublicOnlyRoute>
      }
    />
    <Route
      path="/register"
      element={
        <PublicOnlyRoute>
          <RegisterPage />
        </PublicOnlyRoute>
      }
    />
    <Route
      element={
        <ProtectedRoute>
          <AppShell />
        </ProtectedRoute>
      }
    >
      <Route path="/" element={<HomeFeedPage />} />
      {/* FEED-12: same page, reused as-is (Option A) — HomeFeedPage reads
          :postId via useParams and pre-opens the comment dialog for it.
          Anonymous visitors get the same ProtectedRoute redirect-then-
          bounce-back every other deep link already gets (see ANON-1,
          client/docs/BACKLOG_V1.md, for the future "should this be
          publicly viewable" decision — not answered here). */}
      <Route path="/posts/:postId" element={<HomeFeedPage />} />
      <Route path="/friends" element={<FriendsPage />} />
      <Route path="/groups" element={<GroupsPage />} />
      <Route path="/matches" element={<MatchesPage />} />
      <Route path="/profile" element={<ProfilePage />} />
    </Route>
    {/* ADMIN-1: /admin sits outside the AppShell group on purpose — admin is not
        part of the member-facing chrome, so no TopBar/NavTabs. Still inside
        RootLayout, so useSessionBootstrap runs and an admin hard-refreshing on
        /admin isn't bounced to /login while the refresh check is in flight.
        Reuses ProtectedRoute's already-built requiredRole prop (this is its first
        use); roles are stored unprefixed, hence "ADMIN" not "ROLE_ADMIN".
        Not linked from anywhere — an admin types the URL. */}
    <Route
      path="/admin"
      element={
        <ProtectedRoute requiredRole="ADMIN">
          <AdminLayout />
        </ProtectedRoute>
      }
    >
      <Route index element={<AdminIndex />} />
      {/* ADMIN-2: two paths, one component — AdminSportsPage reads :sportId via
          useParams and opens the detail panel for it, same shape /posts/:postId
          → HomeFeedPage already uses (FEED-12). Keeps the table mounted while
          giving the panel deep-linking and browser back/forward. */}
      <Route path="sports" element={<AdminSportsPage />} />
      <Route path="sports/:sportId" element={<AdminSportsPage />} />
    </Route>
  </Route>,
);

export const router = createBrowserRouter(routes);
