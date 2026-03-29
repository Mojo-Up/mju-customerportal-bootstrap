import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { msalInstance } from './auth/msalConfig';
import { getPendingPurchase } from './lib/pendingPurchase';
import './index.css';

msalInstance.initialize().then(() => {
  msalInstance.handleRedirectPromise().then((response) => {
    // If the user just completed a login and there's a pending purchase, redirect
    if (response && getPendingPurchase()) {
      window.history.replaceState(null, '', '/post-login');
    }

    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
});
