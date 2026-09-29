# M14 staging acceptance

Date: 2026-09-28. No hosted target or dedicated external resources were identified.
**No workflow is certified against real staging.** Allowed results: PASS, FAIL,
BLOCKED EXTERNAL, BLOCKED BUSINESS, NOT TESTED. Absence of evidence is never PASS.

| Workflow | Result | Required evidence / dependency |
|---|---|---|
| Vercel project/settings/Preview deploy | BLOCKED EXTERNAL | Named authorized project, apps/web root, unchanged production settings, deployment/build/URL and ingress logs |
| Managed DB migration/catalog | BLOCKED EXTERNAL | Dedicated provider identity, TLS/roles, ledger0001-0011, tables/indexes/constraints/FKs and all domain reads |
| Managed backup/restore/app rollback | BLOCKED EXTERNAL | Actual provider snapshot and separate restore target, key/object recovery, application reads/invariants and measured times |
| Buyer full workflow | BLOCKED EXTERNAL | Register/verify/discover/search/event/select/hold/real sandbox checkout/completion/inbox/account/QR; Wallet if selected; transfer claim/old denial/new QR; supported refund |
| Organizer full workflow | BLOCKED EXTERNAL | Register/verify/MFA, draft/media/AI if selected, tiers/preview/publish, promo/courtesy/staff assignment, attendees/sales/finance |
| Event-day full workflow | BLOCKED EXTERNAL | Assigned-only scanner, real camera valid/duplicate/wrong/cancel/refund/transfer/manual/history/stats; physical sheet |
| Admin full workflow | BLOCKED EXTERNAL | Login/MFA, organizer verification/moderation, order/evidence/refund, settlement/external payout record (synthetic, no money), support/audit |
| Stripe test lifecycle/refund | BLOCKED EXTERNAL | Actual test merchant Checkout/webhooks, signature/amount/binding, one issuance/mail, refund invalidation |
| Webpay integration | BLOCKED EXTERNAL | Actual redirect/return/commit/status amount/order/cancel/fail/duplicate/late |
| Flow sandbox | BLOCKED EXTERNAL | Dedicated keys and actual signed API/callback lifecycle; remains disabled |
| Payment failures | BLOCKED EXTERNAL | Reproducible sandbox decline/cancel/timeout/duplicate/late case IDs; do not invent failures unavailable in provider |
| Resend/deliverability/DNS | BLOCKED EXTERNAL | Controlled inbox receipts + queue/provider IDs; provider-confirmed domain/SPF/DKIM and reviewed DMARC |
| AI tasks/quality | BLOCKED EXTERNAL | Approved project/model/budget; minimal real simulator/event/rewrite/FAQ/SEO/tiers/analytics/schema/failure calls |
| S3 media/IAM/cache | BLOCKED EXTERNAL | Dedicated private bucket/prefix, restricted IAM, real normalized variants/draft/public/replacement/orphan/delete/retry, cache/fallback |
| Wallet save/current credentials | BLOCKED EXTERNAL | Demo issuer and actual Google account/device; current-generation scanner evidence |
| Workers/scheduler/alerts | BLOCKED EXTERNAL | Private packaged runtime + schedules; actual last run/success/failure/retry/REVIEW/overlap/duration/backlog and test alert receipt |
| Hosted HTTPS sessions/CSP | BLOCKED EXTERNAL | Secure/HttpOnly/Lax/host-only cookies, buyer/org/admin/MFA/reset/logout/invalidation/transfer; exact media/payments/camera/Wallet/font origins |
| Callback ingress/CORS | BLOCKED EXTERNAL | Provider POST reaches verified handler through Preview protection; no signature/authorization relaxation |
| Hosted dependency failure/recovery | BLOCKED EXTERNAL | Approved kill switches, retained drafts/previous media/mail backlog/pending payment evidence; actual restart/rollback measurement |
| Physical accessibility/scanner | BLOCKED EXTERNAL | Identified phones/assistive technology and actual observations; PHYSICAL-DEVICE-QA |
| Staging capacity | BLOCKED EXTERNAL | Named bounded staging resources; M13 local max5/20 purchase/check-in baseline retained, no production extrapolation |
| Business launch configuration | BLOCKED BUSINESS | Commission/fee/refund/settlement/transfer/nominative/courtesy/organizer/feature approvals |
| Legal/retention approval | BLOCKED BUSINESS | Actual identity/contact/reviewer + per-record policy/holds; no invented durations |
| External/manual penetration review | NOT TESTED | Authorized target, synthetic roles and security scope; dependency audit is not a penetration test |

AI quality execution: six synthetic Chilean event types (concert, festival, party,
theatre, sports, workshop), spread tasks across a small approved budget. Omit venue
addresses/legal facts deliberately; assert absent facts stay absent. Human review must
record actual defects. Proposals must not publish, change prices/capacity or send mail
without separate explicit authorized actions. Provider error/timeout tests may use
controlled fakes but must be labeled as such, never real provider failure evidence.

Local baseline at M13: 401 tests, PostgreSQL concurrency/migrations, TypeScript/lint/build,
188 browser states,58-table restore and bounded load. See [qa/m13](qa/m13/README.md).
These remain historical local evidence. M14 dependency changes require fresh local
regression/build/browser checks recorded in [qa/m14](qa/m14/README.md); those results
do not change the blocked hosted rows above.

User actions and exact secure variable names: [M14-CERTIFICATION](M14-CERTIFICATION.md).
Business/feature decisions: [BUSINESS-SIGNOFF](BUSINESS-SIGNOFF.md). Physical results:
[PHYSICAL-DEVICE-QA](PHYSICAL-DEVICE-QA.md). Production cutover remains separately gated.
