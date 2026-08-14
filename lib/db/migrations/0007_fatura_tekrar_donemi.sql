-- Tekrarlayan fatura üretiminde mükerrer koruması:
-- üretilen fatura kaynak tanımı ve dönemi (YYYY-MM) taşır;
-- unique index aynı tanım + dönem için ikinci faturayı DB seviyesinde engeller.
-- (Normal faturalarda her iki kolon NULL kalır, NULL'lar çakışma yaratmaz.)

ALTER TABLE faturalar
  ADD COLUMN IF NOT EXISTS tekrarlayan_fatura_id integer REFERENCES tekrarlayan_faturalar(id) ON DELETE SET NULL;

ALTER TABLE faturalar
  ADD COLUMN IF NOT EXISTS tekrar_donemi text;

CREATE UNIQUE INDEX IF NOT EXISTS faturalar_tekrar_donem_unq
  ON faturalar (tekrarlayan_fatura_id, tekrar_donemi);
