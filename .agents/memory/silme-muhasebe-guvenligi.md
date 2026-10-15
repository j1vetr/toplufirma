---
name: Silme ve muhasebe güvenliği
description: Fatura ve yanlış açılan firma kayıtlarının silinmesindeki veri koruma kararları.
---

Fatura silinirken bu faturaya ait otomatik tahsilatlar kaldırılır. Elle girilmiş ödeme ve tahsilatlar silinmez, faturayla bağlantıları kaldırılarak cari hesapta korunur. Bu sonuçlar silme onayında açıkça belirtilmelidir.

**Why:** Bir faturayı silmek gerçek para hareketini ortadan kaldırmamalı. Öte yandan yalnızca faturanın ödendi işaretinden doğan otomatik tahsilat, fatura silindikten sonra bakiye yaratmamalı.

**How to apply:** Fatura silme yollarında bu ayrımı kalıcı otomatik kayıt işaretine göre yapın, açıklama metnine göre değil.

Firma ve grup silme alt kayıtları örtük olarak topluca silmez. Kullanıcı faturaları, ödemeleri ve diğer alt kayıtları açıkça temizledikten sonra bağlı firmayı ve grubu silebilir.

**Why:** Kullanıcı yanlış açılan bir grup ve alt firmayı kaldırmak istedi. Kapsamı belirsiz tek tıklamalı toplu silme, başka kayıtları da kaybettirebilir.

**How to apply:** Firma silmede yönetici yetkisini koruyun ve bağımlılık varsa anlaşılır hata gösterin.
