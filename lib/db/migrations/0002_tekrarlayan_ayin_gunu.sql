-- Migration: Add ayin_gunu column to tekrarlayan_faturalar
-- Applied: 2026-06-26
-- DDL applied via drizzle-kit push (schema-level change is safe; column is nullable)

-- DDL (handled by drizzle-kit push):
-- ALTER TABLE tekrarlayan_faturalar ADD COLUMN ayin_gunu integer;

-- Data backfill — populate ayin_gunu from the day component of sonraki_tarih
-- for all existing rows. Clamps to 28 to stay within the supported range (1-28).
UPDATE tekrarlayan_faturalar
SET ayin_gunu = LEAST(EXTRACT(DAY FROM sonraki_tarih::date)::integer, 28)
WHERE ayin_gunu IS NULL;

-- Optional guard: ensure future rows respect the 1-28 range via a check constraint.
-- (Uncomment if stricter enforcement is desired at DB level.)
-- ALTER TABLE tekrarlayan_faturalar
--   ADD CONSTRAINT tekrarlayan_faturalar_ayin_gunu_check
--   CHECK (ayin_gunu IS NULL OR (ayin_gunu >= 1 AND ayin_gunu <= 28));
