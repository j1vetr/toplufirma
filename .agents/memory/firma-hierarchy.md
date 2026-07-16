---
name: Firma hiyerarşisi ve cari gruplama
description: firmalar tablosundaki tip/ustFirmaId/grupFirmaId ilişkileri; cariler sayfasında gruplama nasıl yapılır
---

## Hiyerarşi: Kendi Firmamız → Grup Firma → Bağlı Firma

| tip    | örnek                  | nasıl tanınır                        |
|--------|------------------------|--------------------------------------|
| `cati` | ADE GLOBA SPACE LTD.   | `ust_firma_id IS NULL` = kök, kendi firmamız |
| `grup` | SEBA, BARLA, VARAN     | müşteri tarafındaki çatı grup şirketi |
| `bagli`| RESTFUL, STRAING vb.   | `grup_firma_id` → üst grup firmaya bağlı |

**Why:** `typ = "cati"` YALNIZCA kendi firmamız için kullanılıyor. Müşteri umbrella şirketler `tip = "grup"` ile kayıtlı. Bağlı firmalar grup firmaya `grupFirmaId` üzerinden bağlanıyor — `ustFirmaId` değil.

## Cariler sayfasında gruplama

- **Doğru:** `bf.grupFirmaId` → grup firma adını çek → o ad altında göster
- **Yanlış:** `bf.ustFirmaId` (bağlı firmaların ustFirmaId'si NULL)
- `grupFirmaId = NULL` olan bağlı firmalar → "Bağımsız Müşteriler" grubu (en sona)

## Admin sorgusu (gecerliFirmaIdleri)

Admin kullanıcı için `gecerliFirmaIdleri` = sadece `tip = "cati" AND ust_firma_id IS NULL` olan firmalar.  
Tüm `tip = "cati"` alınırsa grup firmaları da dahil olur ve gruplama bozulur.

**How to apply:** cariler.ts'de bağlı firma üst firma tespiti için her zaman `grupFirmaId` kullan; `ustFirmaId` null olabilir.
