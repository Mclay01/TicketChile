# TicketChile QA gates

Record executed results in ASTRA-PROGRESS.md. Unchecked items are not accepted as complete.

## Security containment

- [x] Operational admin handlers reject absent/fabricated/non-resolving sessions before domain work (isolated route tests and expiry-query contract; real DB expiry integration pending).
- [x] Admin authority comes from persisted admin sessions; login stays outside the protected layout and builds successfully.
- [x] Valid admin list/publish and already-approved retry behavior covered by handler tests; remaining browser operations pending integration QA.
- [x] Organizer dashboard, payment count, totals, rows and filters carry tenant scope (SQL contract tests; actual PostgreSQL isolation pending).
- [x] Unverified/pending organizers cannot access the dashboard; payments page authenticates before reads.
- [x] Ticket lookup and resend reject anonymous/foreign requests; resend signs/sends only after owner-scoped lookup, to the current owner.
- [ ] Ticket resend/lookup/QR/wallet deny unauthenticated users and unrelated buyers.
- [ ] Arbitrary identifiers cannot produce signed tickets or deliver another buyer's QR.
- [ ] Scanner, statistics and CSV verify owner/staff event permissions; CSV formula escaping preserved.
- [ ] Demo/reset/seed routes cannot mutate production state or simulate paid success.

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
- [x] Final typecheck and isolated production build pass after M1 changes.
- [x] New security modules/handlers/tests and scoped lint pass; remaining modified legacy service/client lint debt is recorded separately.
- [x] 36 automated tests pass with isolated dependencies, no production connection.
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
