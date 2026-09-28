# Environment contract — M10

The root [`.env.example`](../../.env.example) is an inventory, not a runnable configuration. Every value is empty. No production credentials were inspected. Set values through the deployment secret manager; never paste secrets into commands, screenshots, logs or Git. Next reads application files under `apps/web`; the root template is documentation only.

| Group | Required conditions / behavior |
|---|---|
| APP | `APP_BASE_URL` and `NEXTAUTH_URL`: canonical HTTPS origins, no credentials, paths, queries or fragments. Local HTTP is permitted only outside production. `NEXTAUTH_URL_INTERNAL` is optional internal routing, operator reviewed. `SUPPORT_EMAIL` optional; absence remains visible as unavailable contact delivery. |
| DATABASE | Prefer `TICKETCHILE_DB_POSTGRES_URL`. Existing precedence: preferred URL, preferred non-pooling, `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL`, `DATABASE_URL`. Configure one unambiguous connection. `DATABASE_URL_UNPOOLED` is tooling compatibility, not runtime precedence. TLS defaults on in production, certificate verification defaults on; never disable verification to fix a certificate incident. Pool defaults to 5, connection timeout 5 seconds, statement timeout 15 seconds. Size total pools across instances against database limits. |
| AUTH | `NEXTAUTH_SECRET` required, at least 32 characters with cryptographic entropy; `AUTH_SECRET` is a compatibility alias, prefer canonical key. OAuth optional: configure a complete Google ID/secret pair (`GOOGLE_CLIENT_*`, otherwise `AUTH_GOOGLE_*`), registered callback and verified provider ownership. Password/MFA login remains independent. |
| SECURITY | `SECURITY_DATA_KEY`: canonical base64 encoding of 32 random bytes; encrypts MFA, security/mail/AI records and keys rate identifiers. `TICKETCHILE_QR_SECRET`: independent strong signing secret, at least 32 characters. Keep old key material for encrypted data recovery; rotation needs a reviewed migration strategy. `SECURITY_TRUSTED_IP_HEADER` only if ingress removes user input and overwrites that header. |
| EMAIL | Disabled unless `MAIL_TRANSPORT=resend`, key, verified `FROM_EMAIL` and encryption key are supplied. No claimed send on disabled transport. Test injection records TEST delivery only. Configure and monitor the durable worker separately. |
| PAYMENTS | Every method disabled until its flag is explicitly `true` and its complete configuration passes server validation. Checkout additionally requires approved `CHECKOUT_FEE_POLICY=none`; absence fails closed, and no fee policy is inferred. Stripe needs secret + webhook secret; Webpay needs commerce code/key and `integration` or `production`; Flow needs API/secret keys and exactly the sandbox or production API origin. Fintoc and transfer have no enable switch because reviewed implementations are absent. |
| REFUNDS | Separate `STRIPE_REFUNDS_ENABLED=true` plus a recognized Stripe secret key; still requires authorization, policy approval, idempotency and provider evidence. A flag without a key is unavailable. This is not certification. Other providers remain manual review; partial refunds are not implemented. |
| AI | Default disabled. OpenAI requires provider, server key, model and exact allowlist membership. Development adapter is refused in production. Features default to the implemented feature list. Bounds/defaults: input 4000 (100–8000), output 2500 (256–4000), timeout 20000 ms (100–30000); public/user/global hourly limits 5/30/200, capped 20/100/1000. `ORGANIZER_AI_ADAPTER` is development compatibility only. |
| MEDIA / WALLET | M12 implements one S3-compatible adapter plus local development storage; production connectivity remains unverified. See the matrix below. Wallet needs issuer, service account and private key plus canonical app origin. A complete-looking configuration does not establish issuer approval or real-device validation. |
| WORKERS | No scheduler credentials or public worker endpoint exists. Trusted server services use the same database, encryption, email and payment keys. The operator must install a scheduler/runtime with private invocation, bounded concurrency and alerts. See the runbook. |
| OBSERVABILITY | Operational JSON logs go to stdout/stderr with closed fields, correlation ID and severity; finance/security audit lives in PostgreSQL. Hosting log destination/retention is an external choice. `NEXT_TELEMETRY_DISABLED` and `TICKETCHILE_BUILD_DIR` are optional tooling controls, not application secrets. |

`APP_URL` / `NEXT_PUBLIC_APP_URL` remain compatibility names, never an authorization boundary. Hosting supplies `NODE_ENV` and, on Vercel, `VERCEL_URL`; these are not secrets. Do not expose server keys with a `NEXT_PUBLIC_` prefix. `MIGRATION_DATABASE_URL` is exclusively for the guarded local rehearsal runner: it rejects remote hosts, URL options and non-test/local database names.

