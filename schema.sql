-- Transport ERP Tracker — D1 schema
-- Current-state tables (fast reads) + a full history log (audit trail of every change)

CREATE TABLE IF NOT EXISTS task_progress (
  day INTEGER NOT NULL,
  member TEXT NOT NULL,
  task TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  updated_by_label TEXT,
  updated_at TEXT,
  PRIMARY KEY (day, member, task)
);

CREATE TABLE IF NOT EXISTS day_blockers (
  id TEXT PRIMARY KEY,
  day INTEGER NOT NULL,
  desc TEXT NOT NULL,
  owner TEXT,
  sev TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_by_label TEXT,
  created_at TEXT,
  resolved_by TEXT,
  resolved_by_label TEXT,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS task_blockers (
  id TEXT PRIMARY KEY,
  day INTEGER NOT NULL,
  member TEXT NOT NULL,
  task TEXT NOT NULL,
  desc TEXT NOT NULL,
  sev TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_by_label TEXT,
  created_at TEXT,
  resolved_by TEXT,
  resolved_by_label TEXT,
  resolved_at TEXT
);

-- Full audit trail: every mutation, ever, never deleted
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,          -- role id, e.g. 'M1', 'admin'
  actor_label TEXT NOT NULL,    -- display label, e.g. 'M1 — Web Developer'
  action TEXT NOT NULL,         -- 'task_progress' | 'day_blocker_add' | 'day_blocker_resolve' | 'day_blocker_reopen' | 'day_blocker_delete' | 'task_blocker_add' | 'task_blocker_resolve' | 'task_blocker_reopen' | 'task_blocker_delete'
  day INTEGER,
  member TEXT,
  task TEXT,
  detail TEXT                   -- human-readable summary, e.g. "0% → 50%" or the blocker description
);

CREATE INDEX IF NOT EXISTS idx_history_day ON history(day);
CREATE INDEX IF NOT EXISTS idx_history_ts ON history(id DESC);
