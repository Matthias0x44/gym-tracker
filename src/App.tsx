import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import TodayView from './views/TodayView'
import ExercisesView from './views/ExercisesView'
import ExerciseDetail from './views/ExerciseDetail'
import BodyWeightView from './views/BodyWeightView'
import RoutinesView from './views/RoutinesView'
import RoutineDetail from './views/RoutineDetail'
import BackupView from './views/BackupView'

const tabs = [
  { to: '/', label: 'Today' },
  { to: '/exercises', label: 'Exercises' },
  { to: '/weight', label: 'Weight' },
  { to: '/routines', label: 'Routines' },
  { to: '/backup', label: 'Backup' },
]

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <main className="main">
          <Routes>
            <Route path="/" element={<TodayView />} />
            <Route path="/exercises" element={<ExercisesView />} />
            <Route path="/exercise/:id" element={<ExerciseDetail />} />
            <Route path="/weight" element={<BodyWeightView />} />
            <Route path="/routines" element={<RoutinesView />} />
            <Route path="/routine/:id" element={<RoutineDetail />} />
            <Route path="/backup" element={<BackupView />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
        <nav className="tabbar">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.to === '/'} className="tab">
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </HashRouter>
  )
}
