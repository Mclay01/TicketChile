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
- [x] Scanner, statistics and CSV verify persisted event ownership; non-owner staff claims are denied until a grant model exists. Canonical/demo aliases share guards. CSV formula escaping covered.
- [x] Demo reset/paid-order/cart mutation routes return 410 without writes; production seed returns 403 before seeder call. Public real inventory holds remain M4 abuse-hardening work.
- [x] Buyer payment status/confirmation requires session ownership; returned tickets carry current-owner filtering.
- [x] Flow token/payment substitution and Webpay order-ID-only cancellation denied; provider reference/order/amount/currency checks covered with doubles.
- [x] Scanner page resolves real DB event after organizer authorization; explicit manual check-in cannot bypass an invalid signed QR.

## High-risk workflows

- [ ] Password recovery expiration, single-use token, revocation and anti-enumeration.
- [ ] Admin MFA and staff permission boundaries.
- [ ] Published-event visibility and server-side price validation.
- [ ] Inventory locks, expiry, concurrent purchases, duplicate payment callbacks and single issuance.
- [ ] Scanner signature/event/status, duplicate and concurrent entry, cancellation and audit actor.
- [ ] Refund and complimentary ticket inventory/audit rules.
- [ ] No external email/payment/AI success is fabricated when credentials are absent.

## Build and implementation

- [x] Initial typecheck passes on the existing checkout.
- [x] Final typecheck and isolated production build pass after M2 changes.
- [x] ESLint passes on every M2 changed/new source/test file with zero warnings; whole-repository legacy debt remains, not claimed clean.
- [x] 177 automated tests pass (36 M1 + 141 M2) with isolated dependencies and explicit SDK doubles, no production connection.
- [ ] Disposable PostgreSQL migration/concurrency tests pass.
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

## M2 validation limits and follow-up

- [ ] Disposable PostgreSQL proves atomic concurrent check-in, tenant isolation and callback single issuance (unit tests verify SQL scope/state contracts only).
- [ ] Persisted staff event grants, action permissions and check-in actor audit (M3 foundation, M8 operations); M2 allows owner only.
- [ ] Browser login/return/camera flows and an actual Wallet save pass in a safe test environment.
- [ ] Guest-order migration, transfer/key rotation and previously issued Wallet object lifecycle have explicit product/security rules.
- [ ] M4 verifies all provider callback bindings/replay limits, expired holds, inventory, transaction retries and durable email outbox; no financial-invariant certification in M2.

Full route inventory and guest/callback exceptions: [AUTHORIZATION.md](AUTHORIZATION.md). Stop after M2; next is M3, not UI redesign.
