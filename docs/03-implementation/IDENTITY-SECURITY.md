# Identity and security foundation — M3

Implemented on `astra/ticketchile-v2`, extending M1/M2. This is a local, tested foundation, not a production-readiness certification. No production credentials, provider calls, emails, migrations or deployment were used.

## Identity and sessions

The existing sources remain `usuarios` (BUYER UUID), `organizer_users` (ORGANIZER owner), and `admin_users` (ADMIN/SUPERADMIN). `identity_principals` joins their live state with shared `identity_accounts`, sessions, tokens and MFA. Staff memberships attach to verified buyer identities; organizer accounts remain tenant owners. There is no role trusted from the browser.

Every session is a random 256-bit opaque token, stored as SHA-256, with account security version, expiry, revocation and MFA state. Buyer NextAuth JWTs carry a persisted session reference; the session callback validates it against PostgreSQL on every use. JWT refresh never recreates a revoked session. Existing JWTs without the reference and old admin/organizer session formats fail closed at rollout.

Buyer sessions last seven days; privileged sessions eight hours. Admin and organizer owner sessions without completed MFA are restricted to security setup for ten minutes. They cannot pass operational guards. Privileged cookies are host-only, HttpOnly, SameSite=Lax, Secure in production; login also expires the previous broad-domain cookie. Each login creates a fresh token. Logout revokes the persisted session and is POST-only with an origin check. Password reset, MFA enable/reconfiguration/disable and administrative identity changes increment the account version and revoke all sessions. Staff capability changes are read live, so an existing buyer session immediately loses removed permissions on subsequent requests.

Google login requires the provider's verified-email claim. Buyers with enrolled local MFA must use password plus TOTP/recovery code; OAuth cannot bypass it. Passwordless Google users can establish a password through recovery before enrolling local MFA. A future OAuth second-factor challenge UI is not implemented.

## Passwords, recovery and verification

New passwords use asynchronous scrypt N=131072, r=8, p=1, a random 16-byte salt and 64-byte output. Encoded parameters are fixed and validated. New/reset passwords require at least 12 characters and at most 256 UTF-8 bytes. Both legacy scrypt encodings (buyer hexadecimal and privileged base64/base64url) remain verifiable. A successful eligible login progressively upgrades a legacy hash with a compare-and-set write. Legacy passwords shorter than the new minimum remain usable until a password change; no destructive forced hash migration occurs.

Recovery is shared for all three identity kinds. Unknown, disabled, unverified or otherwise ineligible identities receive the same response as eligible accounts. Reset tokens are random 256-bit values, hashed in storage, expire after 30 minutes, carry the account version and are single-use under row locks. A concurrent second reset cannot consume the same token. Requesting another link does not invalidate an outstanding valid link. Reset keeps MFA enrolled and does not automatically log the user in. Admin recovery requires a separately verified recovery email; existing admins without one cannot use email recovery.

Buyer/organizer registration shares the modern hash policy and token infrastructure. Email verification uses 24-hour random hashed tokens, never the legacy six-digit organizer code. Verification does not approve an organizer. Expired/legacy verification can be replaced through `verify-resend`; existing pending links are not invalidated. Public responses do not expose tokens, account IDs or raw database failures. Legacy verification GET links are no longer mutation endpoints; use the security form with a newly issued token.

## MFA

TOTP uses a 20-byte random secret, SHA-1, six digits and 30-second steps, accepting the adjacent step in either direction. The last consumed counter is persisted under a row lock: codes cannot be replayed, including concurrent requests. RFC 6238 test vectors are covered. Enrollment requires the password; reconfiguration additionally requires the existing factor or an unused recovery code. A pending enrollment expires after ten minutes. Confirmation proves possession before enabling MFA and rotating sessions.

Ten random 96-bit recovery codes are returned once, stored as account-bound hashes and consumed atomically. Disabling MFA requires password and current factor/recovery code and revokes all sessions. The mandatory MFA policy for ADMIN/SUPERADMIN/ORGANIZER_OWNER remains after disable; their next login only permits re-enrollment. Buyer/staff enrollment is optional in M3.

MFA secrets and queued delivery payloads use AES-256-GCM, random nonces and account/message-specific associated data. Set `SECURITY_DATA_KEY` to a securely managed canonical base64 encoding of 32 random bytes. Tests use an inert generated fixture key. Missing/invalid key configuration fails closed. Key rotation/re-encryption, managed secret storage and loss-of-all-factors support procedures must be designed and rehearsed before production rollout; changing the key without re-encryption makes existing MFA/outbox ciphertext unreadable.

## Delivery and functional verification

Security messages are inserted into `security_outbox` in the same transaction as token issuance, with encrypted recipient/token payloads. No production mail provider is called. Domain functions accept an explicit delivery adapter for tests. The local inbox script only permits loopback `ticketchile_test*`/`ticketchile_local*` databases and writes decrypted test messages to ignored `.local/security-inbox.json`; it does not print tokens or claim delivery. Protect that file and the local cluster as credentials. The production delivery worker, retries, retention, acknowledgements and provider configuration remain M4 work. Registration/recovery/invites are not end-to-end deliverable until that worker is supplied.

`/security` is a minimal functional form for recovery, reset, verification/reissue, invitation acceptance and MFA setup/confirmation/disable. Login forms accept TOTP or recovery codes. It is not the final account/settings UI. Staff can open `/scanner/[eventId]` with a verified buyer session and persisted grant; the existing organizer scanner URL remains available to owners. Owner/staff management UI and non-scanner operational screens remain M8.

