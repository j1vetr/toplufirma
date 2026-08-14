---
name: OpenAPI spec drift vs API responses
description: Panel type errors usually mean openapi.yaml is missing a field the API actually returns; fix the spec, not with casts
---
Rule: when panel code needs an `as unknown as` cast to read an API field, the field exists in the real API response but is missing from `lib/api-spec/openapi.yaml`. The spec is the source of truth for generated client types.
**Why:** API route formatters return more fields than the spec declared, so generated client types lagged behind and unknown-casts crept into the panel, hiding real type errors.
**How to apply:** add the missing field to the schema in `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen` (orval + patch-zod-types + typecheck:libs), then use the typed field directly. Never re-add unknown casts.
