import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ensureSeed } from './db'
import { cloudConfigured, initCloudSync } from './sync'

async function boot() {
  const sync = await initCloudSync()
  // Never seed demo lifts when cloud sync is on — that polluted D1 with presets.
  // Only seed a brand-new offline browser with no cloud token.
  if (!cloudConfigured() && (sync === 'skipped' || sync === 'error')) {
    await ensureSeed()
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
