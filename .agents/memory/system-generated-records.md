---
name: Sistemce üretilen kayıtların kökeni
description: Otomatik oluşturulan kayıtları metin işaretiyle değil kalıcı kolonla tanı
---

Sistemin ürettiği kayıtları (örn. fatura "ödendi" işaretlenince oluşan otomatik tahsilat) elle girilenlerden ayırmak için kullanıcı tarafından düzenlenebilir alanlara (açıklama soneki gibi) dayanma; kalıcı, API'den yazılamayan bir provenance kolonu kullan (odemeler.otomatik örneği).

**Why:** Düzenlenebilir metne dayanan ayrım iki yönde bozulur — kullanıcı açıklamayı değiştirince otomatik kayıt tanınmaz olur, aynı metni taşıyan elle girilmiş kayıt ise yanlışlıkla silinir. Aynı nedenle metne dayalı geri doldurma (backfill) da güvensizdir: belirsiz eski kayıtlar "elle girilmiş" kabul edilmeli, asla otomatik silinmemelidir.

**How to apply:** Otomatik oluşup sonradan geri alınabilen kayıtlar için provenance kolonunu insert'te işaretle, geri almada yalnız o kolona filtrele, kullanıcı create/update gövdelerinin kolonu yazamadığından emin ol.
