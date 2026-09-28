# M9 local admin QA

Synthetic local PostgreSQL and Chrome, 2026-09-28. No production credentials/data, deployment, real mail or merchant operations.

- `apps/web/scripts/m9-preview.mjs` creates a fresh `ticketchile_test_*` database, applies the migrations, seeds clearly synthetic event/order/payment data and persisted MFA-ready SUPERADMIN/ADMIN sessions. Inherited/application credentials are scrubbed before launching the loopback preview. Refund execution remains disabled.
- `m9-browser-qa.mjs`: **80** screen/viewport combinations, 16 admin screens at **390, 430, 768, 1024, 1440**. Browser forms create a support case and private note. Actual local API calls request/approve/reject a refund, verify execution is disabled, prepare/approve a settlement and record an explicitly synthetic external payout. It also checks reduced ADMIN permissions, the retired approval alias and anonymous denial.
- `m9-review-qa.mjs`: **97** final states after the desktop gutter correction: the same 80 layouts, 15 open commission/moderation/organizer confirmation forms with native required validation, plus access-denied and empty lookup screens. No horizontal document overflow or unlabeled visible form fields was detected.
- `responsive-report.json` and `review-report.json` record these checks. PNGs retain representative 390/1440 layouts and confirmation states. Selected desktop/mobile captures were visually inspected; the final review refreshes the affected captures.
- Domain/provider regressions use actual TypeScript services with disposable PostgreSQL and explicit injected provider responses. Browser QA does **not** claim a live Stripe refund, bank transfer, real email or provider webhook certification.

The preview's Next.js development indicator is visible in captures. These are functional local application screenshots, not production deployment evidence. Other browsers, physical devices, screen readers, formal accessibility and performance/load certification remain release gates.

Financial screenshots use synthetic policy references solely as QA fixtures. They do not establish TicketChile commission, tax, refund entitlement, processor-fee payer or payout cadence policy. See [Finance operations](../../FINANCE-OPERATIONS.md).
