# M7 browser evidence

Synthetic local preview; no deployment or real provider, mail, merchant, Wallet or production database calls. `scripts/m7-preview.mjs` creates a disposable loopback PostgreSQL database, scrubs application/inherited credentials, enables only the visibly labeled deterministic development provider and binds Next to `127.0.0.1:3005`. Owner authentication uses an isolated persisted MFA-ready fixture, not a new authentication bypass. Chrome uses a separate headless profile and loopback CDP port 9335.

`node scripts/m7-browser-qa.mjs`: **62 passed screen/viewport combinations**. At each width **390, 430, 768, 1024, 1440**:

- Public empty, real in-flight generation, editable proposal, shared desktop preview, shared 390-width preview, saved/account handoff and recoverable error.
- Organizer creation, current/proposed review, sensitive confirmation blocking apply, field rewrite and scoped analytics.
- An edited title accepted through the real organizer proposal UI and verified through its authorized API, with keyboard focus and reduced-motion emulation.
- Then a real authenticated browser claim of the edited anonymous draft into the private organizer editor; title preservation verified.

Every state asserts a page heading, labeled form controls and no document horizontal overflow. Screenshots are captured at 390/1440, plus the claimed draft at 390. Selected public proposal, analytics, review and confirmation screenshots were visually inspected. Mobile diff stacks current/proposed columns. Status announcements and focus movement to review headings are implemented; native labels/buttons/checkboxes are keyboard operable and existing reduced-motion rules remain.

To capture the transient generating state, the QA script delays delivery of the real HTTP response in the browser. To capture recovery at each width, it substitutes one browser-side 503 response. These are explicit QA harness behaviors, absent from production code. Server provider failure/timeout/schema rejection is separately exercised by automated tests, with unchanged draft assertions. Production has no fake generation timer or hardcoded model response.

`responsive-report.json` contains all 62 results. Full regression and production build results are recorded in [ASTRA-PROGRESS](../../ASTRA-PROGRESS.md). This is local Chrome coverage, not real AI quality certification, Safari/Firefox, physical device, screen-reader, formal WCAG or distributed load certification. No actual account signup mail/approval or provider sandbox flow was executed; their M3 authorization remains tested and unchanged.
