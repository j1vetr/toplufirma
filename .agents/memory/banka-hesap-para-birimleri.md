---
name: Banka hesabı para birimleri
description: How to derive a bank account's registered currencies when the legacy scalar is stale
---

Bank accounts store currencies in two places: the scalar `paraBirimi` column and the keys of the `ibanlar` JSON (pb → IBAN). Older records may have the API's `TRY` default in the scalar even when their recorded IBANs are only in other currencies.

**Rule:** when a bank account has one or more non-empty IBAN entries, those IBAN currencies are its complete registered currency list and the first is its scalar/default currency. Only use the scalar `paraBirimi` when no IBAN is recorded.

**Why:** unioning a stale scalar with IBAN keys creates a ghost TRY option and can make forms choose the wrong default currency.

**How to apply:** any UI or API logic that offers, validates, or defaults currencies per bank account must prefer non-empty `ibanlar` entries over the scalar. Bank-account writes must derive the scalar from those entries; legacy records are tolerated by the same derivation.