## HTTP/domain inventory

All shared `/api/security/[operation]` operations are POST, bounded to 16 KiB, reject cross-site Origin/Fetch-Metadata and return private/no-store responses.

| Operation | Authority |
| --- | --- |
| `recovery`, `reset`, `verify-resend` | Rate-limited public workflow; only a valid hashed expiring token authorizes reset/verification |
| `mfa` | Persisted identity, including restricted privileged setup sessions; action-specific password/factor checks |
| `invite`, `invite-revoke`, `staff-update`, `staff-revoke` | Live organizer owner with `staff.manage`, tenant-constrained mutations |
| `invite-accept` | Verified buyer session, token and exact verified recipient email |
| `/api/admin/identity` | Fully authenticated SUPERADMIN; disable/enable and ADMIN/SUPERADMIN changes revoke sessions; cannot remove the last enabled superadmin |
| Existing signup/register/verify/login/logout routes | Thin handlers around the same shared identity services |
| `/api/admin/bootstrap`, `/api/organizador/admin/{bootstrap,create-user}`, `/api/organizador/sso` | Retired (410 at the handler); header keys, email allowlists and ID cookies cannot provision/authenticate |

No unrestricted HTTP production provisioning remains. `scripts/bootstrap-local.mjs` is the replacement for local fixtures: explicit local-only URL, password via stdin, modern hash, audit and mandatory MFA. Existing production superadmin/recovery-email onboarding needs a separately reviewed operator runbook. The unused legacy signed organizer-ID cookie module was removed.

## Rate limits and inventory abuse

`RateStore` has an atomic PostgreSQL counter implementation and an explicitly injected deterministic memory implementation for tests. Production never silently falls back to per-process memory. Counter keys use HMAC of identifiers; raw email/IP values are not stored. Storage failures fail closed.

| Operation | Per-identity/token allowance |
| --- | --- |
| Login | 15 / 15 minutes per identity kind/login |
| Registration, recovery, verification reissue | 5 / 15 minutes |
| Reset, email verification, ticket resend | 10 / 15 minutes |
| MFA verification / security changes | 12 / 5 minutes; changes 6 / 15 minutes |
| Invitation acceptance / staff changes | 20 / 15 minutes; changes 40 / 15 minutes |
| Checkout / inventory hold creation | 20 / 15 minutes |
| Buyer ticket/QR/Wallet/payment reads | 600 / minute |
| Event scanner/statistics access | 1200 / minute per actor; check-in additionally 600 / minute per actor/event |
| CSV export | 10 / minute per actor |

Public workflows also have a network bucket: 300 / 15 minutes for a trusted IP, or a broader shared 3000 / minute fallback when no trusted IP is available. Configure `SECURITY_TRUSTED_IP_HEADER` only for a header the ingress **overwrites**, never appends or accepts from the client. Arbitrary forwarded headers are ignored by default. Tune limits and scrypt memory/concurrency using load tests before launch; distributed account creation and volumetric attacks still require ingress defenses. Schedule deletion of expired rate buckets/tokens/sessions/outbox payloads using a dedicated maintenance role and a documented retention policy; no unattended cleanup task was installed here.

All active hold creation paths bind `owner_email` from a verified buyer session. New holds are limited transactionally to 10 tickets per hold, three concurrent active holds and 20 active held tickets per account. A per-account transaction advisory lock prevents simultaneous requests bypassing quotas. Standalone/Stripe/Webpay holds use eight minutes; Flow retains its existing 15-minute TTL. Caller-supplied standalone TTL is ignored. Expired holds do not count toward quotas; creation paths perform the existing inventory release in a transaction. Hold reuse requires the stored owner as well as payment owner/provider. Unowned legacy holds cannot be claimed just by knowing an ID; no inferred backfill is performed.

There is no public AI provider endpoint in this checkout to rate-limit; M7 must use this boundary before adding one. The inactive Fintoc create route does not initiate a provider payment or reserve inventory. Publication eligibility, event-specific purchasing rules, callback/finalization consistency, deadlock/retry policy and cleanup scheduling remain M4 concerns, not a certification of the payment lifecycle.

## Audit and limitations

`security_audit` records actor kind/ID, tenant/event where known, action, target, timestamp and allowlisted metadata. Successful sensitive mutations write audit records in the same transaction: registration/verification, session creation/logout, password reset, MFA changes/recovery-code use, invitations/acceptance/revocation/permission changes, administrative identity changes, organizer approval, event approval/publication/unpublication and check-in. Passwords, codes, tokens, full request payloads and buyer contact fields are excluded. Reads are not indiscriminately audited.

A trigger rejects UPDATE/DELETE, but this is not tamper-proof against a database owner/superuser or someone able to disable triggers/TRUNCATE. Production must use a restricted runtime DB role, separate migration/maintenance roles and external archival/monitoring. Refund, settlement, bank-account, event cancellation and complimentary-ticket mutations are not implemented; their future domain transactions must call this audit service.

Local PostgreSQL tests verify grants, expiry, row-lock races, session invalidation, MFA replay, quotas and audit creation. Browser/camera/Google OAuth/provider/email/Wallet end-to-end tests, distributed load, production catalog compatibility, secure key operations, delivery workers and retention remain unverified. Email-based ticket ownership and previously issued QR/Wallet transfer/key rotation remain M2 follow-up exposures. M4 is the exact next milestone; do not begin it as part of M3.

Design references: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238), [NextAuth callbacks](https://next-auth.js.org/configuration/callbacks). Documentation review only; no provider requests.
