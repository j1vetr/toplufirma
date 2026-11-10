---
name: Per-currency accounting semantics
description: Canonical formula for alacak/tahsilat/bakiye totals; never mix currencies in one number
---

Canonical semantics (source of truth: cariler `buildBakiyeDetay`):
- **Borç (alacak)** = `genelToplam` of invoices with durum NOT in (`taslak`, `iptal`) + payments with tip=`odeme`
- **Tahsilat** = payments with tip=`tahsilat`
- **Bakiye/kalan** = borç − tahsilat
- Always computed **per para birimi** (null currency defaults to "USD"); include currencies that appear only in payments; drop all-zero rows (>0.005 threshold).

**Why:** Dashboard once summed `genelToplam` across mixed currencies into one "USD"-labeled figure with a different invoice-status scope, so dashboard and cariler totals disagreed — a user-reported bug.

**How to apply:** Any new total/summary (dashboard KPIs, reports, exports) must reuse this per-currency formula and render one line per currency. Never add EUR+USD into a single number.

## Elle "odendi" işaretleme tahsilat kaydı üretmeli
Cari ekstre tahsilatı YALNIZCA odemeler (tip=tahsilat) satırlarından hesaplar; fatura.durum'a bakmaz.
**Rule:** Fatura durumu elle "odendi" yapılan her yol (toplu durum, tekil PATCH, durumOverride ile oluşturma) kalan tutar kadar otomatik tahsilat kaydı oluşturmalı — transaction içinde, fatura satırı FOR UPDATE kilitliyken (eşzamanlı isteklerde çift tahsilat riski).
**Why:** Ödendi görünen faturalar ekstrede tam borç olarak kalıyordu (kullanıcı canlıda 4000 USD hatalı bakiye gördü).
**How to apply:** Yeni bir "ödendi yap" yolu eklenirse odendiTahsilatTamamla benzeri kalan-tamamlama aynı transaction'da çağrılmalı; işlem idempotent (kalan<=0 → no-op), bu yüzden zaten ödendi faturayı tekrar işaretlemek eski bozuk kayıtları onarır.

## Rapor dönemleri ve nakit ayrımı
Raporlarda seçilen dönem, faturalar için kesim tarihini, nakit için para hareketinin kendi tarihini ifade eder. Seçilen dönemin fatura ödeme ve kalanları bugünkü durumdur, geçmiş ay sonu bakiyesi değildir. Dönem net hareketi de tüm zamanların cari bakiyesi olarak sunulmaz. KDV raporu yalnızca tamamen ödenmiş faturaları değil, taslak ve iptal dışındaki geçerli faturaları kapsar.

**Why:** Kullanıcı raporların tutarları iki kez gösterdiğinden şüphelendi ve anlaşılır aylık raporlar istedi. Fatura ödeme durumunu nakit akışı gibi sunmak, özellikle önceden alınan tahsilatların sonradan dağıtılmasında yanıltıcıdır.

**How to apply:** Yeni rapor ve grafiklerde faturaya sayılan tutarı dönem nakit tahsilatı olarak adlandırma. Bugünkü fatura alacağını tarihsel ay sonu bakiyesinden açıkça ayır. Gerçek nakit girişine eşleştirme tutarını ikinci kez ekleme.
