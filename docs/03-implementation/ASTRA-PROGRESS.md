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

M1 implementation and local verification complete. Next execution target is M2. The coherent commit for this work is titled `security: enforce admin and ticket ownership boundaries`. No deployment or external messages were sent.

## Pending

All M2–M10 in [ASTRA-IMPLEMENTATION-PLAN.md](ASTRA-IMPLEMENTATION-PLAN.md). No redesign, schema migration, real provider flow, staff model, recovery or MFA has been delivered yet. The full platform remains incomplete and is not production-ready.

## Decisions

- Keep Next/React/Postgres and the existing public URLs. Preserve sound hold/payment logic.
- Guards validate persisted sessions; proxy cookie presence is never sufficient authorization.
- Tenant ownership comes from `organizer_events`, buyer ownership from persisted tickets and authenticated identity.
- No automatic production operations, external emails, migration execution or credential use.
- Approved 1D designs determine visual language; fees/legal/settlement examples are not policy.
- The current owner alone receives a ticket resend: the original buyer must not receive a credential after ownership changes. Initial purchase delivery behavior was not modified.
- M1 authorization and its exceptions are documented in [AUTHORIZATION.md](AUTHORIZATION.md). Bootstrap/provisioning/login/logout still use their legacy mechanisms and need the identity hardening milestone.

## Blockers and constraints

- `pnpm` is absent from PATH; installed Node 22.15.1 and local dependencies allow direct CLI checks.
- Runtime database schema diverges from SQL; no local database fixture has been verified. No remote DB inspection attempted.
- Three bundled design HTMLs contain their real markup in `__bundler/template`; inspect the template, not the loading thumbnail.
- Existing root package/config and lint debt need dedicated follow-up.
- Critical remaining exposures: unauthenticated QR signing, wallet fallback, scanner/check-in and cross-event statistics/exports; demo reset/paid-order paths; payment status/confirmation ownership. Fix these next, including all compatibility aliases.
- Tests use infrastructure doubles and validate SQL scope contracts; persisted-session expiry, tenant isolation against actual PostgreSQL, row-lock concurrency and provider/browser end-to-end flows have not been executed.

## Changed areas / tests / build

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

## Next milestone

M2: secure both QR endpoints and wallet ticket lookup; replace server-to-server public QR fetches in payment email paths with authorized internal rendering; enforce owner/staff event scope on scanner/check-in/statistics/CSV; resolve scanner events from DB and retire unsafe demo mutations. Inspect payment status/confirmation before preserving guest access: never use knowledge of a ticket/payment ID as ownership. Continue with the existing plan; do not restart M0 or reimplement M1.
