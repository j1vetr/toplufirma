-- Otomatik tahsilat kayıtları için kalıcı köken (provenance) işareti:
-- fatura "ödendi" işaretlenince sistemce üretilen tahsilatlar otomatik=true
-- ile eklenir. Ödendi geri alınınca silme yalnızca bu alana dayanır; kolon
-- kullanıcı API'sinden yazılamaz (create/update gövdesinde yok).
--
-- Bilinçli olarak geri doldurma (backfill) YOK: eski kayıtlar yalnızca
-- kullanıcı tarafından düzenlenebilir açıklama metniyle ayırt edilebilirdi,
-- bu da aynı metni taşıyan elle girilmiş bir tahsilatın yanlışlıkla
-- silinmesine yol açabilirdi. Belirsiz eski kayıtlar "elle girilmiş" kabul
-- edilir ve asla otomatik silinmez (gerekirse kullanıcı elle siler).

ALTER TABLE odemeler
  ADD COLUMN IF NOT EXISTS otomatik boolean NOT NULL DEFAULT false;
