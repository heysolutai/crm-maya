-- Migration: Department Round-Robin with Online Presence
-- Adds is_online to users, department_id to lead_distribution_state

-- 1. Add is_online column to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_users_is_online ON users(company_id, is_online) WHERE is_online = true;

-- 2. Add department_id to lead_distribution_state for per-department round-robin
ALTER TABLE lead_distribution_state
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE CASCADE;

-- 3. Drop old unique constraint on company_id alone
ALTER TABLE lead_distribution_state
  DROP CONSTRAINT IF EXISTS lead_distribution_state_company_id_key;

-- 4. Create partial unique indexes for both cases
-- Per-department state (department_id IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_dist_company_dept
  ON lead_distribution_state(company_id, department_id) WHERE department_id IS NOT NULL;

-- Company-wide state (department_id IS NULL) - preserves existing behavior
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_dist_company_wide
  ON lead_distribution_state(company_id) WHERE department_id IS NULL;
