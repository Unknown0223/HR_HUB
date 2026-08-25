CREATE TABLE IF NOT EXISTS employee_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  note TEXT,
  file_name TEXT NOT NULL,
  file_key TEXT,
  file_url TEXT,
  content_type TEXT,
  file_size INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_files_tenant_employee_idx
  ON employee_files (tenant_id, employee_id);
