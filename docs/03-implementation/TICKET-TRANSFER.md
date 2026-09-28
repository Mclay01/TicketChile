# Ticket transfer and buyer account — M11

M11 extends completed M1–M10. No deployment, production migration, real provider delivery or production credentials are involved. This document describes technical behavior; it does not approve commercial transfer policy.

## Ownership and account

M3 buyer identities and persisted sessions remain authoritative. Profile PATCH accepts only `name` and `phone`, validates bounds/formats, derives the target from the authenticated identity and audits the update. Email, identity IDs, RUT and security fields are rejected. Email change is disabled; payment billing fields are historical and are not profile fields. `/cuenta/seguridad` offers existing buyer recovery/password reset and current-session logout without privileged account selectors. Password reset invalidates previous sessions. There is no new buyer MFA requirement or separate session-management UI.

Current ticket ownership remains the canonical normalized ticket email with the existing order/buyer fallback for legacy rows. Payment/order ownership is separate and never changes during a transfer. Verified recipient identity is bound by its current email and recorded UUID at acceptance. Secure email changes would require a separate coordinated identity/ownership workflow.

Former participants can view a historical ticket and masked ownership history, but cannot request QR, resend or Wallet. Current-owner ticket reads and payment-confirmation filtering remain independently authorized. `/api/tickets` and `/api/demo/tickets` no longer return the original purchaser email/order ID to a transferee. Ownership history records sequence, account when known, owner email, transfer, acquisition and initiation times; it is append-only. The UI reads at most 100 history entries and does not reveal unrelated purchaser/order data.

## Eligibility and policy configuration

No event is enabled by migration. Missing configuration fails closed. `POST /api/tickets/transfer-policy` requires live event `event.edit` authority, repeats SQL scope under the inventory lock, validates tier membership and audits changes. This is an explicit operational API; a dedicated policy editor is not implemented.

Required configuration fields are `eventId`, `enabled`, `deadline` (timestamp or explicit null), `maxTransfers` (positive integer or explicit null), `feeClp` (nonnegative integer or null), `allowCourtesy`, `identityRule`, `approvalReference` and `disabledTiers` (array). NULL deadline/count explicitly means no configured deadline/count cap; it is not silently supplied by a buyer. A disabled tier overrides enabled event configuration. The approval reference is an operator-entered record, not a claim of legal/commercial approval.

The executable path supports only explicitly configured zero fee and `identityRule=NONE`. NULL/positive fees, `IDENTITY_REQUIRED` and `NON_TRANSFERABLE` fail closed. Charging transfer fees or verifying nominative/age restrictions is not implemented. Such events must remain disabled or use a blocking identity rule until their requirements have a supported enforcement mechanism. Complimentary tickets require explicit `allowCourtesy=true`; issuance actor, reason, order and inventory records remain unchanged.

Eligibility is checked at initiation, inspection, resend and acceptance: current owner, VALID ticket, no used timestamp, real tier/event, non-draft/nonterminal event, live policy, tier permission, deadline/count, courtesy policy and absence of any refund that is not FAILED/REJECTED. This conservatively blocks transfer from refund request onward; admission retains M9's PROCESSING/UNKNOWN/COMPLETED rule. Event date alone does not invent a transfer deadline; operational ENDED/CANCELLED state and an explicitly configured deadline control it.

Unapproved business choices remain: transferability/defaults, fee, deadline, count, nominative requirements, age conditions, courtesy policy and event-specific exceptions. No production enablement is implied by synthetic QA policies.

## Claims, cancellation and resend

`POST /api/tickets/transfer` accepts allowlisted actions: initiate, stage, detail, inspect, accept, cancel, resend. All actions enforce same-origin browser requests and bounded JSON. Stage is public but grants no ticket data or acceptance authority. Other operations resolve the current verified buyer. No recipient-account existence lookup occurs at initiation.

Initiation creates one durable PENDING row per ticket, sender/request-key uniqueness, a random 256-bit token, SHA-256 digest and a 48-hour expiry. This is a technical claim lifetime, distinct from event business deadlines. Only encrypted mail contains the raw token; audit contains no token or recipient snapshot. Accepted/cancelled/expired state invalidates the digest even though the digest is retained for safe status reporting. Malformed, expired, superseded and wrong-recipient claims fail; accepted replay cannot transition ownership again.

Invitations use `/transferir#<token>`. The browser stages the fragment into an authenticated-encryption, HttpOnly, SameSite=Lax, production-Secure cookie scoped to `/api/tickets/transfer`, then clears the fragment. The ciphertext includes its own expiry. Claims never enter callback query strings or server URL logs. The cookie is browser-specific and survives registration, verification, login and logout; it does not authorize access. Inspect/accept require the verified intended recipient and revalidate the current ticket. Links opened on the existing acceptance page are reprocessed on hash change. A new invitation replaces the browser's staged claim; the original email can reopen another invitation.

