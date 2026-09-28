# Incident, rollback and retention procedures

These are operator instructions for a separately authorized environment. M10 has not executed them in production.

## Application or database failure

Use correlation IDs and sanitized category/action logs; use restricted audit records for authorized investigation. Do not log cookies, passwords, OTP/recovery tokens, QR payloads, card data, raw provider bodies, connection URLs or buyer email. Preserve evidence with least-privilege access and an approved retention policy.

If core readiness or ownership fails, stop traffic to affected operations and pause workers before replaying anything. Prefer disabling the affected provider/feature to changing payment evidence. Roll back to the previous **schema-compatible** app artifact. Additive migrations 0001–0009 remain applied; never edit their checksums or run destructive reverse DDL as an emergency shortcut. If schema recovery is unavoidable, restore a verified backup into an isolated database, assess new writes and reconcile external provider outcomes before switching. Record recovery point, possible data loss and explicit approval.

## Payments, inventory and check-in

For delayed payment: inspect persisted provider/reference/amount/currency and verified evidence through authorized admin tools; retry reconciliation/finalization with the existing identifiers. Never mark a PAID label as verified or issue tickets merely because a browser supplied an ID. For uncertain refunds, retain UNKNOWN/review and the same idempotency key; retrieve provider evidence before any new money action. Do not delete financial operations to “retry.”

For oversell suspicion, pause new sales for the affected event, preserve hold/issuance records, reconcile verified purchases and involve operations. Scanner remains server authorized; a lost response is not permission to admit offline. Re-query the same ticket and distinguish a prior successful check-in from an unconfirmed request. Do not clear USED state manually to hide duplicates.

## Delivery, credentials and privacy

For mail backlog, check the durable state, attempt age and lease; recover expired leases through the worker. Failed/uncertain sends retain their stable payload/key. REVIEW requires operator investigation before re-enqueueing. Current-owner and valid-ticket checks must still run before rendering QR or sending.

For compromised sessions/accounts, revoke persisted sessions and rotate credentials through approved identity tools; preserve audit. Encryption-key loss makes MFA/mail/AI data unreadable: restore approved key versions rather than replacing the key blindly. QR-signing rotation and encrypted-data key rotation require reviewed compatibility/reissue plans.

| Data class | Current safeguard | Required policy / operation |
|---|---|---|
| Sessions, reset/verification/MFA recovery | Expiry, digest or encryption, revocation/one-time use | Physical deletion schedule and recovery evidence retention |
| AI proposals | Encrypted, expiring, owner-bound, explicit apply; no raw prompt logging | Approved ciphertext purge, provider retention/DPA and legal holds |
| Mail jobs / security outbox | Encryption, current-recipient checks, leases, dedupe/review | Payload minimization after delivery; approved deletion and audit retention |
| Buyer/contact/support records | Scoped reads/exports and exact sensitive lookup | Access/erasure workflow, minimization and legally required exceptions |
| Financial evidence / payout / audit | Immutable decision trail and restricted capabilities | Accounting/legal retention, dispute holds, controlled archive |
| Media and backups | Local development boundary only | Production object lifecycle, backup encryption, restore/erasure handling |

No statutory period or automatic deletion is invented here. Legal/privacy owners must approve durations, hold precedence and auditable purge behavior. Access expiry is not physical deletion. The lack of installed purge jobs remains a release gate.
