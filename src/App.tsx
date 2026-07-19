import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import LogView from './views/LogView'
import RegimenListView, { RegimenDetailView } from './views/RegimenView'
import WeightView from './views/WeightView'
import BackupView from './views/BackupView'

const tabs = [
  { to: '/', label: 'Log' },
  { to: '/regimen', label: 'Regimen' },
  { to: '/weight', label: 'Weight' },
  { to: '/backup', label: 'Backup' },
]

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <main className="main">
          <Routes>
            <Route path="/" element={<LogView />} />
            <Route path="/regimen" element={<RegimenListView />} />
            <Route path="/regimen/:id" element={<RegimenDetailView />} />
            <Route path="/weight" element={<WeightView />} />
            <Route path="/backup" element={<BackupView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <nav className="tabbar">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </HashRouter>
  )
}
