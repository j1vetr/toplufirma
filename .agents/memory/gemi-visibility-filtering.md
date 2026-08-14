---
name: Gemi visibility filtering
description: Always filter ships server-side via catiFirmaId param; client-side gemi.catiFirmaId checks silently drop ships
---

Rule: to scope ships to the active çatı firma, pass `catiFirmaId` as an API param to the gemiler list endpoint (its `gorunurBagliFirmaIds()` helper resolves grup visibility). Never filter client-side on `gemi.catiFirmaId`.

**Why:** The gemi API's `catiFirmaId` field mirrors the owning firma's `ustFirmaId`, and bağlı firms created through the UI get `ustFirmaId: null` (the firmalar create form never sends it — grouping is via `grupFirmaId`). Client-side `g.catiFirmaId === aktifSirketId` checks therefore silently hide those firms' ships. This broke the servis form's gemi dropdown (only 1 ship showed).

**How to apply:** Any dropdown/list of ships scoped to a company must use the server param. If a page client-filters on `catiFirmaId`, it's a bug of this class.
