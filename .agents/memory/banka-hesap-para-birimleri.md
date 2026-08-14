---
name: Banka hesabı para birimleri
description: How to derive a bank account's registered currencies; scalar paraBirimi is often a stale TRY default
---

Bank accounts store currencies in two places: the scalar `paraBirimi` column and the keys of the `ibanlar` JSON (pb → IBAN). The bank-accounts UI saves only `ibanlar` and never sets the scalar, so `paraBirimi` frequently sits at the API default `TRY` even when the account has no TRY IBAN.

**Rule:** an account's registered currencies = dedupe(scalar `paraBirimi` + `ibanlar` keys). In the panel use the shared helper `hesapParaBirimleri()` (`artifacts/panel/src/lib/banka-para-birimleri.ts`) instead of reading `paraBirimi` alone.

**Why:** trusting the scalar made payment forms reset to TRY and hide the bank's real currencies.

**How to apply:** any UI or logic that offers/validates currencies per bank account must go through the union helper; treat the scalar alone as unreliable. Payment forms restrict currency options to this list when a bank is selected, preserving the user's selection when it is registered on the bank.
