# M12 local media verification

Evidence is from synthetic loopback PostgreSQL, local media and isolated Chrome.
No real storage, merchant, email or Wallet service was contacted. Browser QA uses
the development adapter; the production build and S3 adapter contract are checked
separately. No production/CDN/LCP certification is implied.

`browser-report.json` records 19 states at each of 390/430/768/1024/1440: create
media, poster/desktop/mobile upload, malformed-file failure/retry, replacement,
offline replacement/retry success, revision conflict/recovery, optional removal,
private preview, admin draft review, publication review/publish, public hero,
catalog and missing-image fallback. There are 38 screenshots (390 and 1440).
The harness asserts labels, one main landmark, no horizontal overflow and nonzero
image geometry; it preserves native lazy loading and checks catalog image attributes.
Admin review removes the organizer cookie to exercise the independent admin guard.
Every test tenant's upload rate window is expired between viewport sessions in the
disposable DB; production limits are unchanged and separately regression tested.

Visual inspection caught a real inherited zero-height inner preview container:
loaded organizer/admin images were invisible. `org-media > .media` now fills its
stable wrapper and the browser assertions cover dimensions. Additional corrections
were confined to fixtures/harness: two distinct animation frames, explicit organizer
MFA, waiting for refreshed lifecycle controls, required legacy fixture fields and
selecting the missing mobile source when testing mobile fallback. No guard was weakened.

`image-performance.json` measures one 12MP JPEG derived from repository photography:
1,536,111 input bytes; 763 ms local processing; sampled RSS 116,461,568 → 176,140,288
bytes (59,678,720 delta). Outputs: hero 284,496 bytes at 2400×1800, card 94,270 at
960×720, thumb 21,678 at 320×240. This is one sample, not a hosting memory guarantee
or sustained concurrency test. The browser report records actual selected variant,
resource bytes/timing and LCP element observations. Mobile selects card; desktop
selects hero; only actual hero images are eager/high priority.

Regression suite: 388 passing tests, including 28 new media/storage/migration cases.
After the final reference-bookkeeping cleanup, the 36 media-lifecycle/M6 organizer
tests were rerun successfully. Tests cover auth/tenant/event/purpose/MFA scope,
decode/MIME/size/animation/metadata, disabled/local/S3 contracts, stage/CSP isolation,
idempotency/concurrency, storage and DB failure recovery, tombstone/reference-safe
cleanup/backoff, retained events, actual-byte migration verification, dry run/resume,
conflicts, legacy compatibility and populated-M11 upgrade preservation. Existing
M1–M11 scanner/QR/transfer/payment/mail/finance regressions remain green.

Commands from `apps/web`:

```
node --test --experimental-test-isolation=none --test-reporter=spec tests/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/lint-changed.mjs
node scripts/lint-all.mjs
node scripts/verify-build.mjs
node scripts/m12-preview.mjs
node scripts/m12-browser-qa.mjs
node scripts/m12-media-performance.mjs
```

The guarded `media-local.mjs` dry-run/checkpoint and cleanup commands were also
smoke-tested on the disposable browser database; zero eligible legacy/deletion
records were present. Substantive adoption/recovery/deletion cases use actual
PostgreSQL tests with injected storage. Root `git diff --check` is the final gate.
