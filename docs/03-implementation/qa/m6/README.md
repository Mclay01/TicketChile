# M6 browser evidence

Local Chrome, synthetic loopback PostgreSQL fixtures, 2026-09-18. No real organizer, buyer, provider, mail delivery or production data appears here. Existing fixture art can contain unrelated text/prices; the canonical event fields beside it are the test database values.

`responsive-report.json` records **100** screen/viewport combinations at 390, 430, 768, 1024 and 1440: dashboard, event list, creation, every Event Center section and all five editor sections. Checks assert a page heading, labeled fields, no broken images and no horizontal overflow. Desktop/mobile captures cover dashboard/list/editor/tiers/preview/attendees/staff/access. Final preview copy identifies the disabled inventory state instead of implying an ongoing fetch.

`state-report.json` records browser actions against the real local application: manual creation/autosave, concurrent-tab revision rejection, editable local proposal review with selected-field acceptance, binary image upload, checklist/review/explicit publication, event-scoped invitation queue and real buyer credentials login as door staff. The staff session sees one assigned event and no finance/editing navigation; direct foreign reads and edits are denied. Conflict and staff screenshots are included.

The owner QA session is provisioned through the real persisted M3 session service with a synthetic MFA-ready fixture. This is not a browser MFA-login certification; existing PostgreSQL tests cover privileged MFA/login. The buyer staff login uses the actual credentials UI. No production authentication bypass is added to the app. The local proposal parser is visibly identified as rules, not a model.

Reproduce from `apps/web`:

1. `node scripts/local-db.mjs start`
2. `node scripts/m6-preview.mjs` — creates a new test database and starts inert loopback preview on port 3005; secrets are not printed. Local fixture session metadata stays ignored under `.local`.
3. Start isolated headless Chrome with loopback debugging on 9335 and a dedicated `.local/m6-chrome` profile.
4. `node scripts/m6-visual-qa.mjs`
5. `node scripts/m6-state-qa.mjs`
6. Stop that preview, close only the isolated Chrome instance, then `node scripts/local-db.mjs stop`.

No physical-device, Safari/Firefox, camera, screen-reader, formal WCAG, performance/load or merchant/provider end-to-end certification is claimed. Global/public visual evidence remains in M5; no approved HTML reference was modified.
