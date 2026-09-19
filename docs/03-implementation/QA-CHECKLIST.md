# TicketChile QA gates

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
