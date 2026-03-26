-- ============================================
-- Migration: Departments + Multi-Pipeline System
-- Date: 2026-03-25
-- ============================================

-- 1. Create departments table
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_departments_company ON departments(company_id);

-- 2. Create department_members junction table
CREATE TABLE IF NOT EXISTS department_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('member', 'leader')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(department_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_department_members_dept ON department_members(department_id);
CREATE INDEX IF NOT EXISTS idx_department_members_user ON department_members(user_id);

-- 3. Create pipelines table
CREATE TABLE IF NOT EXISTS pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#10b981',
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipelines_company ON pipelines(company_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_department ON pipelines(department_id);

-- 4. Create pipeline_stages table
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  order_position INTEGER NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_final BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id);

-- 5. Add department_id to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_department ON conversations(department_id);

-- 6. Add pipeline_id to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clients_pipeline ON clients(pipeline_id);

-- 7. Data migration: Create default pipeline from existing funnel_stages
-- This migrates each company's funnel_stages into a default pipeline
DO $$
DECLARE
  comp RECORD;
  new_pipeline_id UUID;
BEGIN
  FOR comp IN SELECT DISTINCT company_id FROM funnel_stages LOOP
    -- Create default pipeline for this company
    INSERT INTO pipelines (company_id, name, description, color, is_default, is_active)
    VALUES (comp.company_id, 'Vendas', 'Pipeline padrão migrado do funil de vendas', '#10b981', true, true)
    RETURNING id INTO new_pipeline_id;

    -- Copy funnel_stages to pipeline_stages
    INSERT INTO pipeline_stages (pipeline_id, name, description, color, order_position, is_default, is_final, created_at, updated_at)
    SELECT new_pipeline_id, fs.name, fs.description, fs.color, fs.order_position, fs.is_default, fs.is_final, fs.created_at, fs.updated_at
    FROM funnel_stages fs
    WHERE fs.company_id = comp.company_id
    ORDER BY fs.order_position;

    -- Update clients with pipeline_id
    UPDATE clients SET pipeline_id = new_pipeline_id WHERE company_id = comp.company_id AND pipeline_id IS NULL;
  END LOOP;
END $$;

-- 8. Enable RLS on new tables
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

-- 9. RLS Policies for departments
CREATE POLICY "departments_company_isolation" ON departments
  FOR ALL USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

-- 10. RLS Policies for department_members
CREATE POLICY "department_members_company_isolation" ON department_members
  FOR ALL USING (department_id IN (
    SELECT id FROM departments WHERE company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  ));

-- 11. RLS Policies for pipelines
CREATE POLICY "pipelines_company_isolation" ON pipelines
  FOR ALL USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

-- 12. RLS Policies for pipeline_stages
CREATE POLICY "pipeline_stages_company_isolation" ON pipeline_stages
  FOR ALL USING (pipeline_id IN (
    SELECT id FROM pipelines WHERE company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  ));
