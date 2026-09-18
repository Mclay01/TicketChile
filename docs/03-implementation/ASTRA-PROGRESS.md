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

M1 remains complete in `39a0931`; M2 remains complete in `319cb5f09140ddd09df1875d392abc7b7ad60a67`. Both were verified before M3 and were extended rather than reimplemented. M3 is complete in `fd48fc02df1408a299157d7308b644b102a532cd`. M4 is complete in `9e4466e34a69192761a36a918c56e430c849c9be`. M5 is complete in the commit containing the M5 entry below. No deployment, production credentials/data, provider calls, merge or push.

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

M6-M10 in [ASTRA-IMPLEMENTATION-PLAN.md](ASTRA-IMPLEMENTATION-PLAN.md). M1-M5 are complete locally. Production schema adoption, external worker installation, provider end-to-end certification and the remaining product milestones are pending. The full platform remains incomplete and is not production-ready.

## Decisions

- Keep Next/React/Postgres and the existing public URLs. Preserve sound hold/payment logic.
- Guards validate persisted sessions; proxy cookie presence is never sufficient authorization.
- Tenant ownership comes from `organizer_events`, buyer ownership from persisted tickets and authenticated identity.
- No automatic production operations, external emails, migration execution or credential use.
- Approved 1D designs determine visual language; fees/legal/settlement examples are not policy.
- The current owner alone receives QR email delivery, including initial payment delivery and resend. Checkout contact email is not ticket ownership. Guest buyer read access is not preserved.
- M1/M2 authorization and their exceptions are documented in [AUTHORIZATION.md](AUTHORIZATION.md). M3 retires HTTP bootstrap/provisioning/SSO bypasses and shares hardened login/logout/recovery/MFA/session services; see [IDENTITY-SECURITY.md](IDENTITY-SECURITY.md).

## Blockers and constraints

- `pnpm` is absent from PATH; direct Node CLI checks work. M5 used cached Corepack pnpm with auto-pin disabled and --ignore-workspace to add Sharp without changing parent workspace configuration.
- The reconstructed local schema is verified on disposable PostgreSQL 18.1. The actual production schema is still unknown and requires catalog reconciliation; no remote DB inspection was attempted.
- Three bundled design HTMLs contain their real markup in `__bundler/template`; inspect the template, not the loading thumbnail.
- Existing root package/config and lint debt need dedicated follow-up.
- Remaining exposures: unverified production catalog/infrastructure, privileged onboarding/key management, scheduler installation and recovery/mail delivery proof, review/refund operations, production object storage/legacy media transition, distributed abuse/load controls, and ticket transfer/QR/Wallet key rotation. M1-M5 local completion does not certify production readiness.
- M1/M2 retain isolated provider/session/DB doubles; M3-M5 additionally execute actual PostgreSQL migration/identity/permission/payment/media/ownership cases. M5 adds local Chrome public/account QA. External merchant, Google OAuth, Wallet, email-delivery, physical-device and distributed-load end-to-end remain unexecuted.

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

## M4 completed

Starting point: clean `astra/ticketchile-v2` at M3 `fd48fc0`. Read the latest M4 request, progress/implementation/migration/authorization records, PRD checkout requirements and root Git history before editing. M1, M2 and M3 were preserved and extended, not restarted. No unrelated UI redesign or M5 work was undertaken.

- Mapped all provider create/status/confirm/return/webhook routes, compatibility aliases, inventory writers, ticket issuers, resend and security delivery. Recorded the map and provider documentation review in [PAYMENTS.md](PAYMENTS.md).
- Consolidated Stripe/Webpay/Flow creation behind server availability, explicit fee policy, canonical database prices, validated quantities/publication, owned holds and durable buyer/request-key retries. Persist attempts before provider I/O; uncertain creation cannot blindly create duplicate payments. Manual bank fallback details were removed. Fintoc create and its formerly active webhook are unavailable. Manual transfer remains unavailable pending an authorized review workflow; legacy pending transfers cannot automatically issue tickets.
- Shared provider adapters validate actual provider state and exact payment/hold/reference/amount/currency bindings. Stripe also requires session metadata/client reference/mode and durable PaymentIntent binding, with raw SDK signature verification. Webpay recovers uncertain commits via status; Flow independently retrieves authenticated status. Browser redirects and IDs cannot grant buyer access or mark payments paid.
- One paid-evidence recorder and one transactional issuer replace all old provider-specific finalization paths and the unused demo-paid issuer. Durable evidence survives issuance failures. Unique order/hold and ticket issuance slots, atomic inventory consumption and unique initial mail jobs make repeated callbacks, webhooks and status/success reloads idempotent. A legacy PAID label alone is not trusted. Expired/late-paid purchases enter review, without overselling or invented refunds.
- All active inventory expiry/release writers now share a transaction advisory lock and release-once service. Account quotas remain; published-event/per-type quantity guards added. Stripe holds align with the provider session's fixed expiration without retry extension. Public availability aliases no longer expose attendee/check-in data or run a separate inventory writer.
- Added durable encrypted mail snapshots, leases/fencing, bounded retries and provider idempotency keys. Email failure never rolls back purchases. Owner-authorized resend queues with 202, deduplicates requests and rechecks ownership/VALID/paid state at delivery. M3 security outbox messages use the same worker with expiry/acknowledgement. Disabled mail remains queued; fixture delivery explicitly records TEST. No actual email was sent.
- Added internal reconciliation and delivery worker boundaries, review/audit states and an operational runbook. No public cron, refund, approval or scheduler endpoint was introduced. External worker scheduling and merchant/sender certification remain deployment prerequisites.
- PRD section 10 does not explicitly define guest checkout. M4 preserves the existing verified-account boundary; it adds no guest ID-based access. Current ticket ownership still filters confirmation results. Product UI changes are limited to real provider availability, durable retry keys, accurate queued-mail and payment/issuance states.
- Updated [QA-CHECKLIST.md](QA-CHECKLIST.md), [MIGRATION-PLAN.md](MIGRATION-PLAN.md), [AUTHORIZATION.md](AUTHORIZATION.md), [IDENTITY-SECURITY.md](IDENTITY-SECURITY.md) and [PAYMENTS.md](PAYMENTS.md).

