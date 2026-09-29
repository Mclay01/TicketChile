# M14 external certification

Date: 2026-09-28. Branch: `astra/ticketchile-v2`. Baseline: M13
`ab2ac4e3605b7422927173c7126f3a530a8799f4`, clean tree; M1-M13 complete and preserved.
This record covers the authorized nonproduction milestone. Production remains blocked.

## Evidence rules

States: **NOT CONFIGURED** means no dedicated configuration has been established in
this work; it makes no assertion about an uninspected external account. **CONFIGURED**
requires reviewed resource/environment bindings; **CONNECTED** requires an actual safe
connection; **SANDBOX VERIFIED** requires real provider lifecycle evidence;
**BROWSER VERIFIED** requires the hosted UI; **PHYSICAL DEVICE VERIFIED** requires
an identified physical device. **BLOCKED BY USER ACTION** identifies missing access,
resources or decisions. **BLOCKED BY PROVIDER** requires an actual provider rejection.
**PRODUCTION CERTIFICATION STILL REQUIRED** applies independently to all integrations.
No provider rejection or hosted success has been observed. Local contracts are separate.

| System | Established configuration | Current certification | Resume dependency |
|---|---|---|---|
| Existing Vercel Preview project | NOT CONFIGURED | BLOCKED BY USER ACTION | Authorized team/project, account access and Preview URL |
| Dedicated managed PostgreSQL | NOT CONFIGURED | BLOCKED BY USER ACTION | Provider/project/instance, runtime/migration roles and separate restore target |
| Stripe test | NOT CONFIGURED | BLOCKED BY USER ACTION | Test merchant, signed webhook and reachable Preview callback |
| Webpay integration | NOT CONFIGURED | BLOCKED BY USER ACTION | Explicit official integration merchant/key |
| Flow sandbox | NOT CONFIGURED | BLOCKED BY USER ACTION | Sandbox account/key; keep disabled meanwhile |
| Fintoc | NOT CONFIGURED | BLOCKED BY USER ACTION | Launch decision; adapter incomplete and code disabled |
| Resend test delivery/domain | NOT CONFIGURED | BLOCKED BY USER ACTION | Verified test sender and controlled recipients |
| OpenAI nonproduction project | NOT CONFIGURED | BLOCKED BY USER ACTION | Dedicated project, model/data/budget approval and key |
| S3-compatible preview bucket | NOT CONFIGURED | BLOCKED BY USER ACTION | Dedicated private bucket and restricted IAM |
| Google Wallet demo issuer | NOT CONFIGURED | BLOCKED BY USER ACTION | Issuer/service account/test Google account and physical device |
| Private workers/scheduler | NOT CONFIGURED | BLOCKED BY USER ACTION | Chosen restricted runtime and scheduler permissions |
| Staging logs/alerts | NOT CONFIGURED | BLOCKED BY USER ACTION | Sink, retention, recipient, operational owner and thresholds |
| Physical phones/assistive technology | NOT CONFIGURED | BLOCKED BY USER ACTION | Actual devices and operator; see physical QA |

Every provider above: **PRODUCTION CERTIFICATION STILL REQUIRED**. No credentials,
customer data, external financial movement, DNS, production branch or production
configuration were accessed/changed. No hosted deployment was created. Installed
Vercel CLI and unrelated hosting connectors do not identify the authorized project.
No root or apps/web `.vercel/project.json` link was established. Requests for resource
names, available devices and business owners were made; no answers received.

## Actions required (never send secret values in chat)

The infrastructure owner must first identify the existing Vercel **team/project** and
grant access. Inspect root `apps/web`, Next.js framework, build/output commands,
unchanged Production Branch, Preview variables, deployment protection, domains and
sanitized logs. Configure only Preview, preferably a stable Vercel Preview hostname.
Do not attach ticketchile.com or edit DNS. Account selection is the missing dependency,
not permission to perform the already-authorized staging work.

