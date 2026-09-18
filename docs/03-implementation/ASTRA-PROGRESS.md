# Astra execution state

Updated: 2026-09-18. Branch: `astra/ticketchile-v2`. Starting commit: `6104fd9`. Initial working tree: clean.

## Completed

- Inspected repository tree, recent commits, packages/configuration, routes, authentication, database schema, holds/finalization, scanner, payments, email/media paths and audit/product/design documentation.
- Confirmed critical admin authorization and organizer tenant leaks against current code; found the unguarded payments page and ticket resend ownership problem.
- Created implementation plan, migration strategy and QA checklist.
- Baseline `node node_modules/typescript/bin/tsc --noEmit --incremental false` from `apps/web`: PASS.
- Inspected the decoded templates in all four approved designs: 9 global-system screens, 18 public purchase/discovery screens, 38 account/AI/help/legal states and 8 organizer foundation screens. No visual implementation claimed.
- M1 security containment implemented and verified:
  - Shared persisted admin-session guard in all seven operational list/detail/approval/publication handlers. Invalid sessions cannot reach domain queries; store failures return generic 503. Browser cross-origin mutations denied.
  - Admin pages moved into a protected `(panel)` layout; login remains public and all URLs are preserved. Updated event-detail async route params.
  - Approval locks the submission row before inspecting status to preserve retry behavior; local tests cover the already-approved path (real concurrency still pending).
  - Organizer dashboard uses existing scoped aggregates. Payments page independently authenticates, lists real owned events and supplies mandatory owner scope to count/totals/row queries.
  - Buyer ticket APIs use session-derived ownership, including the legacy demo alias. Resend checks owner before signing/email, rejects cancelled tickets and sends only to the current owner. QR for resend is rendered locally, eliminating request-host cookie forwarding.
  - Added 36 isolated handler/service/layout regression tests and a safe build-verification command.

## Current work

M1 remains complete in `39a0931`; M2 remains complete in `319cb5f09140ddd09df1875d392abc7b7ad60a67`. Both were verified before M3 and were extended rather than reimplemented. M3 is complete in the commit containing the M3 entry below. No deployment, production credentials/data, provider calls, merge or push.

## M2 completed

- Both QR endpoints and all Wallet lookup forms require the logged-in current ticket owner and VALID state. A signature, ticket ID, order ID or payment ID alone never authorizes buyer access. Existing HMAC signing primitives are preserved.
- Payment email paths use authorized local QR rendering with persisted paid-order evidence and current-owner-only delivery. No public QR fetch, request-host inference or cookie forwarding remains in these paths.
- Canonical scanner handlers and every demo compatibility alias use server-side persisted organizer/event ownership. Scanner page resolves real DB events. Check-in atomically changes VALID to USED with repeated event/owner predicates; scanner feeds omit buyer email. Statistics and CSV services carry the same scope; CSV formulas are escaped.
- Retired demo reset/check-in reset/paid-order/cart mutation/global-statistics handlers return 410. Existing HTTP seeding is still denied in production.
- Payment status and browser confirmation now require buyer login and persisted payment ownership; returned tickets are separately filtered by current owner. Checkout creation derives owner from session and blocks cross-owner/provider retries. Guest browser Flow returns only navigate; authenticated kick and verified Flow/Webpay callbacks bind provider evidence before mutation. Webpay cancellation by order ID alone was removed.
- Minimal related client changes: scanner uses canonical endpoints, checkout explains account delivery, organizer payment list refresh replaces obsolete buyer-only shortcuts. No visual redesign.
- Added 141 M2 regression cases, retaining all 36 M1 cases (177 total), plus provider/SDK blocking in the isolated test loader.
- Complete route/alias inventory, guest policy and remaining limitations are in [AUTHORIZATION.md](AUTHORIZATION.md).

## Pending

M4-M10 in [ASTRA-IMPLEMENTATION-PLAN.md](ASTRA-IMPLEMENTATION-PLAN.md). M3 delivers the versioned local schema, persisted staff/security foundation, recovery, MFA, rates and audit. No production schema adoption, external security delivery worker, real provider end-to-end flow or design milestone is claimed. The full platform remains incomplete and is not production-ready.

## Decisions

- Keep Next/React/Postgres and the existing public URLs. Preserve sound hold/payment logic.
- Guards validate persisted sessions; proxy cookie presence is never sufficient authorization.
- Tenant ownership comes from `organizer_events`, buyer ownership from persisted tickets and authenticated identity.
- No automatic production operations, external emails, migration execution or credential use.
- Approved 1D designs determine visual language; fees/legal/settlement examples are not policy.
- The current owner alone receives QR email delivery, including initial payment delivery and resend. Checkout contact email is not ticket ownership. Guest buyer read access is not preserved.
- M1/M2 authorization and their exceptions are documented in [AUTHORIZATION.md](AUTHORIZATION.md). M3 retires HTTP bootstrap/provisioning/SSO bypasses and shares hardened login/logout/recovery/MFA/session services; see [IDENTITY-SECURITY.md](IDENTITY-SECURITY.md).

## Blockers and constraints

