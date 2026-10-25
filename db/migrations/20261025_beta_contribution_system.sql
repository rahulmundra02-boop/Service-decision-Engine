-- Beta-only contribution system schema.
-- Review and apply manually after staging verification. This file does not run automatically.
-- Existing app_users.status is intentionally not modified by this migration.

BEGIN;

CREATE TABLE IF NOT EXISTS contribution_months (
  month_start DATE PRIMARY KEY,
  month_end DATE NOT NULL,
  target_points INTEGER NOT NULL DEFAULT 50 CHECK (target_points = 50),
  free_month BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (month_end >= month_start)
);

CREATE TABLE IF NOT EXISTS contribution_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_user_id BIGINT REFERENCES app_users(id),
  status TEXT NOT NULL DEFAULT 'Available'
    CHECK (status IN ('Available','Assigned','Submitted','Processing','Completed','Failed','Cancelled','Expired')),
  vehicle_vins TEXT[] NOT NULL,
  assigned_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cardinality(vehicle_vins) = 50),
  CHECK (array_position(vehicle_vins, NULL) IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_contribution_tasks_user_status
  ON contribution_tasks (assigned_user_id, status);
CREATE INDEX IF NOT EXISTS idx_contribution_tasks_expiry
  ON contribution_tasks (expires_at) WHERE status IN ('Assigned','Submitted','Processing');

-- A VIN must not be held by two simultaneously active tasks.
CREATE TABLE IF NOT EXISTS contribution_task_vehicles (
  task_id UUID NOT NULL REFERENCES contribution_tasks(id) ON DELETE CASCADE,
  vin TEXT NOT NULL,
  PRIMARY KEY (task_id, vin)
);

-- Active reservations are kept separately so completed/cancelled task history
-- does not permanently block a VIN from future eligibility.
CREATE TABLE IF NOT EXISTS contribution_vehicle_reservations (
  vin TEXT PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES contribution_tasks(id) ON DELETE CASCADE,
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, vin)
);

CREATE TABLE IF NOT EXISTS contribution_points_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id),
  month_start DATE NOT NULL REFERENCES contribution_months(month_start),
  task_id UUID REFERENCES contribution_tasks(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('earned','donated','received','used_for_eligibility','expired','admin_adjustment')),
  points INTEGER NOT NULL CHECK (points > 0),
  transfer_id UUID,
  idempotency_key TEXT NOT NULL UNIQUE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contribution_ledger_user_month
  ON contribution_points_ledger (user_id, month_start);

CREATE TABLE IF NOT EXISTS contribution_donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id BIGINT NOT NULL REFERENCES app_users(id),
  receiver_user_id BIGINT NOT NULL REFERENCES app_users(id),
  points INTEGER NOT NULL CHECK (points > 0),
  month_start DATE NOT NULL REFERENCES contribution_months(month_start),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sender_user_id <> receiver_user_id)
);

ALTER TABLE contribution_points_ledger
  ADD CONSTRAINT fk_contribution_ledger_transfer
  FOREIGN KEY (transfer_id) REFERENCES contribution_donations(id);

CREATE TABLE IF NOT EXISTS contribution_notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id),
  month_start DATE NOT NULL REFERENCES contribution_months(month_start),
  notification_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, month_start, notification_type)
);

-- November 2026 is configured as the universal free month.
INSERT INTO contribution_months (month_start, month_end, target_points, free_month)
VALUES (DATE '2026-11-01', DATE '2026-11-30', 50, TRUE)
ON CONFLICT (month_start) DO UPDATE
SET month_end = EXCLUDED.month_end,
    target_points = EXCLUDED.target_points,
    free_month = EXCLUDED.free_month;

COMMIT;
