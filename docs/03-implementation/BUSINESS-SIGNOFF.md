# Business and legal sign-off

Date: 2026-09-28. M14. No business value was supplied/approved in this milestone.
States: **APPROVED**, **PENDING**, **NOT REQUIRED FOR INITIAL RELEASE**. Only a named
human decision owner can approve a value or exclude a feature. Technical fixture values
are not business defaults. No policy configuration or financial history was changed.

## Decision register

| Decision | State | Exact input required / implementation boundary |
|---|---|---|
| Commission | PENDING | Basis/base, rate, fixed CLP amount, rounding, effective time, scope, refund treatment and policy reference; persist effective `commission_versions`, never rewrite historical snapshots |
| Fee payer | PENDING | Buyer/organizer split, displayed amount/tax treatment; select supported `CHECKOUT_FEE_POLICY` after review |
| Refund eligibility | PENDING | Unused/used, whole/partial, cancellation responsibility, approval authority and policy reference; current executor supports full unused Stripe orders only |
| Refund deadline | PENDING | Timezone, cutoff relative to event/payment, exceptions and pending requests |
| Settlement | PENDING | Cadence, reserves, fees/taxes/refunds, approver and required external payout evidence; records do not move money |
| Transfer default | PENDING | Opt-in scope and initial availability; absent event policy keeps transfers unavailable |
| Transfer deadline/limits | PENDING | Cutoff, max transfers, tier exceptions and fees; use existing versioned event policy/revision workflow |
| Nominative tickets | PENDING | Required identity fields, validation at entry, change/transfer rules and privacy basis |
| Complimentary tickets | PENDING | Who may issue/revoke, quotas, naming and notification rules |
| Organizer verification | PENDING | Required business documents, reviewer, rejection/appeal and renewal criteria |
| AI enablement | PENDING | Model allowlist, features, data/privacy terms, approved small test spend and launch budget |
| Operational owners | PENDING | Release/rollback/security/DB/provider/mail/storage/on-call owners, escalation and approved alert thresholds |
| Retention | PENDING | Per-record durations, start event, deletion/archive/anonymization, legal holds, backup expiry and access-request handling |

Approval record must include decision ID, exact value, human approver/authority, date,
effective date/scope, policy version/reference and acceptance evidence. Values outside
existing supported policy semantics need an explicit implementation decision, not
scattered hardcoded branches. No row is APPROVED or NOT REQUIRED on the user's behalf.

## Launch feature decision matrix

| Feature | Technical state | Interim certification posture | Human launch decision |
|---|---|---|---|
| Stripe | Implemented, local contracts | Keep unavailable until test merchant and lifecycle pass | PENDING: required payment method(s) |
| Webpay | Implemented, local contracts | Keep unavailable until official integration round trip | PENDING |
| Flow | Implemented, local contracts | Keep disabled without sandbox credentials | PENDING: may be excluded only by product decision |
| Fintoc | Incomplete, endpoints disabled | Remains disabled | PENDING: required for launch or NOT REQUIRED |
| Manual bank transfer | Disabled | Remains disabled | PENDING |
| AI | Implemented, local schema/rules | `AI_PROVIDER=disabled` until approved/configured | PENDING: optional exclusion is possible |
| Wallet | Implemented local signing | Unconfigured until issuer/device acceptance | PENDING: optional exclusion is possible |
| Ticket transfers | Implemented, current-generation checks | No new approved event policy; can freeze with `TRANSFERS_ENABLED=false` | PENDING |
| Stripe full unused refund | Implemented, local contracts | `STRIPE_REFUNDS_ENABLED=false` until policy/test approval | PENDING |
| Webpay/Flow/partial/used-ticket refunds | No executor | Remain unavailable | PENDING: policy must match supported release |

Optional features need not block initial launch **if** product explicitly marks them
NOT REQUIRED and disables them. Fintoc later requires a durable adapter, authenticated
provider retrieval, signature/timestamp/replay checks, merchant/environment/amount/
currency/order binding, uncertain recovery and real sandbox certification. M14 does
not implement it. No automatic subsequent milestone is created.

## Legal identity and provisional content

All **PENDING**: legal company name; RUT/company ID if applicable; legal address;
customer/support contact; terms owner; privacy contact; human/legal reviewer of Spanish
terms, privacy, refund, transfer, fee and organizer policies. Existing legal pages are
provisional. Do not publish placeholders as an approved legal identity. No definitive
Chilean legal advice or compliance approval is asserted by this document.

## Retention inventory

Each row is **PENDING**. No legal duration or deletion schedule is inferred.

| Records | Decision and technical constraint |
|---|---|
| Buyer/account PII | Profile/contact/session/verification/recovery retention; erasure vs financial ownership references |
| Orders | Buyer and price snapshots, event history and legal holds |
| Payments/refunds/settlements | Immutable evidence, processor references, accounting/payout attachments and backup retention |
| Tickets | Owner/generation/admission history and financial linkage |
| Audit logs | Immutable security/admin decisions; restricted archival/redaction and access logs |
| AI proposals | Seven-day access expiry is not physical ciphertext/metadata deletion; provider data terms require approval |
| Support cases | Private notes/attachments/contact and closure-based retention |
| Email jobs/security outbox | Encrypted recipient/body, attempts/idempotency/REVIEW and bounce/suppression records |
| Transfer claims/history | Expired/revoked claims, messages, recipient identity and immutable owner transitions |
| Media | Active/closed-event objects, retained originals/adoption journals, orphan grace and provider versions |

Legal holds, deletion verification, encryption-key recovery and provider backups must
be designed together. Physical cleanup for these broader policies is not installed.