| Owner/provider | Exact secure configuration | How certification resumes |
|---|---|---|
| Vercel/security | Preview variables: `APP_ENVIRONMENT=preview`, identical HTTPS `STAGING_ORIGIN`, `APP_BASE_URL`, `NEXTAUTH_URL`; independent `NEXTAUTH_SECRET`, `TICKETCHILE_QR_SECRET`, canonical 32-byte base64 `SECURITY_DATA_KEY`; reviewed `SECURITY_TRUSTED_IP_HEADER` | Inspect settings, deploy branch to Preview, verify health/readiness, cookies, MFA/logout/reset/transfer and exact CSP |
| Google OAuth (if selected) | Dedicated test OAuth client in Preview `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (or existing `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` aliases); provider-authorized exact Preview callback `/api/auth/callback/google` | Real controlled-account login, verified-email and enrolled-MFA denial, logout/revocation; no multi-provider linking approval is inferred |
| Database | Preview `DATABASE_URL`, `DATABASE_RESOURCE_ENVIRONMENT=preview`, `DATABASE_EXPECTED_HOST`, `DATABASE_EXPECTED_NAME`, `DATABASE_SSL=true`, `DATABASE_SSL_REJECT_UNAUTHORIZED=true`; remove conflicting URL aliases. Inject `STAGING_MIGRATION_DATABASE_URL` only into the restricted operator environment | Verify dedicated resource identity/TLS/roles, run `node scripts/staging-migrate.mjs --apply`, inspect ledger0001-0011/catalog/grants; seed synthetic accounts; backup to separate staging restore target and verify reads/invariants |
| Stripe | Preview `STRIPE_ENABLED=true`, test-only `STRIPE_SECRET_KEY`, endpoint `STRIPE_WEBHOOK_SECRET`; `STRIPE_REFUNDS_ENABLED=true` only for approved synthetic refund exercise; explicit test `CHECKOUT_FEE_POLICY` | Real Checkout/test card, webhook signature/amount/issuance/mail/current-owner QR, duplicate/failure/cancel/late and full-unused-order refund. Endpoint `/api/payments/stripe/webhook` |
| Transbank | Preview `WEBPAY_ENABLED=true`, `WEBPAY_ENV=integration`, `WEBPAY_COMMERCE_CODE`, `WEBPAY_API_KEY` | Create/redirect/integration checkout/return/commit, amount/order binding, duplicate/fail/cancel/late return at `/api/payments/webpay/return` |
| Flow | Preview `FLOW_ENABLED=true`, `FLOW_BASE_URL=https://sandbox.flow.cl/api`, `FLOW_API_KEY`, `FLOW_SECRET_KEY` only when provisioned | Real sandbox creation/redirect/confirmation/signed status/order/amount/idempotency/failure at `/api/payments/flow/confirm`; otherwise `FLOW_ENABLED=false` |
| Resend | Preview and private worker: `MAIL_TRANSPORT=resend`, `MAIL_RESOURCE_ENVIRONMENT=preview`, `RESEND_API_KEY`, `FROM_EMAIL`, exact controlled `MAIL_ALLOWED_RECIPIENTS`, bounded `MAIL_MAX_ATTEMPTS` | Test verification/recovery/purchase/ticket/organizer/staff/transfer/courtesy/security mail actually implemented; compare queue/Resend/inbox. Refund/settlement notifications are absent |
| OpenAI | Preview `AI_PROVIDER=openai`, `AI_RESOURCE_ENVIRONMENT=preview`, `OPENAI_API_KEY`, approved `AI_MODEL`, matching `AI_ALLOWED_MODELS`, selected `AI_FEATURES`, `AI_MAX_INPUT_CHARS`, `AI_MAX_OUTPUT_TOKENS`, `AI_TIMEOUT_MS`, `AI_PUBLIC_HOURLY_LIMIT`, `AI_USER_HOURLY_LIMIT`, `AI_GLOBAL_HOURLY_LIMIT` | Small approved call budget across simulator/event/rewrite/FAQ/SEO/tiers/analytics, closed-schema/error/timeout checks and six Chilean event types; never silently select a model |
| Storage | Preview/worker `MEDIA_PROVIDER=s3`, `MEDIA_ENVIRONMENT=preview`, `MEDIA_S3_BUCKET` beginning `ticketchile-preview-`, `MEDIA_S3_REGION`, optional HTTPS `MEDIA_S3_ENDPOINT`, restricted `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY`, `MEDIA_UPLOADS_ENABLED=true` | Review prefix `preview/v1` IAM per MEDIA-ARCHITECTURE; real intent/upload/variants/private preview/publish/replacement/cache/fallback/orphan/cleanup/failure |
| Wallet | Preview `WALLET_RESOURCE_ENVIRONMENT=preview`, `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_WALLET_PRIVATE_KEY`; authorize demo test accounts in provider console | Save/display on actual device, transfer generations/current owner, refunded/cancelled denial in TicketChile scanner; no remote pass removal claim |
| Workers/operations | Same isolated DB/provider config in chosen **private** runtime secret store; scheduler identity and logs/alerts in its control plane | Package `runWorkerBatch` for mail/payments/media, install staging schedules, exercise locks/retry/REVIEW/backlog/duration and restart. No public worker endpoint or installed binary currently exists |

Secure values belong in Vercel **Preview** scope or the selected provider/operator secret
store; never source, chat, command arguments, screenshots or client-prefixed variables.
For email DNS, obtain the sender-domain status and **exact provider-issued** SPF/DKIM
records plus reviewed DMARC policy from the selected Resend account. They cannot be
derived without that domain/account. Owner configures DNS explicitly; then recheck
provider verification. No record values or successful verification are invented here.

## Execution and evidence requirements

Follow [STAGING-RUNBOOK](STAGING-RUNBOOK.md), [PROVIDER-CERTIFICATION](PROVIDER-CERTIFICATION.md)
and [STAGING-ACCEPTANCE](STAGING-ACCEPTANCE.md). Record commit/build, UTC time, exact
nonproduction host/resource, synthetic case ID, expected/actual result and sanitized
evidence reference. Never retain tokens, private keys, signed URLs, full prompts or PII.
Preview protection must allow authentic provider callbacks through a reviewed account
mechanism; never weaken application signature/ownership checks to solve ingress/CORS.

Managed recovery awaits the chosen database provider. Record actual snapshot/restore
IDs, separate target identity, roles/grants, all-table checks, FK/index/ledger and
owner/payment/transfer/media/AI/finance application reads. Coordinate object/key
backups. Measure actual rollback/restore and worker restart times; M13 local results
cannot certify managed recovery. Restore no production data into staging.

Staging alert proposal for operations approval: readiness failures on three consecutive
one-minute probes; three consecutive failed worker runs; oldest pending mail/recovery
older than ten minutes; any new poison REVIEW/uncertain refund; repeated callback
verification or media-delete failure. Group per category/environment, notify one test
recipient, suppress repeats for thirty minutes and send recovery once. These thresholds
are **proposed**, not installed or business-approved. Exercise one controlled alert per
category; no production paging or provider load. Record last run/success/failure/retry,
overlap, duration, oldest queue age and sanitized correlation ID.

Use kill switches with synthetic staging work to test AI/manual fallback, mail backlog,
media previous-image preservation and disabled new payment creation. Preserve existing
evidence/callback recovery. Do not damage managed services to simulate an outage.
AI physical deletion remains absent pending legal retention, not silently scheduled.

Next action is to resume this certification record when named resources/devices and
decisions exist. No automatic M15 or production release is authorized.