Pending ownership stays with the sender. They can still use their current QR. If it is checked in, acceptance fails. Owner-only cancellation is idempotent, keeps ownership/credential unchanged and invalidates the claim. Old owners cannot cancel after acceptance. Resend rotates the token and invitation revision without extending expiry; older links and queued invitation revisions become unusable. Repeated initiation with the same sender/key and same payload returns the existing result; changed payload conflicts. Another key cannot create a second pending transfer.

Persisted rate limits: initiation 20/hour, resend 5/hour, cancellation 30/hour, claim inspection 60/15 minutes, acceptance 20/15 minutes, profile/policy 30/hour per actor, transfer detail 120/minute. Public staging uses the existing M3 network limiter. These are technical abuse controls, not approved commercial limits or distributed-load guarantees.

## Transaction ordering and races

All transfer mutations use the existing transaction advisory inventory lock before transfer/ticket row locks. Acceptance rereads live identity, policy, ownership, refund and ticket state, then changes owner, increments credential generation, accepts the claim, inserts immutable ownership history, cancels old queued/leased ticket snapshots, queues the new owner ticket and both acceptance notifications, and writes audit in one transaction. Persistence/audit failure rolls everything back. External mail transport never runs inside this transaction.

| Race | Outcome |
|---|---|
| Duplicate initiation | One pending claim; same key replays, different key conflicts |
| Double acceptance | One transition/history/version increment; subsequent attempt reports already accepted |
| Cancel vs accept | One commits first; cancellation prevents accept, acceptance denies former-owner cancellation |
| Old QR check-in vs accept | Check-in first makes transfer ineligible; accept first makes the old credential invalid |
| Refund request vs accept | Request first blocks transfer; accept first may change owner, but refund still targets the original payment and current mapped ticket |
| Refund completion vs accept | Pending refund blocks acceptance; confirmed completion cancels the current ticket and never creates a new valid one |
| Event/courtesy cancellation vs accept | Shared ordering preserves cancellation; transfer never restores ticket status |

The global lock preserves existing ordering and costs concurrency across events. Production throughput must be measured before narrowing it. Normal PostgreSQL snapshots apply to identity revocations already racing a statement; no reversal of an already committed transfer is promised.

## QR and Wallet

The HMAC-SHA256/timing-safe primitive remains. `tc1.ticket.event.timestamp.signature` maps to generation zero. New persisted ticket rendering uses signed `tc2.ticket.event.timestamp.generation.signature`. Migration backfills all existing tickets to zero, so legitimate historical tc1 QR stays usable until its first transfer. Scanner compares the signed generation to the locked database ticket as part of the authorized VALID-to-USED update. Revoked generation returns INVALID_QR, including after a ticket transfers back to an earlier owner. Buyer token-based lookup also rejects stale generation.

QR, demo QR, ticket email and Google Wallet use the current stored generation. Event/actor permissions, signature, event, access configuration, refund and status checks remain required. Manual check-in is still a separately authorized staff operation, not a public ID-based bypass; operator identity/holder verification procedures remain an operational responsibility.

Wallet object IDs include generation. A new owner can create a new signed save URL only when provider configuration is complete. A saved old pass may remain visible on the former owner's device, but its barcode fails current-generation validation. **No remote pass removal/update is claimed.** Actual issuer acceptance and Android/device behavior remain uncertified; local tests only sign/decode JWTs. Ordinary ticket/QR access works without Wallet.

## Durable mail and migration adoption

M4 mail jobs gain TRANSFER purpose and encrypted message rows. Invitation delivery rechecks pending state, expiry and revision. Retries persist exactly the same encrypted payload and provider idempotency key; old revisions are cancelled before delivery. Ticket jobs bind generation as well as recipient/status/paid-or-courtesy issuance. Acceptance cancels queued old-owner snapshots and creates a generation-bound new-owner job. A send already in flight cannot be recalled, but any stale credential it contains is unusable at scanner. Notification delay/failure cannot change authoritative ownership.

Append `0010_ticket_transfers.sql`; never modify 0001–0009. It adds profile phone, credential generation, event policy, tier disable flag, transfer/messages/history tables, uniqueness/indexes and initial-owner history trigger. Existing owner history is the authoritative owner **at migration**, not reconstructed evidence of transfers predating this system. Existing tc1 credentials and status survive; no paid evidence or financial ownership is fabricated. Readiness requires all ten versions. Production catalog reconciliation, backup/restore, runtime grants and ciphertext retention remain release gates. Do not roll back to scanner code that ignores generation after any transfer; use a compatible forward fix or stop admissions/transfer until repaired.

Local evidence and commands: [qa/m11/README.md](qa/m11/README.md). Provider delivery, issuer approval, physical cameras/devices, formal assistive-technology certification, production security/load review and policy approval remain separate release work.
