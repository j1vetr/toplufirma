ALTER TABLE teklifler ADD COLUMN IF NOT EXISTS alici_firma_id integer REFERENCES firmalar(id);
