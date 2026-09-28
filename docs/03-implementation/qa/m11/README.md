# M11 local verification

This directory contains synthetic local Chrome evidence for buyer profiles, security, ticket transfers, registration/verification/acceptance, ownership history, QR revocation and Wallet availability. It does not certify production, external delivery, issuer approval, physical devices or formal accessibility compliance. Approved 1D design artifacts remain unchanged.

Run from `apps/web`, with PostgreSQL's isolated loopback cluster on 127.0.0.1:55439 and an isolated Chrome debugging profile on 127.0.0.1:9335:

```text
node scripts/local-db.mjs start
node --test --experimental-test-isolation=none tests/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/lint-changed.mjs
node scripts/lint-all.mjs
node scripts/verify-build.mjs
node scripts/m11-preview.mjs
node scripts/m11-browser-qa.mjs
```

The preview creates a fresh uniquely named test database, scrubs application configuration, seeds synthetic tickets and identities, and runs the production build on loopback port 3005. The mail worker and merchant providers remain disabled. Wallet signing uses a generated local RSA key and never navigates to Google. Fixture secrets and claim tokens remain under ignored `.local`; committed evidence contains no raw transfer claim token or real personal data; ticket QR images are synthetic. The local test harness reads synthetic verification mail ciphertext to complete browser registration without an external mail call. Start a fresh preview before rerunning the mutation workflow.

`browser-report.json` records each state at 390/430/768/1024/1440, labels, one main landmark, overflow, touch-control sizing and QR presence. Screenshots at 390 and 1440 complement intermediate-width DOM checks. The script executes actual profile save/rejection, password login, registration, email verification, initiate/resend/cancel, claim persistence, keyboard acceptance and focus, replay rejection, former-owner QR denial, local Wallet JWT generation and expired/cancelled/invalid/wrong-recipient states. It also checks same-page navigation between invitation links.

`transfers.integration.test.mjs` executes actual PostgreSQL transactions and services for policy, ownership, claims, QR/scanner, Wallet, durable mail and races. Existing M1–M10 authorization/payment/identity/finance regressions remain part of the full suite. `release-migrations.integration.test.mjs` additionally verifies generation-zero and initial-owner backfill for synthetic legacy tickets, with no automatically enabled policy. The runner still tests drift and failed migration rollback.

Intermediate failures exposed stale same-page invitations and post-mutation transfer UI; both were fixed before the final browser evidence. Fixture token selection, existing-generation expectations, lifecycle consistency and synthetic admin MFA were corrected without weakening assertions or production guards. Windows process ACLs required elevated local execution for PostgreSQL, lint child processes, build and Chrome; no production access was involved.
