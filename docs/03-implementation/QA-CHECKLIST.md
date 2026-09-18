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

Full route inventory and guest/callback exceptions: [AUTHORIZATION.md](AUTHORIZATION.md). Stop after M3; next is M4 payment/hold/finalization consolidation, provider availability and email.

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
