# TicketChile QA gates

Current release status (M10): see [RELEASE-READINESS.md](RELEASE-READINESS.md) and [M10-AUDIT.md](M10-AUDIT.md). Milestone-specific test counts and handoffs below are historical. No production release is certified.

Record executed results in ASTRA-PROGRESS.md. Unchecked items are not accepted as complete.

## Security containment

- [x] Operational admin handlers reject absent/fabricated/non-resolving sessions before domain work (isolated route tests and expiry-query contract; real DB expiry integration pending).
- [x] Admin authority comes from persisted admin sessions; login stays outside the protected layout and builds successfully.
- [x] Valid admin list/publish and already-approved retry behavior covered by handler tests; remaining browser operations pending integration QA.
- [x] Organizer dashboard, payment count, totals, rows and filters carry tenant scope (SQL contract tests; actual PostgreSQL isolation pending).
- [x] Unverified/pending organizers cannot access the dashboard; payments page authenticates before reads.
- [x] Ticket lookup and resend reject anonymous/foreign requests; resend signs/sends only after owner-scoped lookup, to the current owner.
- [x] Ticket resend/lookup/QR/wallet deny unauthenticated users and unrelated buyers, including signed-token and compatibility lookup forms (isolated handler tests).
- [x] Arbitrary identifiers cannot produce signed tickets or deliver another buyer's QR; internal paid delivery requires DB evidence and current owner. Used/cancelled QR/Wallet requests denied.
- [x] Scanner, statistics and CSV verify persisted event capabilities; staff claims require live M3 grants. Canonical/demo aliases share guards. CSV formula escaping covered.
- [x] Demo reset/paid-order/cart mutation routes return 410 without writes; production seed returns 403 before seeder call. Real inventory holds now require buyer ownership, rate limits and transactional quotas (M3); complete lifecycle validation remains M4.
- [x] Buyer payment status/confirmation requires session ownership; returned tickets carry current-owner filtering.
- [x] Flow token/payment substitution and Webpay order-ID-only cancellation denied; provider reference/order/amount/currency checks covered with doubles.
- [x] Scanner page resolves real DB event after organizer authorization; explicit manual check-in cannot bypass an invalid signed QR.

## High-risk workflows

- [x] Password recovery expiration, single-use token, revocation and generic responses for buyer/organizer/admin (real PostgreSQL and HTTP tests).
- [x] Admin/owner MFA setup restrictions, TOTP/recovery replay protection and persisted staff capability boundaries.
- [ ] Published-event visibility and server-side price validation.
- [ ] Inventory locks, expiry, concurrent purchases, duplicate payment callbacks and single issuance.
- [x] Scanner signature/event/status and cancellation contracts; real concurrent single entry, revoked grants and atomic actor audit.
- [ ] Refund and complimentary ticket inventory/audit rules.
- [ ] No external email/payment/AI success is fabricated when credentials are absent.

## Build and implementation

- [x] Initial typecheck passes on the existing checkout.
- [x] Final typecheck and isolated production build pass after M2 changes.
- [x] ESLint passes on every M2 changed/new source/test file with zero warnings; whole-repository legacy debt remains, not claimed clean.
- [x] 177 automated tests pass (36 M1 + 141 M2) with isolated dependencies and explicit SDK doubles, no production connection.
- [x] Disposable PostgreSQL migration, reset, MFA, rate-counter, hold-quota and scanner concurrency tests pass (M3).
- [ ] CI can reproduce checks without real provider credentials.

## Product and visual acceptance (later milestones)

- [ ] Buyer discovery → detail → selection → hold → configured payment → issued ticket → QR.
- [ ] Organizer registration → manual/AI draft → edit/tier configuration → preview → publish → operate.
- [ ] Admin moderation/support/financial operations enforce server authority and audit actions.
- [ ] 1D design matches approved templates and extends consistently to missing screens.
- [ ] 390/430/768/1024/1440 viewport checks: no overflow, useful navigation, forms, tables/lists, dialogs and scanner.
- [ ] Keyboard, labels, focus, contrast, reduced motion and safe areas.
- [ ] Loading/empty/error/forbidden/offline/not-found states are meaningful.
- [ ] Real analytics only; provisional legal/fee/payout rules not presented as approved facts.

