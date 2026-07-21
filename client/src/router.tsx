import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { GroupsPage } from './features/groups/GroupsPage';
import { HomeFeedPage } from './features/home-feed/HomeFeedPage';
import { RootLayout } from './RootLayout';
import { AppShell } from './shared/components/AppShell';
import { ComingSoonPage } from './shared/components/ComingSoonPage';
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
      <Route path="/friends" element={<ComingSoonPage title="Friends" />} />
      <Route path="/groups" element={<GroupsPage />} />
      <Route path="/matches" element={<ComingSoonPage title="Matches" />} />
      <Route path="/profile" element={<ComingSoonPage title="Profile" />} />
    </Route>
  </Route>,
);

export const router = createBrowserRouter(routes);
