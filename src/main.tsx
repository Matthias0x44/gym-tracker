import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ensureSeed } from './db'
import { initCloudSync } from './sync'

async function boot() {
  const sync = await initCloudSync()
  // Only seed demo lifts when this device has no data and cloud did not supply any.
  if (sync !== 'pulled') {
    await ensureSeed()
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
