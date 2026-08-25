ALTER TABLE gph_contracts ADD COLUMN IF NOT EXISTS division_id UUID;
ALTER TABLE gph_contracts ADD COLUMN IF NOT EXISTS person_id UUID;
ALTER TABLE gph_contracts ADD COLUMN IF NOT EXISTS allow_add_service BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE gph_contracts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE gph_contracts ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE gph_contracts ADD COLUMN IF NOT EXISTS posted_by TEXT;
UPDATE gph_contracts
SET status = 'posted',
    posted_at = COALESCE(posted_at, start_date)
WHERE is_active = true AND status = 'draft';