- `pnpm` is absent from PATH; installed Node 22.15.1 and local dependencies allow direct CLI checks.
- The reconstructed local schema is verified on disposable PostgreSQL 18.1. The actual production schema is still unknown and requires catalog reconciliation; no remote DB inspection was attempted.
- Three bundled design HTMLs contain their real markup in `__bundler/template`; inspect the template, not the loading thumbnail.
- Existing root package/config and lint debt need dedicated follow-up.
- Remaining exposures: unverified production catalog/infrastructure, privileged onboarding/key management/recovery-email proof, security delivery worker and retention/archival, distributed abuse/load controls, email-based ticket ownership and transfer/key rotation, legacy Stripe/Fintoc callback binding/replay-window review, and payment/inventory/finalization/email reliability. M3 closes the scoped identity/rate/hold/staff/audit gaps; it does not certify production or financial workflows.
- M1/M2 tests retain isolated provider/session/DB doubles; M3 additionally executes real PostgreSQL migrations, persisted expiry/revocation/grants, token/MFA/rate/hold/check-in concurrency and audit. Browser/provider/email/Wallet end-to-end and distributed load remain unexecuted.

## M1 verification (historical)

Changed areas: admin operational API handlers and route-group layout, organizer dashboard/payments service/page, buyer ticket lookup/resend, shared guards, resend tooltip, test harness, package scripts, isolated build directory configuration and implementation documentation. Existing `pg` services and payment finalizers otherwise retained.

Commands run from `apps/web` unless noted:

