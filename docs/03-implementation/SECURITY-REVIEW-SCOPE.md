# M14 manual security review scope

Prepared 2026-09-28. **No penetration test has occurred.** Run only against the named
dedicated staging host after resource identification. Synthetic accounts/data only;
bounded requests, no destructive provider traffic or production scanning. Retain
sanitized request IDs/outcomes, never credentials/PII/QR/claim URLs. Stop immediately
on cross-tenant disclosure or unintended financial/provider effects.

| Boundary | Required manual negative/positive cases |
|---|---|
| Authentication | Verification/recovery single-use/expiry, persisted logout/revocation, disabled users, MFA/recovery reuse, OAuth verified email and MFA boundary, CSRF/origin, cookie flags, rate limits and trusted ingress |
| RBAC | Buyer, owner, manager, door staff, support, limited admin and superadmin; revoked membership/capability must take effect on next request |
| Tenant/event isolation | Substitute IDs across tenants and explicit event grants in UI/API/aliases, exports/CSV pagination, media, attendees, statistics and finance; IDs never authenticate |
| Payments | Payer ownership of status/confirmation; forged/duplicate/late/out-of-order callback, provider signature and amount/currency/merchant/order binding, pending creation/reconciliation, atomic single issuance and no oversell |
| Tickets/QR/Wallet | Anonymous/foreign/current/former owner, signed credential tampering, generation replay, cancelled/refunded/used, internal QR rendering and every compatibility alias; saved Wallet is not entry authority |
| Scanner/check-in | Server-side explicit assigned event, revoked staff, wrong event, duplicate concurrency, manual lookup, history/stats/export; no event-code authentication or offline success |
| AI | Prompt injection/untrusted output, closed schema, tenant/revision/claim replay, forbidden automatic publication/prices/capacity/mail, data minimization, quotas, disabled/timeout fallback and server-only model/key |
| Media | Upload authorization before work, MIME/content mismatch and malformed/oversized raster, pixel/concurrency limits, private draft, foreign attachment, signed URL lifetime, reference/delete race, IAM prefix, retry/orphans/version retention |
| Admin finance | Live capability/MFA for refunds/settlements/payout recording, immutable commission snapshots, duplicate/uncertain refund, transfer/refund race, payout evidence/replay and support/audit redaction |
| Infrastructure | Preview DB/secret/provider isolation, TLS/grants, least privilege, protected worker identity/leases, exact CSP/callback ingress, generic readiness failures, sanitized logs, managed backup/object/key recovery |

Include legacy/demo/compatibility routes in endpoint inventory from `src/app/api`.
Use one authorized and one foreign synthetic tenant/event/order/ticket per boundary.
For every finding record reproduction, expected/actual, affected commit/route/role,
severity rationale, owner and retest evidence. Existing automated contracts are useful
inputs, not independent review. A dependency scanner cannot prove exploitability or
absence of vulnerabilities in native binaries, account configuration or application code.

Residual application/operational exposures to review: legacy email-based ownership
adoption; inline hydration/style CSP; downloadable media and short-lived signed cache
remaining after withdrawal; in-flight mail with revoked old QR; no remote Wallet deletion;
runtime DB owner/trigger grants unverified; sender bounce/complaint ingestion absent;
private worker packaging/scheduling/alerts absent; physical retention pending; external
callback/HTTPS/MFA/provider/device and production schema/recovery unverified. Existing
authorization controls remain in [AUTHORIZATION](AUTHORIZATION.md); no guard was relaxed.
