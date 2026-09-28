# M10 local evidence

All identities, orders, payments and financial records are synthetic. No real provider calls, delivery, transfers or production database operations occurred. Screenshots are separate from the four unchanged approved designs.

| Artifact | Meaning |
|---|---|
| `browser-report.json` | 260 responsive states at 390/430/768/1024/1440 and representative buyer, organizer, scanner and admin workflows |
| `auth-report.json` | 15 focused auth states; final single-main/registration-label/focus/password checks. The five registration rows in the main report are marked rechecked |
| `browser-performance.json` | Production build resource evidence: decoder absent before camera, loaded on activation; reduced motion and HTTP headers |
| `performance-report.json` | Before/after build-wide chunks, token contrast and immutable design hashes. Whole-build bytes increased; no overall reduction claimed |
| `query-report.json` | Actual EXPLAIN ANALYZE plans from 20 disposable events / 10,000 tickets; no production load claim |
| PNG files | Representative final public/account/AI/organizer/scanner/admin/auth layouts; full-page captures show fixed navigation at the capture viewport position |

Reproduction from `apps/web`, using installed dependencies and an isolated local PostgreSQL cluster:

```text
node scripts/local-db.mjs start
node --test --experimental-test-isolation=none tests/*.test.mjs
node scripts/verify-build.mjs
node scripts/m10-preview.mjs --production
```

The preview creates a new disposable loopback database and replaces inherited/file-backed environment values before launching Next on 127.0.0.1:3005. Its synthetic session fixture is stored only in ignored `.local/`. A production-mode local HTTP fixture intentionally does not satisfy HTTPS deployment readiness.

Start an isolated headless Chrome profile with loopback debugging port 9335, then run:

```text
node scripts/m10-browser-qa.mjs
node scripts/m10-browser-performance.mjs
node scripts/m10-auth-qa.mjs
node scripts/m10-query-rehearsal.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/lint-changed.mjs
node scripts/lint-all.mjs
```

Use a **fresh preview fixture** before rerunning the mutating workflow suite: it deliberately checks in tickets, publishes/moderates events and records synthetic refunds/settlements. It never resets production records. Payment/refund evidence is injected into real services from the isolated Node harness; no HTTP test backdoor exists. Hosted merchant checkout, actual email/OAuth/Wallet/device behavior and staging load/security/accessibility certification remain external gates.

Final checks: 336 tests, zero failures/skips; TypeScript/build/scoped lint/whole lint/diff checks pass. Whole lint covers 338 maintained JS/TS files with zero errors/warnings. A fresh isolated development-server smoke check also returned HTTP 200 after normalizing the configuration root path.
