import { Route, Routes } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { HomeFeedPage } from './features/home-feed/HomeFeedPage';
import { AppShell } from './shared/components/AppShell';
import { ComingSoonPage } from './shared/components/ComingSoonPage';

function App() {
  return (
    <Routes>
      {/* Pre-auth routes render outside AppShell — no TopBar/NavTabs for a
          logged-out visitor. */}
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppShell />}>
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