## M2 historical follow-up, updated by M3

- [ ] Disposable PostgreSQL proves atomic concurrent check-in, tenant isolation and callback single issuance (unit tests verify SQL scope/state contracts only).
- [x] Persisted staff event grants, action permissions and check-in actor audit (M3 foundation complete; M8 operational UI remains).
- [ ] Browser login/return/camera flows and an actual Wallet save pass in a safe test environment.
- [ ] Guest-order migration, transfer/key rotation and previously issued Wallet object lifecycle have explicit product/security rules.
- [ ] M4 verifies all provider callback bindings/replay limits, expired holds, inventory, transaction retries and durable email outbox; no financial-invariant certification in M2.

Full route inventory and guest/callback exceptions: [AUTHORIZATION.md](AUTHORIZATION.md). M4 is now implemented; stop after its commit. Next is M5: 1D primitives/shells, media boundary, public discovery and account.

## M3 verification and release prerequisites

- [x] Versioned fresh-local baseline, additive identity/security migration and capability-policy migration execute on PostgreSQL 18.1.
- [x] Ledger idempotency/checksum checks, refusal of unbaselined existing data and rollback of failed DDL tested.
- [x] Owner/manager/door/finance/support maximum capabilities, narrower grants, explicit event scope and cross-tenant denial tested.
- [x] Invite recipient mismatch, duplicate, expired, revoked, reused and excessive-capability requests denied; grant removal affects an existing session.
- [x] Modern and both legacy password encodings tested; eligible legacy login upgrades progressively.
- [x] Shared hashed sessions tested for expiry, revocation, reset invalidation, MFA setup restrictions, role removal and disabled identities/tenants.
- [x] Buyer JWT refresh cannot recreate revoked sessions; OAuth cannot bypass enrolled local MFA.
- [x] MFA enrollment/confirmation, RFC vector, bad code, replay, recovery-code concurrency and strong disable tested.
- [x] Generic recovery responses and atomic single-use reset tested for all identity kinds. Reset preserves enrolled MFA.
- [x] PostgreSQL atomic rate limiting and injected memory expiry behavior tested; HTTP rate-limit response is 429.
- [x] Concurrent account hold quotas, quantity cap, persisted ownership, fixed standalone TTL and expired-hold release tested.
- [x] Audit creation for sensitive mutations and rejection of UPDATE/DELETE tested. Check-in audit is atomic with entry.
- [x] Legacy HTTP bootstrap/provisioning/SSO bypasses retired; minimal local-only replacements exist. POST logout callers and verification navigation updated.
- [x] Security delivery uses encrypted transactional storage or explicit test adapter; no external message was sent.
- [ ] Rehearse adoption against the actual authorized schema catalog and a restored anonymized copy; no production adoption is certified.
- [ ] Configure/rehearse production data-key rotation, restricted DB roles, trusted ingress, retention/archival, privileged onboarding and recovery-email proof.
- [ ] Implement/rehearse external security email worker/retry/expiry handling and payment email reliability (M4).
- [ ] Browser-based MFA/recovery/Google OAuth, staff camera and distributed rate-limit/load tests.
- [ ] Operational staff/finance/support screens, export pagination/volume controls and future refund/settlement/bank audit consumers.

Historical M1/M2 counts above remain their original evidence. Final M3 combined test/check counts and commands are recorded in [ASTRA-PROGRESS.md](ASTRA-PROGRESS.md). Whole-repository lint is not claimed clean.


## M4 payment verification and outstanding release checks

