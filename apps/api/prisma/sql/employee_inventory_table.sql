CREATE TABLE IF NOT EXISTS employee_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  inventory_type TEXT NOT NULL,
  inventory_number TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  manufacturer TEXT NOT NULL DEFAULT '',
  operation_at TIMESTAMPTZ,
  purchase_date DATE,
  location_name TEXT,
  user_name TEXT,
  responsible_name TEXT,
  status TEXT NOT NULL DEFAULT 'Получен',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_inventory_tenant_employee_idx
  ON employee_inventory (tenant_id, employee_id);
