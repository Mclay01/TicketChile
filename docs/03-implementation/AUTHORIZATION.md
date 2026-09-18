# Authorization boundary — M1

This records implemented behavior, not the future complete RBAC model.

| Surface | Identity / authority | Enforcement |
| --- | --- | --- |
| Admin list/detail/approve/publish APIs | `tc_admin_sess` resolved through `admin_sessions JOIN admin_users`, unexpired | `requireAdmin()` inside each of seven operational handlers; malformed IDs denied; store failures fail closed |
| Admin pages | Same persisted admin identity | `(admin)/admin/(panel)/layout.tsx`; public login outside this group; URLs unchanged |
| Organizer dashboard API | Persisted verified and approved organizer session | Existing shared organizer guard, followed by `...ByOrganizer(organizerId)` |
| Organizer payments page | Same approved organizer identity | Explicit page guard (page is outside panel layout); real owner event list |
| Payment service | Required organizer ID supplied by guarded caller | Ownership subquery in all counts, aggregates and rows; optional event/search filters narrow scope |
| Buyer tickets, including legacy `/api/demo/tickets` | NextAuth session email | Persisted ticket owner takes precedence, then legacy order/buyer fallback; supplied email ignored |
| Buyer ticket resend | Same current buyer ownership | Owner-scoped SQL before signing/email; unknown and foreign IDs both 404; cancelled tickets denied; only owner receives resend |

Admin mutations also reject cross-origin browser requests (Origin / Sec-Fetch-Site). Existing login, logout, bootstrap and organizer provisioning endpoints have separate legacy mechanisms and are **not** covered by the new operational guard. The proxy remains a cookie-presence navigation shortcut; it must never be relied upon for authorization. Session role comes from its persisted table, not from a client-supplied role.

No hashes or persisted session formats were migrated. Admin session IDs retain the existing generated `admsess_` plus 48 hexadecimal characters. Existing expiry/JOIN checks deny missing/deleted session or principal rows. There is no admin disabled/MFA field in the verified runtime model; adding those requires the identity migration.

Remaining high-priority boundaries: public QR signing, wallet fallback, scanner/check-in, scanner statistics, exports, demo reset/paid-order, payment status/confirmation and provisioning routes. These remain production blockers. Buyer-email normalization preserves the existing ownership model; a stable user-ID migration and transfer authorization remain future work.

Tests execute real handlers/services/layouts with isolated infrastructure doubles. SQL parameter/predicate contracts are covered; they do not prove PostgreSQL concurrency, persisted expiry or full browser/provider flows. Those need the disposable database integration milestone.