- [x] Shared provider creation, server-only availability and explicit fee configuration; no fabricated bank details or prototype fees.
- [x] Canonical server prices, tampered total rejection, integer/per-type/account quantity limits and published-event validation.
- [x] Owned holds/payment retries, persisted request fingerprint/key, cross-buyer denial and no provider switching.
- [x] Disposable PostgreSQL concurrent create, last-unit inventory, duplicate callbacks/webhooks/finalization, release-once cancellation and expiry tests.
- [x] Verified evidence survives an injected issuance rollback; recovery issues exactly once with database order/hold and ticket-slot uniqueness.
- [x] Amount/currency/order/reference/intent mismatch and invalid Stripe signature denial; Webpay commit/status recovery; Flow token substitution and callback aliases.
- [x] Fintoc create/webhook retired, manual transfer unavailable and existing pending/manual payments cannot automatically issue tickets.
- [x] Expired/late-paid holds enter review without overselling; Stripe reservation/session expiration aligned and stable on retry.
- [x] Status/success retries cannot reissue or recover transferred tickets; legacy PAID alone is not trusted evidence.
- [x] Durable encrypted mail snapshots, concurrent leases, simulated response-loss dedupe, crash recovery, expired uncertainty review, owner-authorized resend and explicit TEST transport recording.
- [x] M3 security outbox expiry/import/acknowledgement uses the same delivery boundary; disabled mail honestly remains queued.
- [x] All public availability aliases return published inventory only; no attendee/check-in feed or duplicate inventory writer.
- [x] M4 migration, TypeScript, scoped lint, isolated production build and root diff whitespace check are required before commit; final evidence is recorded in ASTRA-PROGRESS.
- [ ] Actual Stripe/Webpay/Flow merchant sandbox, browser redirects, external mail sender/delivery and worker scheduling rehearsal. Local tests use explicit provider doubles.
- [ ] Fintoc complete adapter/validation/certification; manual transfer bank/approval/evidence workflow and operational policy.
- [ ] Existing production catalog adoption, legacy active-payment reconciliation, backups, DB privileges, throughput/lock testing, monitoring and review runbooks.
- [ ] Guest capability policy, QR/Wallet credential transfer/revocation/key rotation, nonzero fee/refund/settlement policies and operations.

Historical M2 SQL-contract payment/mail tests were replaced where their implementation no longer exists with stronger actual-PostgreSQL behavior coverage. Existing identity/QR/wallet/scanner/owner boundaries remain tested; historical counts are not added to the current total. Whole-repository lint remains outside the clean claim.


## M5 verification and remaining product gates

- [x] Approved 1D template audit; reusable tokens, local licensed fonts, precise public/account shells and event/ticket primitives.
- [x] Real published Home/catalog/search/category/detail; bounded parameterized filters, escaped search wildcards, 12-result pagination, real facets and no public fixture fallback.
- [x] All public event compatibility routes reject unpublished IDs/slugs.
- [x] Canonical tier display and availability read; quantity-only selection into unchanged M4 checkout; inventory error disables continuation.
- [x] M3 buyer login/signup/recovery/reset forms; real browser registration/recovery queue and safe invalid-token feedback.
- [x] Current-owner upcoming/past/cancelled tickets and detail; foreign/transferred-ticket denial; independently owned purchase history; no provider references or purchaser PII.
- [x] Real authorized QR browser load, configured-only Wallet visibility, M4 queued resend and explicitly unavailable transfer.
- [x] Binary upload bounds/normalization/metadata stripping; tenant/event scope; immutable local objects; media-reference ownership; audit; publication-dependent public image reads.
- [x] Legacy base64 compatibility without new public HTML blobs or automatic data migration/deletion; arbitrary remote image URLs rejected.
- [x] 259 M1-M5 tests; TypeScript; scoped lint on 64 changed/new files; isolated production build; root diff check.
- [x] 90 Chrome page/viewport combinations at 390/430/768/1024/1440; zero horizontal overflow, missing labels or broken images. Dialog focus/Escape, reduced-motion and real login/selection interactions checked. Evidence: [qa/m5](qa/m5/README.md).
- [x] FAQ, validated/configured contact address or honest unavailable state, provisional legal pages and disabled AI generation foundation.
- [ ] Production media object adapter, hosting/remote-image policy, storage quotas/cleanup and separately authorized legacy media transition.
- [ ] Approved legal/refund/contact operations; account editing and safe transfer; M7 structured AI generation.
- [ ] Full detailed checkout/confirmation and organizer/admin design completion in the remaining product work; physical mobile, other browsers, screen readers and formal accessibility/performance review.

M5 does not waive M3/M4 production migration, payment/provider/Wallet/email, key management, scheduler, operator review, load or infrastructure gates. No whole-repository lint clean claim; historical legacy debt remains.

## M6 organizer verification

