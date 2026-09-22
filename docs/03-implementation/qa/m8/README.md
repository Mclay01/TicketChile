# M8 local operational QA

All identities, tickets, QR signatures, orders and events are synthetic loopback fixtures. No production credentials/data, real mail or provider services were used. Approved design references were not overwritten.

## Reproduce

From `apps/web`, start `node scripts/local-db.mjs start`, then `node scripts/m8-preview.mjs`. The preview creates a new isolated PostgreSQL database and binds 127.0.0.1:3005 with merchant/mail credentials disabled. Use an isolated Chrome profile with loopback CDP port 9335; run `node scripts/m8-browser-qa.mjs` followed by `node scripts/m8-review-qa.mjs`. Each full run expects a fresh preview fixture. Stop only these local processes afterward.

## Results

- `responsive-report.json`: 80 checks, 16 operational states at each of 390/430/768/1024/1440. Includes staff list/invite form, attendee list/detail, promotion and courtesy forms, Access, assigned-event selector, camera idle/denied/absent, valid/used/invalid/wrong-event results, manual lookup and recent admissions. Horizontal overflow and native control labels checked. Representative captures at 390/1440.
- `review-report.json`: 18 follow-up checks at 390/430/1440. Courtesy success blocks accidental repeat and enables explicit new issuance; exact unknown lookup, server/network failure and online-only states; successful manual admission; inclusive UTC date filtering and attendee details. Updated detail captures include this final review.
- Actual local workflow: owner invitation from Staff UI, verified buyer acceptance with persisted session, assigned event list and foreign-event denial; courtesy form consumes inventory and queues delivery; promotion form creates an inactive code, confirmed API activation and buyer checkout UI shows a server quote of CLP 9,600 from CLP 12,000 at 20%; manager/support can view attendees but financial filtering/section access is denied.
- Camera QA supplies synthetic native-resolution QR frames via canvas MediaStream. Production ZXing QR decoding and real signed-token/check-in HTTP handlers run normally; no scanner authentication bypass is injected. Valid succeeds once, repeat reports used, invalid and signed wrong-event codes fail. Browser camera-denial/no-device and network/server errors are deliberate harness injections.
- Selected scanner/mobile detail and desktop promotion screenshots were visually inspected. Final regression: 313 tests, TypeScript, scoped lint (37 files), production build and diff whitespace checks pass.

## Limits

These results are desktop Chrome emulation, not physical cameras, Safari/Firefox, screen-reader/formal accessibility or peak-load certification. Camera lighting/focus/thermal behavior and real gate throughput still need authorized field rehearsal. No offline queue, check-in reversal, refunds or transfer/re-keying is simulated. Merchant certification, actual email delivery/worker operation and production storage/migration/grants remain separate release work. See [EVENT-OPERATIONS.md](../../EVENT-OPERATIONS.md).
