# M14 evidence

Started from clean M13 `ab2ac4e3605b7422927173c7126f3a530a8799f4` on
`astra/ticketchile-v2`. M1-M13 preserved. Only synthetic loopback PostgreSQL, isolated
Chrome and injected provider transports were exercised. No external certification,
production access, real payment/email/model/storage/Wallet call, merge, push or deploy.

## Why local gates ran again

M13's 401 tests,188 browser states, managed-independent local58-table restore and
bounded load are retained in [../m13](../m13/README.md); restore/load scripts were not
rerun merely to regenerate evidence. M14 found vulnerable dependencies and updated
Next/Auth.js/Sharp and compatible transitive packages. This changes runtime behavior,
so fresh full regression, compilation and browser acceptance are necessary.

| Check | M14 result |
|---|---|
| Dependency audit before | Exit1;115 findings (3 critical/56 high/50 moderate/6 low) |
| Dependency audit after final pins | Exit1;1 moderate UUID advisory, no high/critical/low; inspected affected buffer path unused in Svix v4 call |
| Full tests, PostgreSQL integration/concurrency, provider contracts | PASS401, zero failures/skips, final source and pinned graph;105282ms |
| Migrations | Fresh/legacy/checksum/concurrency tests through0001-0011; applied SQL unchanged; no remote migration |
| TypeScript | PASS `tsc --noEmit --incremental false` |
| Scoped/whole lint | PASS3 changed maintained files /373 maintained repository files (including API/shared types), zero errors/warnings |
| Production build | PASS Next16.3.6 Turbopack, build `iA6L-YitZgj97sxIuXbCZ`; scrubbed env/inert loopback port1 database, no provider secrets |
| Browser/E2E | PASS188 states:104 cross-role,46 transfers,38 media, widths390/1440,16 screenshots; Chrome153.0.8010.54; external provider calls0; viewport emulation only |
| Hosted smoke / physical / managed restore | BLOCKED EXTERNAL; no target/account/device supplied |

Raw local logs are ignored under `apps/web/.local/m14-*`. Committed
`dependency-audit.json` retains sanitized advisory metadata, ranges and URLs from
the actual registry response; public audit text was reduced to relevant fields.
`DEPENDENCY-SECURITY.md` records context, sources and remaining exposure. Audit
devDependency counts are not a reliable runtime classification.

Final build/source/package/lockfile hashes are in [source-manifest.json](source-manifest.json).
Completed browser reports: [cross-role](cross-role/browser-report.json),
[transfers](transfers/browser-report.json), [media](media/browser-report.json).
Cross-role and media use local Next development; transfer/Wallet uses the actual
compiled production artifact with synthetic local configuration. All three completed.
Final full tests, TypeScript, whole/scoped lint and production build exit0. The only
remaining nonzero gate is the documented moderate dependency audit finding. Root
`git diff --check` passes. Preview and isolated Chrome were stopped; local synthetic
PostgreSQL data remains for inspection. No production service was stopped or changed.

## Failures and limits

- Sandbox initially denied creation of the audit log; rerun with authorized local
  execution succeeded. No automatic approval rejection occurred. `pnpm view` was
  unavailable in this installed CLI; public `npm view` metadata worked.
- Initial updated lint produced two warnings for internal `window.location` calls.
  They were changed to Next router navigation (checkout confirmation and simulator
  claim); no unrelated UI redesign. External provider redirects still use browser
  navigation/form POST.
- Initial cold browser login attempt navigated without an authenticated session.
  Synthetic direct login succeeded. Harness now waits for hydrated input props and
  an actual authenticated session. A first overly strict wait required onChange on
  uncontrolled inputs and timed out; corrected to support their normal FormData use.
  No server authorization or credential checks were relaxed.
- Synthetic scanner initially reached camera-ready without decoding. A separate
  moving-frame canvas probe decoded/admitted a synthetic ticket. The harness now
  clears/redraws the QR with two-pixel motion instead of changing only a tiny corner,
  preventing repeated near-identical synthetic frames. This is not physical evidence.
- Browser fixtures may emit development image-position/smooth-scroll notices and
  a hydration warning when the existing screenshot helper forces lazy images eager.
  These diagnostics do not certify physical accessibility or hosted behavior.
- Account transfer-history dates also exposed Node/Chrome `es-CL` spacing differences
  (`p. m.` versus a nonbreaking space), a retained display hydration warning. No
  date-format cleanup or unrelated UI redesign is claimed by M14.
- Next16.3.6 `next dev` generated apps/web AGENTS.md and its CLAUDE.md reference;
  retain these tool-generated guidance files with the upgrade to avoid recurring
  untracked changes. Its local useRouter guide was reviewed for the navigation fixes.
- Local fake paid evidence is inserted only by the isolated Node service harness,
  never a public callback/production mutation. Wallet uses generated local RSA.
  Media uses a local object store. No provider sandbox or camera hardware is implied.
- Existing M13 local capacity: max5 concurrent operations,20 purchases/check-ins,
  10 promotion uses; p95 for catalog/hold/finalization/check-in/attendee/admin reads
  89/123/87/58/25/6ms. Same Windows workstation, disposable PostgreSQL18.1;
  no managed-resource budget, production throughput or CDN claim. See original report
  for counts/durations. Search-specific capacity remains unmeasured.

Actual hosted outcomes and human actions are recorded in [M14-CERTIFICATION](../../M14-CERTIFICATION.md),
[STAGING-ACCEPTANCE](../../STAGING-ACCEPTANCE.md), [PHYSICAL-DEVICE-QA](../../PHYSICAL-DEVICE-QA.md)
and [BUSINESS-SIGNOFF](../../BUSINESS-SIGNOFF.md). None of these blocked rows becomes
PASS from local tests. The independent manual security scope is prepared, not executed.
