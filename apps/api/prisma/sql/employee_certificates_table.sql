CREATE TABLE IF NOT EXISTS employee_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  cert_type TEXT NOT NULL,
  cert_number TEXT NOT NULL,
  cert_date DATE,
  valid_from DATE,
  valid_until DATE,
  title TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_certificates_tenant_employee_idx
  ON employee_certificates (tenant_id, employee_id);
