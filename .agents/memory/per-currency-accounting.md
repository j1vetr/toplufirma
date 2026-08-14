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
