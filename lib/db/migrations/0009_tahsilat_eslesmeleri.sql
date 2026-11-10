CREATE TABLE IF NOT EXISTS tahsilat_eslesmeleri (
  id serial PRIMARY KEY,
  tahsilat_id integer NOT NULL REFERENCES odemeler(id) ON DELETE CASCADE,
  fatura_id integer NOT NULL REFERENCES faturalar(id) ON DELETE CASCADE,
  tutar numeric(15,2) NOT NULL CHECK (tutar > 0),
  olusturma_tarihi timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tahsilat_fatura_eslesme_unique
  ON tahsilat_eslesmeleri(tahsilat_id, fatura_id);
