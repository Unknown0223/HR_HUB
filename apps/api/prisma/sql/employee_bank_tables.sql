CREATE TABLE IF NOT EXISTS employee_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  account_number TEXT NOT NULL,
  mfo TEXT NOT NULL DEFAULT '',
  card_number TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_bank_accounts_tenant_employee_idx
  ON employee_bank_accounts(tenant_id, employee_id);

CREATE TABLE IF NOT EXISTS employee_bank_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  account_id UUID REFERENCES employee_bank_accounts(id) ON DELETE SET NULL,
  card_number TEXT NOT NULL,
  account_number TEXT NOT NULL DEFAULT '',
  bank_code TEXT NOT NULL DEFAULT '',
  expires_at DATE,
  state TEXT NOT NULL DEFAULT 'active',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_bank_cards_tenant_employee_idx
  ON employee_bank_cards(tenant_id, employee_id);
