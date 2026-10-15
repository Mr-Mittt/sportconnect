import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { KcPage } from './kc.gen';

// Keycloak injects `window.kcContext` into the served page. Pages are developed in Storybook
// (src/login/KcPage.stories.tsx), not here.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {!window.kcContext ? <h1>No Keycloak Context</h1> : <KcPage kcContext={window.kcContext} />}
  </StrictMode>,
);
