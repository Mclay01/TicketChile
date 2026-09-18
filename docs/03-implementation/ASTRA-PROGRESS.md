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

M1 remains complete in `39a0931` and was not reimplemented. M2 is complete in the commit containing this entry. Its starting tree was clean. Work stops here as requested; M3 has not begun. No deployment, production credentials, production data mutations or provider API calls.

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

M3-M10 in [ASTRA-IMPLEMENTATION-PLAN.md](ASTRA-IMPLEMENTATION-PLAN.md). No schema migration, staff assignment model, recovery, MFA, real provider flow or design milestone has been delivered. The full platform remains incomplete and is not production-ready.

## Decisions

- Keep Next/React/Postgres and the existing public URLs. Preserve sound hold/payment logic.
- Guards validate persisted sessions; proxy cookie presence is never sufficient authorization.
- Tenant ownership comes from `organizer_events`, buyer ownership from persisted tickets and authenticated identity.
- No automatic production operations, external emails, migration execution or credential use.
- Approved 1D designs determine visual language; fees/legal/settlement examples are not policy.
- The current owner alone receives QR email delivery, including initial payment delivery and resend. Checkout contact email is not ticket ownership. Guest buyer read access is not preserved.
- M1/M2 authorization and their exceptions are documented in [AUTHORIZATION.md](AUTHORIZATION.md). Bootstrap/provisioning/login/logout still use their legacy mechanisms and need the identity hardening milestone.

## Blockers and constraints

- `pnpm` is absent from PATH; installed Node 22.15.1 and local dependencies allow direct CLI checks.
- Runtime database schema diverges from SQL; no local database fixture has been verified. No remote DB inspection attempted.
- Three bundled design HTMLs contain their real markup in `__bundler/template`; inspect the template, not the loading thumbnail.
- Existing root package/config and lint debt need dedicated follow-up.
- Remaining exposures: legacy provisioning/bootstrap and identity controls; rate limits and public hold abuse; incomplete staff/audit/transfer/key-rotation models; legacy Stripe/Fintoc callback binding/replay-window review; inventory/finalization and email-outbox reliability. M2 closes the previously listed public ticket/scanner/payment-read bypasses but does not certify financial or identity workflows.
- Tests use infrastructure doubles and validate SQL scope contracts; persisted-session expiry, tenant isolation against actual PostgreSQL, row-lock concurrency and provider/browser end-to-end flows have not been executed.

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

## Exact next milestone

**M3: versioned local schema, identity/RBAC, recovery, rate limits, MFA and audit.** Completion evidence: local migrations plus authorization/recovery integration tests. Establish a disposable local database before those tests; do not inspect/mutate production. Persist event grants before admitting staff (operational staff/scanner workflow remains M8). Continue from M2; do not restart M0 or reimplement M1/M2.
