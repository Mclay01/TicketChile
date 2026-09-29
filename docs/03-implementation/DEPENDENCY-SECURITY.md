# M14 dependency security review

Date: 2026-09-28. Scope: deployable `apps/web/package.json` and its pnpm lockfile.
Executed `corepack pnpm --ignore-workspace audit --json` against the public registry.
The initial audit exited1 with **115 findings: 3 critical,56 high,50 moderate,6 low**.
The final audit exits1 with **one moderate**, no high/critical/low. Exit1 is explicitly
retained as an open finding, not reported as a clean audit. Counts are registry advisory
entries (including version-specific duplicates), not independently proven exploits.
Sanitized exact titles/ranges/URLs: [audit evidence](qa/m14/dependency-audit.json).

## Changes and exploitability

| Component | Change / actual context |
|---|---|
| Next.js / eslint-config-next | 16.1.1 -> **16.3.6**, same major. App Router is used and local development is Windows; framework request/RSC/cache/Windows flaws warrant fixing even though authorization also lives in server services. No custom rewrite or next/og ImageResponse usage found. Choose16.3.6 instead of16.3.3 to include the newer OG fix; no application UI redesign |
| Auth.js | 4.24.13 -> **4.24.15**, same major. Application uses Credentials + one Google OAuth provider; no Auth.js email magic-link provider, direct getToken use or multi-OAuth linking found. Reported email/mix-up/getToken paths are not established as reachable here, but the compatible patch is appropriate defense in depth |
| Sharp | 0.34.5 -> **0.35.4**. Deliberate security update across a pre-1.0 minor, with Node>=20.9 supported by local22.15.1. Uploads are untrusted, and metadata parsing occurs before format rejection; JPEG/PNG/WebP allowlisting alone cannot prove decoder immunity. Native libvips/libheif fixes require this update; test normalization/variants/adoption and actual upload browser flows |
| PostCSS | 8.5.6 -> **8.5.28**, build pipeline processes repository CSS; no public CSS compiler endpoint. Patch transitive nanoid through compatible resolution |
| axios/follow-redirects/form-data | Pin1.20.0/1.16.0/4.0.6 on their existing majors. Webpay SDK outbound transport uses fixed integration/live endpoints; arbitrary user destination/header/proxy control was not found. Still patch response/redirect/resource handling and retain real sandbox certification requirement |
| qs | Pin6.16.0. Stripe SDK transitive serialization; no direct application qs request parser found. Compatible fix, no new transport or weakened callback checks |
| Build/lint graph | Major-scoped overrides for minimatch3/9, ajv6, flatted3, brace-expansion1/2, picomatch2/4, js-yaml4, Babel7, browserslist4, humanfs0.16. These process repository/configuration inputs, not public HTTP endpoints. All pins stay within the existing major (humanfs within0.16); review/remove when upstream ranges resolve patched versions naturally |

No blind `audit fix`, dependency major migration or provider API/model switch occurred.
Native decoder changes can alter normalized bytes; preserve immutable stored variants
and use a new idempotency key rather than overwriting old pending intent bytes. Hosted
recovery of pre-upgrade intents/adoptions remains part of media certification.
The first compatible transitive update did not refresh every locked indirect package;
explicit reviewed overrides were then installed and the audit rerun. pnpm's report
labels all dependencies non-dev; use actual package paths above for exposure, not that
field. Full regression/build/browser gates follow the final graph, not just the initial
upgrade. No applied SQL migration changed.

## Remaining advisory

**uuid10.0.0**, `resend6.8.0 -> svix1.84.1 -> uuid10.0.0`, moderate
[GHSA-w5hq-g745-h8pq](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq).
The advisory concerns v3/v5/v6 caller-supplied buffer bounds; patch requires>=11.1.1.
Installed Svix `dist/request.js` imports only **v4() without a buffer** for generated
idempotency keys. No application Svix/webhook-management calls or uuid imports found;
application IDs use Node crypto. Auth.js now has its own patched uuid11 dependency.
Therefore the reported buffer path is **not reachable in inspected usage**, an inference
from code inspection, not a penetration-test result or permanent waiver. Leave this
transitive major unchanged, track an upstream compatible Svix/Resend update, and reassess
before enabling new SDK features. Do not call the entire dependency graph vulnerability-free.

The root `pnpm-lock.yaml` is an orphan legacy transbank-only lock (no root package.json),
not the `apps/web` deployment lock. It retains older packages and was not silently rewritten.
Use `apps/web` with its reviewed lockfile for installation/deployment; re-audit any other
chosen build root. `packages/types` has no dependencies; no separate API package manifest
was present. Native OS/browser/PostgreSQL/Node and managed images need their own operator
patch inventory; npm audit does not certify them.

## Primary-source checks

Reviewed maintainer advisories and public registry release/engine metadata before
selecting versions: [Next.js advisories](https://github.com/vercel/next.js/security/advisories),
[Next.js16.3.6 OG fix](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j),
[Sharp libheif fix](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c),
[Auth.js provider binding](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-x445-f3h2-j279).
Registry audit/network failures are not evidence of safety. Rerun on the exact deployment
lockfile before release because advisory coverage and dependencies can change.
