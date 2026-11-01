# Protected Preview execution — 2026-11-01

**Result: PASS for the initial isolated Preview. Production remains BLOCKED.**
This is terminal/CLI/API evidence, not browser or physical-device certification.
Structured evidence: [report.json](report.json).

## Deployment and resource binding

| Item | Verified result |
|---|---|
| Branch/application source | `astra/ticketchile-v2` / `dca08b38abe89b690918464f5d88061aa7b14482`; application code unchanged |
| Vercel | Authenticated account `hectorarancibiasr2000-6878`, team `mcflay`, project `ticket-chile-api` / `prj_CWMHrsXQBjy75PHQVz1NUrGHSXvQ` |
| Project settings | Next.js; `apps/web`; `pnpm install`; `pnpm run build`; Node24.x; Production Branch `main` unchanged |
| Deployment | READY `dpl_3UzqaMAWJw5QFcRWyqyucjSoRkpy`; ready 2026-11-01T04:35:46.979Z |
| Stable Preview | [Protected branch Preview](https://ticket-chile-api-git-astra-ticketchile-v2-mcflay.vercel.app) |
| Immutable Preview | [Verified deployment](https://ticket-chile-lbtnohhe8-mcflay.vercel.app) |
| Neon | `ticketchile-preview`, project `tiny-term-61980927`, store `store_cSHfHsKq9xCijUtJ` retained |
| Database/schema | `ticketchile_preview_app` / `public`; initially zero application tables |
| Runtime | `ticketchile_preview_runtime`, pooled endpoint, explicit TLS with verified certificate |

Access remains limited by Vercel SSO. A fresh anonymous request returns302 to Vercel.
The user renewed expired CLI authentication interactively. No browser was automated.

## Configuration and actual failure diagnosis

Source inspection confirmed URL precedence: TICKETCHILE_DB_POSTGRES_URL,
TICKETCHILE_DB_POSTGRES_URL_NON_POOLING, POSTGRES_URL, POSTGRES_URL_NON_POOLING,
POSTGRES_PRISMA_URL, DATABASE_URL. Hosted candidates must all be exactly identical.

The initial fixed-config deployment still failed while collecting `/organizador/logout`.
Two deliberately failing, build-only diagnostics proved that origin/security checks
passed but integration-supplied URL paths were still `/neondb`. The integration build
action superseded the manual branch overrides. No credential values were logged.

Only the dedicated staging store connection `spc_UJfHhn1Q10QSXjKA` to this project's
Preview environment was detached. The Neon resource and database were retained.
Production's separate connection was not changed. Manual `NEON_PROJECT_ID` retains
resource identity. Reconnecting the default integration would risk reintroducing the
wrong database and owner credentials; first prove safe build/runtime bindings.

The six retained DATABASE/POSTGRES URL compatibility aliases now have exactly one
restricted pooled connection. Even aliases named UNPOOLED/NON_POOLING/NO_SSL carry
that same safe runtime value. PG/POSTGRES host/user/password/database aliases match.
The two TICKETCHILE_DB URL aliases are absent. No operator URI is in web configuration.

Runtime guards: resource environment `preview`, expected name `ticketchile_preview_app`,
expected host `ep-frosty-poetry-b8gmprqf-pooler.c-14.us-east-1.aws.neon.tech` (no port),
SSL and certificate verification both `true`, pool maximum5. APP_BASE_URL/NEXTAUTH_URL/
STAGING_ORIGIN are the identical stable Preview origin. Runtime URIs have no query
parameters; no validator was changed to accept channel_binding/connect_timeout.

The integration's database variables were briefly made encrypted/readable for the
authorized local operator pull, then restored to sensitive before detachment. The
three branch identity/encryption/QR secrets remained sensitive, unread and unchanged;
their IDs/types/update timestamps match the initial metadata. Existing global security/
QR duplicates remain; the intended branch copies retain precedence.

## Database and synthetic data

The current guarded staging executor applied 0001–0011 to the existing empty app DB.
All eleven checksums match source. Verified58 tables,131 indexes,628 constraints and73
FKs; no invalid/not-ready index or unvalidated constraint. Critical identity, inventory,
payment, ticket/transfer, mail, AI, media, refund and settlement structures exist.

The runtime role has no superuser/createdb/createrole/replication/bypassrls or schema
creation, no ledger mutations, no audit UPDATE/DELETE and no TRUNCATE. It can perform
the application DML needed by registration, reads and rate limiting. This is a bounded
grant audit, not an independent security review or complete future-feature certification.

Node verified client TLS encryption and certificate authorization. Neon's backend
pg_stat_ssl reports false behind its TLS-terminating proxy; no TLS setting was weakened.

Before smoke: no buyers/events/orders/payments/tickets. After smoke: exactly one reserved
`.invalid` unverified synthetic buyer, one encrypted queued verification, zero organizers,
admins/events/orders/payments/tickets/persisted sessions and zero mail jobs. No production
records were imported. No external message was delivered or provider called.

## HTTPS smoke

22 checks passed using a temporary shareable token scoped **only to the stable Preview
alias**, never a project-wide automation bypass. The token was revoked after tests.

- HTTP200: `/`, `/eventos`, empty `/api/events`, `/signin`, `/signup`, organizer login/
  registration pages, `/api/health` alive=true, `/api/ready` ready=true, auth session/CSRF.
- Buyer signup HTTP200 queued verification; foreign-origin signup HTTP403; unverified
  buyer and unknown organizer credentials HTTP401. No authenticated session was created.
- Anonymous tickets/QR HTTP401; organizer/admin redirect to their Preview login pages.
  `/cuenta` uses Next's HTTP200 streaming meta-redirect to Preview `/signin`.
- Observed auth cookies are Secure/HttpOnly/SameSite=Lax/host-only. CSP is present;
  full cookie/session/MFA/CSP/provider-browser acceptance remains unexecuted.
- Payment availability reports Stripe/Webpay/Flow/Fintoc/manual transfer unavailable.
  All explicit provider/refund/mail/AI/media/write/transfer/promotion kill switches stay
  disabled. Provider and Wallet credentials are absent from effective Preview metadata.
- Response checks found no runtime/operator DB credentials, private-key blocks,
  PostgreSQL credential URIs or live Stripe credential patterns. This is a bounded
  scan, not comprehensive secret-leak or penetration certification.

## Quality gates

| Gate | Result |
|---|---|
| Full Node tests, including PostgreSQL integration/concurrency/migrations | PASS401, zero failures/skips |
| TypeScript, no incremental cache | PASS |
| Whole repository lint | PASS373 maintained files, zero errors/warnings |
| Isolated production build | PASS Next16.3.6 |
| Hosted production-mode build | PASS Next16.3.6,28 static pages,45s build output |
| Git whitespace | PASS |

The first test attempt ran while the retained synthetic cluster was recovering from
an old unclean shutdown and failed to connect. After PostgreSQL became ready, the
complete401-test rerun passed. Early smoke-harness expectations were corrected for
Next streaming redirects; application authorization was not changed. No application,
dependency, migration or approved design source was edited in this execution.

## Remaining gates

No event was seeded, so event-detail rendering with synthetic content is not certified.
Verified-account login/MFA, complete buyer/organizer/admin/scanner workflows, enabled
provider sandbox/callback/delivery/AI/S3/Wallet certification, private workers/schedules/
alerts, managed backup/restore/hosted rollback, physical devices/accessibility/capacity,
independent security review and business/legal/retention approvals remain open. The
previous moderate dependency advisory was not re-audited by this deployment task.

Production environment metadata is unchanged, main stays the Production Branch, and
no production database, domain/DNS, storage, payment credential, customer email, refund,
payout, merge or production deployment was used or changed. No subsequent milestone
or production action follows automatically from this successful Preview.
