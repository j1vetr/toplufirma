-- Kullanıcı bazlı modül izinleri: NULL = tüm modüller, dizi = sadece listelenen modüller.
ALTER TABLE kullanicilar ADD COLUMN IF NOT EXISTS modul_izinleri text[];
