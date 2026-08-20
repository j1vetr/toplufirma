---
name: Dosya ve veritabanı tutarlılığı
description: Yerel diske yazılan kullanıcı görsellerinde dosya ve veritabanı kayıtlarını tutarlı tutma kuralı.
---

Yerel dosya sistemi ile veritabanı aynı transaction içinde çalışmadığından, görseller önce son isimleriyle yazılmamalıdır. Yüklemeler geçici bir staging adıyla yazılmalı, metadata kalıcı adıyla commit edildikten sonra terfi ettirilmeli ve uygulama başlangıcında geçici dosyalar metadata varlığına göre uzlaştırılmalıdır. Silme de tersine aynı kurtarılabilir akışla yapılmalıdır.

**Why:** İşlem ortasında uygulama kapanırsa doğrudan yazılan dosya sahipsiz kalabilir veya DB kaydı dosyasız kalabilir. Sadece normal hata yakalamak bu ani kapanma sınırını kapsamaz.

**How to apply:** Yerel disk üzerinde kullanıcı görseli ekleyen ya da silen her yeni özellikte pending ve deleting dosya durumları kullanın. Geçici dosyalar için başlangıçta metadata tablosuna bakın: kayıt varsa özgün konuma geri taşıyın veya terfi ettirin, kayıt yoksa temizleyin. DB kaydı tamamlandıktan sonra staging dosyasını genel rollback temizliğine dahil etmeyin.