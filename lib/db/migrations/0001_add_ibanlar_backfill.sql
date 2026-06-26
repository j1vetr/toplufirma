-- Migration: Add ibanlar column to banka_hesaplari and backfill from legacy fields
-- Applied: 2026-06-26
-- This migration was run automatically by drizzle-kit push (schema DDL)
-- followed by the data backfill below.

-- DDL (handled by drizzle-kit push):
-- ALTER TABLE banka_hesaplari ADD COLUMN ibanlar jsonb DEFAULT '{}';

-- Data backfill — run once to migrate existing iban + para_birimi into ibanlar map:
UPDATE banka_hesaplari
SET ibanlar = jsonb_build_object(para_birimi, iban)
WHERE iban IS NOT NULL
  AND iban != ''
  AND para_birimi IS NOT NULL
  AND para_birimi != ''
  AND (ibanlar IS NULL OR ibanlar = '{}');