- [x] Confirmed M1–M5 complete and clean branch at `9ac8716`; reused their security/domain/design foundation.
- [x] Appended migration 0006; retained 0001–0005 checksums; local fresh migration/idempotency/failed-migration rollback checks.
- [x] Private DRAFT creation, bounded sectioned editor, binary media, arbitrary multi-tier fields, same-tenant source-event media scope and unchanged legacy-media preservation.
- [x] Revision-aware autosave, concurrent save conflict, visible browser retry/conflict state and dirty-navigation warning.
- [x] Owner/manager/door/finance/support matrix, revoked grants, disabled tenant, cross-tenant/event reads and writes; navigation plus independent server boundaries.
- [x] Checklist/allowed transitions/current revision/explicit owner confirmation; no DRAFT publication shortcut; legacy submission/admin publication mutations retired.
- [x] Inventory sums, negative/invalid input, per-order limits, sales windows, inactive/private tiers, sold+held floors, critical edits and confirmed future prices; historical held/purchased prices unchanged.
- [x] Pause blocks new reservations while previously persisted reservations can fulfill; cancellation/end release holds; cancelled late-paid evidence enters review without issuance/refund; ended event blocks actual scanner mutation and preserves ticket history.
- [x] Scoped finance/attendees/access/staff/audit views; historical sales aggregates; no finance leakage to support/door; existing export permission and formula protection preserved.
- [x] Production AI unavailable; development local rules clearly labeled; output has missing fields/warnings, no invented address/date/legal policy and no automatic publication. Browser current/proposed review applies selected fields only.
- [x] Shared public production detail/selector used for authorized preview; no preview stock fetch or purchase.
- [x] Full suite **276 tests**, zero failures/skips, including 17 M6 PostgreSQL cases and retained M1–M5 coverage.
- [x] TypeScript without incremental cache; scoped ESLint on **49** changed/new code/test/script files, zero errors/warnings; isolated optimized production build; root diff whitespace check.
- [x] **100 Chrome screen/viewport combinations** at 390/430/768/1024/1440; six real browser workflow assertions. Evidence and limits: [qa/m6/README.md](qa/m6/README.md).
- [ ] Real provider AI and expanded contextual analytics: M7.
- [ ] Promotions, complimentary tickets, operational attendee actions, communication/transfer policies and export-volume controls: M8/later approved policy.
- [ ] Admin lifecycle moderation, pending legacy submission migration, refunds and settlements: M9.
- [ ] Production object adapter, schema adoption, restricted DB grants, keys, provider certification, delivery/reconciliation scheduling, legal/contact operations and broad device/accessibility/load work remain release gates.

Whole-repository lint was not rerun or claimed clean; historical baseline remains 287 errors and 35 warnings. No deployment, production credentials/data, live provider calls, merge or push occurred.


## M7 AI verification - supersedes M6 AI pending item

- [x] M1-M6 confirmed complete; no reimplementation or authorization shortcuts.
- [x] Replaceable provider contract, explicit disabled/development states; real adapter contract tested with fake transport only.
- [x] Closed schema validates unknown fields, categories, dates/timezones/windows, integer CLP/stock, lengths and analytics references; malformed/refused/incomplete output rejected.
- [x] Server-side organizer authentication, tenant/event/feature capability scope before and after generation; revoked/foreign grants denied.
- [x] Explicit minimal contexts; no attendee/payment secrets; obvious free-text PII/key patterns redacted; prompts absent from persistence/logging.
- [x] Request idempotency/concurrency, sanitized failure/timeout/schema outcomes, persisted public/user/global rates and budgets; no automatic provider retries.
- [x] Sensitive field confirmation enforced server-side; selected reviewed fields only, normal revision/inventory services, single-use apply/reject with transactional audit; no AI publication/cancellation/financial authority.
- [x] Encrypted seven-day browser capability draft, authenticated actor binding, approved tenant-wide claim, expiry/replay/cross-user denial, atomic rollback and private draft creation.
- [x] Real scoped facts separated from hypotheses and recommendations; metric references validated; no fabricated conversion/forecasts.
- [x] 294 full regression tests (18 new AI cases), plus final 35-test affected rerun; PostgreSQL migration/idempotency/checksum/rollback coverage through 0007.
- [x] TypeScript, scoped lint (34 changed/new files, zero errors/warnings), credential-isolated production build and Git whitespace checks.
- [x] 62 local Chrome screen/viewport combinations at 390/430/768/1024/1440: public empty/generating/proposal/preview/error/account; organizer creation/diff/sensitive confirmation/rewrite/analytics; actual edited-field application and anonymous-to-organizer claim. Keyboard focus and reduced motion emulated. [Evidence](qa/m7/README.md).
- [ ] Live provider model/schema/usage, output quality and adversarial-content evaluation; approved privacy/provider processing terms.
- [ ] Production ingress/keys/grants/migration rehearsal, expired ciphertext retention job and load/operational budget validation.
- [ ] Cross-device draft recovery/identity linking, broader analytics and physical-device/other-browser/screen-reader/formal accessibility certification.
- [ ] M8 operational promotions, courtesies, attendee/scanner workflows; M9 financial/admin actions and prior release gates.

