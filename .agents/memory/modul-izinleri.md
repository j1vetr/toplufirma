---
name: Modül izinleri / yetki zorlaması
description: Durable authorization policy decisions for per-user module permissions.
---

# Yetki zorlaması politikası

**Rule:** Authorization state (rol, aktiflik, modül izinleri) is always resolved from the DB (short in-process cache, invalidated on user mutations), never trusted from JWT claims. JWT carries the same fields for panel UI rendering only.

**Why:** Tokens live ~30 days; a demoted admin, deactivated, or deleted user must lose access immediately with their old token. A completion review rejected an earlier version that exempted `rol === "yonetici"` straight from the JWT.

**How to apply:** Any new auth/permission check goes through the DB-backed status helper, not `req.kullanici.rol` alone (requireAuth refreshes rol from DB and rejects inactive/deleted users globally).

**Reference-data policy:** collection GETs of shared reference data (firma/gemi/kdv/seri/şablon lists) stay open to all authenticated users because forms across modules need them; detail GETs require the owning module — details embed cross-module data (e.g. ship detail embeds invoices), so "open reference read" must never be inherited by nested/detail paths.

**Route-rule hygiene:** module route rules are prefix-based; when adding a new router, add a matching rule or the routes pass through unrestricted. Prefixes must match real mounted paths (a review caught `/servis` guarding nothing because real routes were `/servis-kayitlari`, `/servis-dosyalari`).

**Schema changes:** dev uses drizzle push, but every new column also needs a numbered SQL migration in lib/db/migrations (idempotent `ADD COLUMN IF NOT EXISTS`) for existing/production databases.
