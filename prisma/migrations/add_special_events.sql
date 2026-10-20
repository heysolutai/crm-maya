-- Eventos especiais e inscritos (ferramentas da IA). Aplicada pelo prisma db push no boot.
CREATE TABLE IF NOT EXISTS special_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_info TEXT,
  event_date TIMESTAMP(3),
  image_urls TEXT[] NOT NULL DEFAULT '{}',
  extra_fields TEXT[] NOT NULL DEFAULT '{}',
  capacity INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_special_events_company ON special_events (company_id, is_active);

CREATE TABLE IF NOT EXISTS event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES special_events(id) ON DELETE CASCADE,
  conversation_id UUID,
  client_id UUID,
  name TEXT NOT NULL,
  phone TEXT,
  guests INTEGER,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  source TEXT NOT NULL DEFAULT 'ai',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_event_registrations_company ON event_registrations (company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON event_registrations (event_id);