## M4 verification

Run from `apps/web` unless noted:

| Check | Result |
| --- | --- |
| `node --test --experimental-test-isolation=none --test-reporter=spec tests/*.test.mjs` | PASS: 242 tests, zero failures/skips; includes 58 actual-PostgreSQL M4 behavior cases, retained identity/QR/wallet/scanner/owner contracts and updated delivery/payment contracts |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS |
| `node scripts/lint-changed.mjs` | PASS: all 39 changed/new code/test/script files, zero errors/warnings |
| `node scripts/verify-build.mjs` | PASS: optimized compile, TypeScript, static generation and route collection, with inert credentials and unreachable loopback DB |
| Root `git -c core.safecrlf=false diff --check` | PASS |

M4 tests include canonical amounts/tampering, quantity and publication validation, concurrent create retry keys, owned/expired holds, last-unit stock races, wrong provider/order/session/currency/amount/intent, signature failures, webhook/callback replay, injected issuance failure/recovery, legacy unverified state, cancellation/release, expired-paid review, transferred-ticket filtering, provider availability, no automatic manual transfer issuance, pending reconciliation without browser, encrypted mail failure/response loss, concurrent workers, expired leases/security tokens, deduplication-window review, resend ownership and all public availability aliases.

Historical M2 payment/mail SQL-shape tests for deleted implementations were replaced with stronger actual-PostgreSQL behavior tests; historical test counts are not simply added to the current total. Applied M1-M3 migration files are unchanged. M4 appends `0004_payment_lifecycle.sql`; test databases are newly named disposable fixtures and earlier intermediate databases are retained, not reused or dropped.

The isolated PostgreSQL cluster uses only `127.0.0.1:55439` and synthetic data; test commands never load application env files. The build helper clears provider/mail/checkout variables and substitutes inert credentials; Next prints `.env.local` discovery but its keys are overridden before build. Local fixture logs/data/build artifacts are ignored. No production credentials/data, real provider/email/Wallet calls, deployment, merge or push occurred. Local cluster stopped after verification, retaining its files.

Intermediate test syntax/mock-boundary and TypeScript errors were corrected before final gates. Scoped lint exposed an inherited unused confirmation helper and TicketCard type/image warnings; only the touched code was corrected. The final review added a regression against certifying a legacy PAID label from PENDING evidence. No whole-repository lint run or clean claim: the historical baseline remains 287 errors and 35 warnings.

Remaining limits: actual merchant sandbox/browser/email end-to-end, scheduler installation, monitored uncertain-create/late-paid review, Fintoc integration, manual transfer approval/bank policy, nonzero fee/refund/settlement operations, guest capability design, existing QR/Wallet transfer/key rotation, production catalog/legacy-payment adoption, DB privilege/retention/key management and load/throughput rehearsal. Unknown Webpay/Flow create outcomes still need provider-backed operator reconciliation; no blind retry is performed. Production readiness is not claimed.

## M5 completed

Starting point: clean `astra/ticketchile-v2` at M4 `9e4466e`. The latest user attachment explicitly requested M5. Read progress, implementation plan, authorization/payment records, DESIGN-BRIEF and all four approved design templates. M1-M4 remain complete; their security/payment services were preserved. Applied the local redesign audit skill, without subagents or external production access.

