---
name: Auth Architecture
description: JWT auth pattern, route ordering, RBAC roles
---

# JWT Auth Pattern

## Rule
Mount the auth router BEFORE requireAuth in app.ts:
```ts
app.use("/api", authRouter);      // public: /api/auth/login, /api/auth/me
app.use("/api", requireAuth, router); // protected: everything else
```

**Why:** If requireAuth comes first, login endpoint itself gets blocked with 401.

## How to apply
- Any new public endpoint (e.g. health check, webhook) must be mounted before the `requireAuth` line.
- Token stored in localStorage as `panel_token`; retrieved via `setAuthTokenGetter(() => localStorage.getItem("panel_token"))` in main.tsx.

## Roles
- `yonetici` — full access to all companies and user management
- `muhasebeci` — read/write on assigned companies, no user management
- `salt_okunur` — read-only on assigned companies (blocked by requireYazma)

## Company scoping
`req.izinliSirketler` = array of sirketId from JWT payload.
`sirketErisimKontrol(id, req)` returns true for yonetici always; others only if id is in izinliSirketler.
