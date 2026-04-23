-- Create doctor_schedules table
CREATE TABLE IF NOT EXISTS "doctor_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "business_hours" JSONB NOT NULL DEFAULT '{}',
    "appointment_settings" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_schedules_pkey" PRIMARY KEY ("id")
);

-- Add schedule_id column to appointments
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "schedule_id" UUID;

-- Unique constraint: one schedule per user per company
CREATE UNIQUE INDEX IF NOT EXISTS "uq_doctor_schedule_company_user" ON "doctor_schedules"("company_id", "user_id");

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_doctor_schedules_company" ON "doctor_schedules"("company_id");
CREATE INDEX IF NOT EXISTS "idx_doctor_schedules_user" ON "doctor_schedules"("user_id");
CREATE INDEX IF NOT EXISTS "idx_appointments_schedule" ON "appointments"("schedule_id");

-- Foreign keys (idempotente — ADD CONSTRAINT nao tem IF NOT EXISTS, usa DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'doctor_schedules_company_id_fkey'
  ) THEN
    ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'doctor_schedules_user_id_fkey'
  ) THEN
    ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_schedule_id_fkey'
  ) THEN
    ALTER TABLE "appointments" ADD CONSTRAINT "appointments_schedule_id_fkey"
      FOREIGN KEY ("schedule_id") REFERENCES "doctor_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
