CREATE TABLE IF NOT EXISTS employee_tenures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  tenure_type TEXT NOT NULL,
  still_working BOOLEAN NOT NULL DEFAULT false,
  counted_from DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_tenures_tenant_employee_idx
  ON employee_tenures (tenant_id, employee_id);

CREATE TABLE IF NOT EXISTS employee_workplaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  organization TEXT NOT NULL,
  position TEXT NOT NULL,
  org_address TEXT,
  start_date DATE,
  end_date DATE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_workplaces_tenant_employee_idx
  ON employee_workplaces (tenant_id, employee_id);

CREATE TABLE IF NOT EXISTS employee_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  award_type TEXT NOT NULL,
  doc_title TEXT,
  doc_number TEXT,
  award_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_awards_tenant_employee_idx
  ON employee_awards (tenant_id, employee_id);