Whole-repository lint remains unclaimed; historical legacy debt persists. No deployment, production mutation or live model calls occurred.


## M8 operations verification - supersedes historical M8 pending items

- [x] M1-M7 preserved; current branch/head audited before work; no unrelated redesign.
- [x] Owner staff list/invite/revoke/resend/update, explicit event assignments and opt-in capability ceilings; persisted identity/tenant/event scope and no role escalation.
- [x] Attendee scoped search, tier/status/date filters, 50-row pages/detail/check-in metadata, finance-gated payment data and current-owner resend.
- [x] Canonical/compatibility exports share authorized streaming pages, minimum holder data and CSV formula escaping; bounded legacy internal export.
- [x] Courtesy confirmed issuance, real tier capacity, concurrent/idempotent inventory behavior, recipient/issuer/reason history, no fake payment, durable delivery, unused-only revocation and immutable history.
- [x] Promotion server validation, scope/tier/window/limits, no stacking, authoritative pricing/expected-total rejection, concurrent last-use protection, retry/expiry/consumed usage and discounted verified fulfillment.
- [x] AI schema rejects promotion activation/action fields; normal confirmed domain operations remain mandatory.
- [x] Real assigned-event scanner, server-side check-in authority, signed QR verification, current ticket state, access schedule/gates, single-use concurrent admission, actor/device history and exact non-PII manual lookup.
- [x] Camera permission/absence/readiness, valid/used/invalid/wrong-event, manual unknown/success, network/server/offline states; recent real counts/history. No offline admission or reversal implemented.
- [x] 313 tests, including 19 M8 cases and retained M1-M7 boundary tests; disposable PostgreSQL migration/idempotency/checksum/rollback through 0008.
- [x] Final TypeScript, scoped lint on 37 changed/new files (zero errors/warnings), isolated production build and root Git whitespace check.
- [x] 80 local Chrome screen/viewport states across 390/430/768/1024/1440 plus 18 final mobile/manual/error/date/detail follow-ups; real synthetic-camera decoding, persisted invitation acceptance, role visibility, courtesy and promotion quote. [Evidence and limits](qa/m8/README.md).
- [ ] Approved refund/transfer/reversal policies, offline guarantees, courtesy reallocation and consumed coupon restoration are intentionally unresolved.
- [ ] Production catalog/grants/index/worker/storage/provider/key/retention rehearsal, physical devices, other browsers and formal accessibility/load certification remain release gates.
- [ ] M9: Admin operations, finance/refunds/settlements and support; authorized audited operations, no invented business policies.

Whole-repository lint remains unclaimed (historical 287 errors/35 warnings). No deployment, production access, real emails or live provider calls occurred.


## M9 acceptance - completed locally, 2026-09-28

