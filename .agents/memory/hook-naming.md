---
name: Orval Hook Naming Convention
description: How Orval generates React Query hook names from OpenAPI spec
---

# Orval Hook Naming

## Rule
Orval generates **`useListXxx`** for collection endpoints (GET /xxx), not `useGetXxx`.
Single-resource hooks are `useGetXxx` (GET /xxx/:id).

**Why:** Caused a runtime SyntaxError when `useGetSirketler` was imported — the hook doesn't exist, breaking the entire app bundle.

## How to apply
Before importing any generated hook, verify the name in `lib/api-client-react/src/generated/api.ts`.
Common pattern:
- `useListSirketler()` — all companies
- `useGetSirket(id)` — single company
- `useListCariler(params)` — all clients with filter params