`GET /api/health` means the process responds. `GET /api/ready` checks core secret/origin formats, database connectivity and the expected eleven-version ledger; both use no-store responses. Readiness exposes only `{ready:boolean}` and does not certify checksums, TLS, providers, legal policy, media storage or worker scheduling. The deployment gate must perform those separately. A missing/partial provider remains unavailable at the provider boundary without disabling unrelated browsing.

## M12 media configuration (all server-only)

| Variable | Contract |
|---|---|
| `MEDIA_PROVIDER` | `local`, `s3`, `disabled`. Default local outside production, disabled in production. Explicit local is refused in production/host preview. |
| `MEDIA_ENVIRONMENT` | S3 requires `development`, `preview` or `production`, matching host `VERCEL_ENV`. |
| `APP_ENVIRONMENT` | Independent matching deployment stage required on hosts without `VERCEL_ENV`. Configure through deployment infrastructure, not request input. |
| `MEDIA_S3_BUCKET` | Required private bucket, named `ticketchile-<stage>-<suffix>`. Preview and production names/prefixes must differ. |
| `MEDIA_S3_REGION` | Required S3 signing region, including the compatible provider's documented region. |
| `MEDIA_S3_ENDPOINT` | Optional exact HTTPS origin for a compatible provider, no credentials/path/query/wildcard/port; path-style access is used. Absent means AWS regional virtual-host style. |
| `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY` | Explicit dedicated environment credentials. No ambient AWS credential chain or client variables. Rotation must retain access to the same store identity. Temporary session-token credentials are not implemented. |
| `MEDIA_MAX_BYTES` | Default/hard maximum 5242880; configurable 1024–5242880. |
| `MEDIA_MAX_PENDING` | Default 30 unreferenced assets/tenant; range 3–100. Referenced and retained adoption assets are excluded. |
| `MEDIA_GRACE_HOURS` | Default 168; range 24–2160. Technical orphan grace, not event/legal retention. |
| `MEDIA_PROCESSING_CONCURRENCY` | Default 2 per process, range 1–4; excess returns 429. Size host concurrency separately. |

DEV uses local files. PREVIEW and PRODUCTION require separate private buckets,
namespaces and credentials. Never copy production credentials into preview. Build
and runtime need the same media origin because Next builds CSP headers. Only that
origin is added to img-src; image optimization uses stored variants, no remotePatterns.
See [MEDIA-ARCHITECTURE.md](MEDIA-ARCHITECTURE.md) for policy, signed URL/cache limits,
permissions, migration/cleanup and outstanding live certification. No real values
were inspected or used in M12.

## M13 strict deployment isolation

[STAGING-RUNBOOK.md](STAGING-RUNBOOK.md) defines the current LOCAL/PREVIEW/PRODUCTION
contract, variable ownership and complete setup/recovery commands. New values are
server-only and empty in `.env.example`: STAGING_ORIGIN, DATABASE_RESOURCE_ENVIRONMENT,
DATABASE_EXPECTED_HOST, DATABASE_EXPECTED_NAME, STAGING_MIGRATION_DATABASE_URL,
AI_RESOURCE_ENVIRONMENT, MAIL_RESOURCE_ENVIRONMENT, MAIL_ALLOWED_RECIPIENTS,
WALLET_RESOURCE_ENVIRONMENT, MEDIA_UPLOADS_ENABLED, TRANSFERS_ENABLED, PROMOTIONS_ENABLED.

APP_ENVIRONMENT must agree with VERCEL_ENV. Hosted database aliases must be identical
and endpoint/name/stage explicitly bound, with certificate-verifying TLS. Preview
requires a dedicated named staging DB and matching HTTPS application/auth/callback
origin. Production rejects obvious fixture/development secret patterns; format checks
do not replace secure random generation and account verification. Opaque provider
resource labels are explicit operator attestations, not automatic proof of isolation.
Nonproduction Resend requires at most 20 exact controlled recipients; no wildcard.

Write switches are deny controls only: `false` stops new transfers, new promotion
reservations/quotes or media uploads respectively; existing authorization still applies.
No hosted account/environment was inspected for secret values or enabled by M13.

`MAIL_MAX_ATTEMPTS` is a technical worker retry cap, default 10 and accepted range 1-20.
Exhaustion moves the job to REVIEW; it is not a legal retention period or permission to
reset idempotency keys. Invalid numeric configuration uses the conservative default.
