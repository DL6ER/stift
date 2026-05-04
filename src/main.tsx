import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { useAuthStore } from './stores/authStore'

// If the OIDC bridge page just dropped username + authToken into
// localStorage, surface the session in the SPA store so the rest of the
// UI sees the user as authenticated. The encryption-key unlock step is
// gated by oidcNeedsUnlock and rendered by OidcUnlockGate.
useAuthStore.getState().hydrateOidcSession().catch(() => {})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
