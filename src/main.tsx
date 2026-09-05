import { PhoneAppProvider } from '@fastrp/phone-app-sdk/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { sdk } from './phone';
import './styles.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('#root missing from index.html');
}

createRoot(root).render(
  <StrictMode>
    {/* The instance from phone.ts, so the handshake was sent before React mounted anything. */}
    <PhoneAppProvider sdk={sdk}>
      <App />
    </PhoneAppProvider>
  </StrictMode>,
);
