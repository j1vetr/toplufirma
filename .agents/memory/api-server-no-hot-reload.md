---
name: api-server no hot-reload
description: The Çoklu Firma api-server builds once at startup and does not watch — backend changes need a workflow restart before testing.
---

The `artifacts/api-server` dev workflow runs `pnpm run build && pnpm run start` (esbuild bundle, then `node dist/index.mjs`). It does **not** watch files.

**Why:** A backend route edit will appear to "not take effect" — curl hits the old bundle. This wasted a debugging cycle chasing a phantom 500 (a PATCH that was actually correct in source but stale in the running bundle).

**How to apply:** After editing anything under `artifacts/api-server/src`, restart the `artifacts/api-server: API Server` workflow before testing endpoints. Also note: errors are logged via pino-http as a generic wrapped "failed with status code 500" — your own `console.error` in a route's `catch` only shows up after a rebuild/restart, and route `catch {}` blocks here intentionally swallow the original error.
