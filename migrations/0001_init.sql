-- Single-row snapshot store for the gym-tracker app state.
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