- [x] Current persisted admin role/version/active/MFA/capability policy on admin pages, services and mutations; reason, confirmation, audit and durable request keys.
- [x] Real operational dashboard, organizer verification and shared-domain event moderation; administrative pause blocks owner republication; legacy approval paths cannot bypass review.
- [x] Exact progressive buyer/order support, payment evidence/exception views, local idempotent finalization retry, private support case/note lifecycle and durable ticket resend.
- [x] Full-issued-order Stripe refund technical flow with authoritative result binding, signature/mode webhook validation, replay/window limits and UNKNOWN admission blocking; no browser-result trust or unrelated ticket cancellation.
- [x] No hardcoded default commission; future effective global/organizer/event versions and immutable purchase snapshots; missing historical policy blocks accounting.
- [x] Deterministic settlement snapshots, single payment allocation, immutable signed adjustments, explicit approval and amount/reference-verified external payout recording; scoped organizer finance view.
- [x] Bounded scoped reporting and formula-safe CSV; private audit UI; no admin AI monetary or permission action path.
- [x] Additive migration 0009, unchanged 0001-0008, local idempotency/checksum/rollback and financial concurrency coverage.
- [x] **328 tests**, including **15 M9 integration cases**; final TypeScript, **35-file scoped lint**, optimized production build and root whitespace gate.
- [x] **80** browser workflow/layout states plus **97** final layout/confirmation/denied/empty states at **390/430/768/1024/1440**; selected captures visually inspected. [Evidence](qa/m9/README.md).
- [x] Progress, finance, payment, authorization, lifecycle, operations, design and migration documentation updated.
- [ ] Live test-merchant/provider/webhook certification, production schema/grants/worker/key/delivery rehearsal and formal accessibility/device/load testing remain release gates.
- [ ] Business policies for verification evidence, commission/refund treatment, taxes/processor fees, settlement timing and adjustment governance require approval; unsupported partial/used-ticket/post-allocation refunds and automatic bank transfer are not presented as complete capabilities.
- [x] M9 handoff to M10 completed; see the current M10 release verification section below.

No production access or deployment occurred. Whole-repository lint remains unclaimed (historical 287 errors/35 warnings).

## Current M10 release verification - 2026-09-28

- [x] Baseline recorded before code edits: clean `a3d3837`, M1-M9 complete, 328 tests, TypeScript/build/scoped lint pass; whole application lint 15 errors / 1 warning.
- [x] State inventory covers public/account/auth/AI, all Event Center sections, scanner and admin/finance/support; error recovery and authorization-safe not-found behavior reviewed.
- [x] Persistent labels, described hints/errors, login alerts, dialog keyboard loop/Escape/return focus, registration step focus, single main landmark and mobile targets fixed.
- [x] 260 browser states + 15 focused auth states at all five requested widths; screenshots and JSON under `qa/m10/`. DOM names/labels/alt/overflow and Chrome accessibility tree checked; no WCAG/screen-reader certification claimed.
- [x] Real buyer/organizer/admin password/MFA browser login; selection/checkout plus isolated fake provider evidence/finalization/owned QR; organizer save/preview/publish/staff; scanner actual decoder/duplicates/wrong event/camera failures/offline; admin support/moderation/refund/settlement and permission denial.
- [x] Deferred decoder verified in a production browser; bounded polling, query/pagination/export/media/font/cache behavior reviewed; 10,000-ticket EXPLAIN fixture recorded, no speculative indexes.
- [x] Logs/correlation, health versus readiness, config failure, headers/CSP/camera, CSRF/input/upload boundaries reviewed and tested; empty-value `.env.example` covers runtime keys.
- [x] Whole-repository lint: **0 errors / 0 warnings, 338 files**. Scoped lint: **44 files**. No global source exclusions or wholesale rule disabling; historical lint counts above are superseded.
- [x] **336 tests**, zero failures/skips; TypeScript, production build and diff checks pass. Worker retry/concurrency/reconciliation/expiry tests use injected transports only.
- [x] Empty and populated baseline-to-0009 rehearsal passes; immutable 0001-0009 unchanged; no new schema migration.
- [x] Provider/feature/business matrices, ENVIRONMENT, RELEASE-READINESS, DEPLOYMENT-RUNBOOK, INCIDENT-ROLLBACK and M10-AUDIT published in the repository. Approved designs unchanged; no deployment.
- [ ] External release gates: production catalog/restore, media adapter, scheduler/alerts/retention, approved policies, provider certification, real-device/accessibility/security/dependency/load acceptance. These remain explicitly blocked, not inferred from local test success.

No implementation milestone follows M10 in the approved plan.
