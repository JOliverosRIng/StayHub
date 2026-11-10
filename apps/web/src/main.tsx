import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import './index.css'

async function enableContractMocks(): Promise<void> {
  // Statically false in production builds, so the mock chunk is never emitted there.
  if (import.meta.env.DEV && import.meta.env.VITE_API_MOCKS === 'true') {
    const { startMockWorker } = await import('./mocks/browser');
    await startMockWorker();
  }
}

void enableContractMocks().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