- Implemented the approved 1D token/component foundation: local Manrope/IBM Plex Mono fonts with licenses, dark graphite/red palette, fine borders, restrained ticket perforations, semantic responsive public shell, account navigation, fields/buttons/notices/status/empty/loading/error states, native dialog and quantity controls.
- Home now reads real published database events. Bounded catalog/search/city/category/date/sort/pagination and real facets replace hardcoded public arrays and N+1 loading. Event detail uses real organizer metadata, Chile-local dates and canonical ticket types. Selection submits IDs/quantities into M4; no client price or new hold/payment authority was introduced.
- Replaced all three public event compatibility API readers with the same publication boundary. Previously unpublished rows could leak through these legacy readers. Retired unused fixture checkout/quick-buy/My Tickets/Home/filter/card/organizer clients; fixture arrays moved to an explicit fixtures module for legacy development helpers only.
- Added current-owner profile, upcoming/past/cancelled tickets, ticket detail and owned purchase history. QR/Wallet reuse M2 endpoints and remain owner/state guarded; Wallet only appears when configured. Resend queues through M4; transfer remains explicitly unavailable. Buyer auth/recovery/reset call M3 services with real labels and nonenumerating feedback.
- Added FAQ/contact/provisional legal and a non-generating AI simulator foundation. No final legal/transfer/fee policy, fictional event counts or fake AI output was copied from the prototypes.
- Added a binary media boundary: bounded decode, resize, metadata removal and WebP normalization; immutable local development objects; tenant/event-authorized upload/read and new submission references; transactional metadata/audit. Production storage remains unavailable until an explicit object adapter exists. Existing base64 fields remain intact and have a publication-checked binary compatibility reader. No production media migration or deletion occurred.
- Appended `0005_discovery_media.sql` for configured categories, nullable event category, discovery indexes and media metadata. Applied migrations 0001-0004 are unchanged. Added an app-specific lockfile for reproducible dependencies, including explicit Sharp.
- Implementation architecture, deviations and media transition are documented in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md), [MIGRATION-PLAN.md](MIGRATION-PLAN.md), [AUTHORIZATION.md](AUTHORIZATION.md), [QA-CHECKLIST.md](QA-CHECKLIST.md) and [qa/m5/README.md](qa/m5/README.md).

## M5 verification

Run from `apps/web` unless noted:

| Check | Result |
| --- | --- |
| `node --test --experimental-test-isolation=none --test-reporter=spec tests/*.test.mjs` | PASS: 259 tests, zero failures/skips; all 242 retained M1-M4 tests plus 17 M5 tests |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS |
| `node scripts/lint-changed.mjs` | PASS: 64 changed/new code/test/script files; zero errors/warnings |
| `node scripts/verify-build.mjs` | PASS: optimized production compilation, type validation, static generation and route collection; inert credentials/unreachable loopback DB |
| `node scripts/m5-visual-qa.mjs` | PASS: 90 combinations (18 public/account states at 390/430/768/1024/1440), labels/images/overflow plus real buyer login, native dialog, reduced motion and quantity-only checkout navigation |
| `node scripts/m5-state-qa.mjs` | PASS: stock error blocks continuation; real M3 registration/recovery queue; invalid-reset error |
| Root `git -c core.safecrlf=false diff --check` | PASS |

M5 tests execute actual PostgreSQL filtering/mapping/publication/pagination/ownership behavior, every public event API alias, legacy raster reads, foreign/transferred tickets, owned order summaries, anonymous account rejection, media scope, stream/pixel/format limits, metadata removal, immutable/traversal-safe storage, production adapter denial, successful upload/audit and publication-dependent reads. Browser captures and reports are committed under `qa/m5`; approved designs are unchanged. QR and buyer details in captures are synthetic fixtures with local-only keys.

Intermediate failures corrected: Tailwind scanned generated artifacts (explicit source scanning now prevents it); QA needed a synthetic data key for the existing M3 rate limiter and a consistent localhost origin; initial scoped lint exposed four nearby demo type issues and two organizer image warnings. No security check was relaxed for browser automation. Whole-repository lint was not rerun or claimed clean; the historical M1 baseline remains 287 errors and 35 warnings.

All database/preview work used newly named synthetic loopback databases without loading application credentials. Font license notices were fetched from the official Google Fonts source only. No deployment, production credentials/data, live provider/Wallet/mail calls, merge or push occurred. Local processes/cluster are stopped at handoff; fixture files/databases remain for inspection.

Remaining limits: production object storage/legacy media migration and remote-image allowlist policy; approved legal/contact operations; real featured-event curation/category editing; profile editing; safe transfer and M7 AI; detailed legacy checkout/confirmation and organizer/admin layouts; existing schema adoption and all M4 operational/provider/key/worker limits. No physical-device, Safari/Firefox, assistive-technology, load, merchant or formal WCAG certification is claimed. See DESIGN-SYSTEM for explicit visual deviations.

## Exact next milestone

**M6: Organizer event lifecycle, multi-tier editor and Event Center.** Completion evidence: create/edit/preview/publish and tenant tests. Continue from the coherent M5 commit; do not restart M1-M5. Stop here. Do not deploy or automatically begin M6.
