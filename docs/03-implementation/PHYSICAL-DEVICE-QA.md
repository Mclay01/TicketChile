# Physical-device acceptance

Date: 2026-09-28. **No physical device has been available to this agent or identified
by the user. No physical test has run.** M13 Chrome emulation/canvas QR decoding is
browser evidence only. No camera, screen-reader, Wallet or mobile certification claim.

| Requested device | Actual model | OS/version | Browser/version | Screen/zoom | Camera | Result |
|---|---|---|---|---|---|---|
| Phone A (prefer iPhone Safari) | Not supplied | Not supplied | Not supplied | Not measured | Not tested | BLOCKED EXTERNAL |
| Phone B (prefer Android Chrome) | Not supplied | Not supplied | Not supplied | Not measured | Not tested | BLOCKED EXTERNAL |
| Desktop keyboard / available screen reader | Not supplied | Not supplied | Not supplied | Not measured | N/A | NOT TESTED in M14 physical QA |

Use devices actually available; two phones are preferred, not fabricated. A displays
synthetic buyer QR; B logs in as a server-authorized assigned door user over real Preview
HTTPS. Repeat roles if available. Record commit/build/host/time/operator, models above,
brightness, viewport, orientation, focus distance and network. Store sanitized results;
never screenshot live QR credentials or identity/session/transfer tokens into public QA.

## Pending scanner execution sheet

All rows below **NOT TESTED**, blocked by phones plus hosted staging.

| Case | Expected result |
|---|---|
| Assigned vs unassigned event | Only explicit assigned scope works; guessing event code/ID grants nothing |
| Valid QR | One authoritative check-in, correct synthetic ticket/result |
| Second scan | Duplicate result; no second admission |
| Wrong event | Denial without changing ticket |
| Cancelled ticket | Denial |
| Confirmed refunded ticket | Denial; pending/uncertain refund also blocks admission per policy |
| Old QR after transfer | Denial of prior credential generation |
| Recipient's new QR | Current generation accepted once |
| Manual lookup | Same event/capability scope, no foreign ticket disclosure |
| Recent admissions/stats | Same event/tenant scope and accurate counts |
| Temporary network loss | No offline success/admission; safe retry after restoration |
| Camera permission denied | Useful status/manual alternative, no accidental admission |
| Permission restored | Camera recovers and scans correctly |
| Rapid sequence | Bounded ten synthetic tickets, duplicates separated, no camera freeze |

Measure rapid-scan camera-ready latency, result latency and next-scan-ready latency
per scan with timestamps/stopwatch. Record sample count, median/max, failures and camera
stability. No timings currently exist. Test low/high brightness and realistic distance
without uncontrolled load or claims about untested event throughput.

## Wallet and accessibility execution sheet

Wallet: demo issuer/approved account save, display, current owner, transfer old/new
generations, refund/cancel scanner denial. Saved passes may persist; no remote deletion
is promised. **NOT TESTED**.

Accessibility: desktop keyboard navigation/focus return, mobile zoom/reflow, scanner
status announcements, checkout errors and financial confirmation dialogs. Use actual
VoiceOver/TalkBack or available screen reader, record version/steps/observed speech and
focus. **NOT TESTED** with real assistive technology. Local semantic/browser checks
are not WCAG or screen-reader certification. Log actual failures with reproducible steps
before marking any case PASS; leave unavailable cases blocked.