| Check | Result |
| --- | --- |
| Baseline `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS |
| Baseline `node node_modules/eslint/bin/eslint.js src --format json ...` | FAIL: 301 errors, 36 warnings (existing) |
| `node --test tests/*.test.mjs` | Environment failure: sandbox denied child-process spawn (`EPERM`) |
| `node --test --experimental-test-isolation=none --test-reporter=dot tests/*.test.mjs` | PASS: 36 tests, no real database/provider/email |
| Final `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS |
| Scoped ESLint on guard modules, operational admin APIs, dashboard, ticket APIs, protected layout, payments page, tests, build script and lint config | PASS: 0 errors/warnings |
| Final ESLint on all `src` | FAIL: 287 legacy errors, 35 warnings; no per-file increases after accounting for moved admin pages |
| `node scripts/verify-build.mjs` | PASS: optimized production build, type validation, static generation and route collection |
| Root `git -c core.safecrlf=false diff --check` | PASS |

Build notes: original `.next` writes were denied in the sandbox; verification uses ignored `.next-astra` output and required locally elevated process permissions. First isolated build compiled but prerender failed because the test `NEXTAUTH_URL_INTERNAL` was empty; assigning the loopback URL fixed the harness. Final build used only inert keys and an unreachable loopback DB, without production calls. Next added `.next-astra` type includes to tsconfig. Run `npm run build:verify` for the same isolation; do not start the app with these inert build credentials.

Scoped lint excludes the large pre-existing organizer service/client UI debt; whole-`src` lint still fails and must not be described as clean. No migration or responsive/browser QA was run in this security-only milestone.

## M2 verification

Commands run from `apps/web` unless stated otherwise:

| Check | Result |
| --- | --- |
| `node --test --experimental-test-isolation=none --test-reporter=dot tests/*.test.mjs` | PASS: 177 tests (36 M1 + 141 M2), explicit database/session/provider/email doubles |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS |
| ESLint on every changed/new `.ts`, `.tsx`, `.mjs` file, `--max-warnings 0` | PASS: 0 errors, 0 warnings; includes touched legacy create routes, organizer service and clients |
| `node scripts/verify-build.mjs` | PASS: optimized production compilation, TypeScript, static generation and route collection, including canonical scanner routes and aliases |
| Root `git -c core.safecrlf=false diff --check` | PASS |

Tests cover anonymous/foreign/owner QR and Wallet access, signed-token tampering, inactive tickets, fabricated/unverified/pending organizer sessions, cross-event/manual/duplicate/cancelled check-in, cross-origin denial, scoped feeds/CSV and formula escaping, retired mutations/production seed denial, real scanner page lookup, payment ownership and token substitution, provider amount/currency/reference mismatch, repeated Flow cancellation, order-ID-only Webpay cancellation denial and current-owner internal QR delivery.

Whole-repository lint was not rerun or claimed clean in M2; the M1 baseline above records 287 legacy errors and 35 warnings across `src`. The initial M2 scoped run exposed inherited errors in touched files; these were corrected before the final scoped pass. Build ran via the existing isolation script with inert credentials and unreachable loopback PostgreSQL. Next prints `.env.local` as discovered, but the script overrides its variables before starting Next. Windows sandbox ACLs required elevated local permissions for some workspace writes and the build. No deployment occurred.

Not executed: real PostgreSQL migrations/tenant/concurrency tests, provider sandbox end-to-end, actual email/Wallet calls, browser/mobile/camera QA. Schema divergence and these validation gaps remain explicit, not waived.

## M3 completed

Starting point: clean `astra/ticketchile-v2` at M2 `319cb5f`. The latest user attachment explicitly requested M3 after confirming M1/M2. No unrelated product redesign or M4 work was undertaken.

- Added a versioned migration runner, reconstructed fresh-local runtime baseline, shared identity/security schema and persisted capability SQL. Checksums, ordering, transactional rollback, idempotency and refusal to auto-adopt unknown existing tables are tested. Existing production adoption remains a reviewed catalog/reconciliation procedure, not an automatic migration.
- Shared buyer/organizer/admin identity security state, hashed persisted sessions, versioned revocation, modern asynchronous scrypt with progressive legacy compatibility, nonenumerating recovery and strong expiring single-use verification/reset tokens. Buyer JWT refresh cannot revive a revoked session; a concurrent security-version change also invalidates the current buyer principal lookup.
- Mandatory TOTP enrollment for ADMIN/SUPERADMIN/ORGANIZER_OWNER before operational access; encrypted secrets, replay counters, atomic single-use recovery codes, strongly verified reconfiguration/disable and session invalidation. Minimal functional security form/login code fields only.
- Durable owner/manager/door/finance/support capability model, tenant/event scopes, hashed email-bound invitations, acceptance/revocation and owner-only grant changes. Existing scanner/statistics/CSV services enforce live role/capability intersection. Disabled owners suspend their tenant's staff and pending invitations. Staff scanner entry reuses the existing scanner UI.
- PostgreSQL-backed rate limits with explicit injectable test storage cover login/registration/recovery/reset/verification/MFA/invites/checkout/holds/ticket reads/resend/scanner/exports. Public AI has no implemented provider endpoint; M7 must adopt the same boundary.
- Holds require a verified buyer, persist ownership, ignore arbitrary standalone TTL, enforce quantity/account quotas under a transaction advisory lock and release expired inventory through existing transaction logic. Stripe/transfer retries cannot claim an unowned/foreign hold. Payment lifecycle consolidation remains M4.
- Durable audit accompanies sensitive security, invitation/permission, organizer approval, publication and check-in mutations. Check-in and audit commit atomically. Audit UPDATE/DELETE is rejected; production DB permissions/archival are still required.
- HTTP bootstrap/provisioning/SSO bypasses retired; local-only bootstrap and encrypted development inbox replace them without external email. All logout callers use POST; legacy verification navigation goes to the new token workflow. Removed unused signed organizer-ID authentication code.
- Updated [AUTHORIZATION.md](AUTHORIZATION.md), [MIGRATION-PLAN.md](MIGRATION-PLAN.md), [QA-CHECKLIST.md](QA-CHECKLIST.md) and [IDENTITY-SECURITY.md](IDENTITY-SECURITY.md), including limitations, migration risks and exact operational commands.

## M3 verification

Run from `apps/web` unless noted:

| Check | Result |
| --- | --- |
| `node --test --experimental-test-isolation=none --test-reporter=spec tests/*.test.mjs` | PASS: 204 tests, zero failures/skips; all 177 M1/M2 cases retained plus 27 M3 cases using actual disposable PostgreSQL where applicable |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS |
| `node scripts/lint-changed.mjs` | PASS: all 78 changed/new `.ts`, `.tsx`, `.mjs` files, zero errors/warnings; root Git used despite nested `apps/web/.git` |
| `node scripts/verify-build.mjs` | PASS: optimized compilation, TypeScript, static generation and route collection using inert credentials/unreachable loopback DB |
| Root `git -c core.safecrlf=false diff --check` | PASS |

The local PostgreSQL 18.1 cluster binds only `127.0.0.1:55439`, uses synthetic fixtures and never loads application `.env.local`. Each integration run creates a unique empty test database; no database was dropped or recreated. Fixtures/local inbox/build output are ignored, not committed. Pools close after tests; the local cluster is stopped when work ends, retaining its files. No production credentials, database/provider/email calls, deployment, merge or push occurred.

Intermediate failures were corrected before final gates: TypeScript's overloaded scrypt promisification, a test-double AccessError class mismatch, re-exported Next route configuration rejected by the build, and two inherited unused lint suppression comments in a touched logout client. Automatic approval review rejected a broad proxy exception; it was replaced by a narrow exception for the existing audited scanner aliases. No broader API gate was removed.

Whole-repository lint was not rerun or claimed clean. The historical M1 baseline remains 287 legacy errors and 35 warnings. No unrelated lint cleanup or visual redesign was undertaken.

Not executed/certified: existing/production schema adoption, secure production key and DB-role operations, external security delivery worker, browser MFA/Google OAuth/camera/Wallet/provider sandboxes, distributed abuse/load tests, payment financial invariants or final product UI. Security email is durably queued/encrypted, not externally delivered; production identity provisioning/onboarding still requires a reviewed runbook. Full residual details are in the linked security and migration documents.

## Exact next milestone

**M4: Payment/hold/finalization consolidation, provider availability and email.** Completion evidence: idempotency, expiry, amount and issuance tests. Continue from M3; preserve the persisted authorization/security boundaries and do not restart M1/M2. M4 has not begun. Stop after the coherent M3 commit; do not deploy.
