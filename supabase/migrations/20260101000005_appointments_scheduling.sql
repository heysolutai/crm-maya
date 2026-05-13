-- ============================================
-- Migration 005: Appointments & Scheduling
-- appointments, reminders, follow_up_jobs
-- ============================================

-- 1. Appointments
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  location TEXT,
  meeting_url TEXT,
  patient_name TEXT,
  status appointment_status DEFAULT 'scheduled',
  notes TEXT,
  google_event_id TEXT,
  reminder_sent BOOLEAN DEFAULT false,
  reminder_sent_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_company ON appointments(company_id);
CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_assigned ON appointments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled ON appointments(company_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(company_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_google ON appointments(google_event_id);

-- 2. Reminders
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  reminder_type TEXT,
  reminder_offset_minutes INTEGER,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  error_message TEXT,
  inbox_id UUID,  -- FK added after inboxes table creation (migration 006)
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminders_company ON reminders(company_id);
CREATE INDEX IF NOT EXISTS idx_reminders_client ON reminders(client_id);
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON reminders(scheduled_for, status);
CREATE INDEX IF NOT EXISTS idx_reminders_appointment ON reminders(appointment_id);

-- 3. Follow-up Jobs
CREATE TABLE IF NOT EXISTS follow_up_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  stage_order INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  error_message TEXT,
  inbox_id UUID,  -- FK added after inboxes table creation (migration 006)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_follow_up_company ON follow_up_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_scheduled ON follow_up_jobs(scheduled_for, status);
CREATE INDEX IF NOT EXISTS idx_follow_up_conversation ON follow_up_jobs(conversation_id);
