---
name: API authorization and validation patterns
description: Common pitfalls in Express route handlers for this project — brace bugs and FK ownership checks
---

## Rule 1 — Always brace validation guards
Single-line `if` without braces causes `return;` to execute unconditionally:
```ts
// WRONG — return always runs, request hangs with no response
if (!field)
  res.status(400).json({ error: "..." });
  return;

// CORRECT
if (!field) {
  res.status(400).json({ error: "..." }); return;
}
```
**Why:** Happened in POST /faturalar, /odemeler, /starlink-planlari — each hung ~20s before aborting.

## Rule 2 — FK ownership validation on all write endpoints
Every FK reference in a write payload must be verified to belong to the same `sirketId`:
- `cariId` → `SELECT sirketId FROM cariler WHERE id = ?` → must equal payload `sirketId`
- `gemiId` → join `gemiler → cariler` → `cariler.sirketId` must equal payload `sirketId`
- `faturaId` → `SELECT sirketId FROM faturalar WHERE id = ?` → must equal payload `sirketId`
- `bankaHesabiId` → `SELECT sirketId FROM bankaHesaplari WHERE id = ?` → must equal payload `sirketId`

**Why:** Without this, a user in Company A can attach Company B's resources (e.g. faturaId) to their own write, causing cross-tenant data corruption.

## Rule 3 — healthz must be on public router
`/api/healthz` must be mounted in `app.ts` before `requireAuth`, not in the authenticated route index.
**Why:** Health checks from platform/infra probes are unauthenticated.

## Rule 4 — bagliFirmaId ownership: use gorunurBagliFirmaIds, not ustFirmaId
When validating that a `bagliFirmaId` belongs to a `catiFirmaId`, do NOT check `firmalar.ustFirmaId === catiFirmaId` directly. Use `gorunurBagliFirmaIds(catiFirmaId)` from `utils/gorunurluk`.
**Why:** baglı firmalar may be linked via a grupFirmaId chain (baglı→grup→catı), so `ustFirmaId` points to the grup firma, not the catı firma — direct comparison always fails for these cases.
