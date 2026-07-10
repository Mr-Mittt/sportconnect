import { Route, Routes } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { useSessionBootstrap } from './features/auth/useSessionBootstrap';
import { HomeFeedPage } from './features/home-feed/HomeFeedPage';
import { AppShell } from './shared/components/AppShell';
import { ComingSoonPage } from './shared/components/ComingSoonPage';
import { ProtectedRoute } from './shared/components/ProtectedRoute';

function App() {
  // Restores the session from the httpOnly refresh cookie on every app
  // load, regardless of route — see AUTH-3.
  useSessionBootstrap();

  return (
    <Routes>
      {/* Pre-auth routes render outside AppShell — no TopBar/NavTabs for a
          logged-out visitor. */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<HomeFeedPage />} />
        <Route path="/friends" element={<ComingSoonPage title="Friends" />} />
        <Route path="/groups" element={<ComingSoonPage title="Groups" />} />
        <Route path="/matches" element={<ComingSoonPage title="Matches" />} />
        <Route path="/profile" element={<ComingSoonPage title="Profile" />} />
      </Route>
    </Routes>
  );
}

export default App;
