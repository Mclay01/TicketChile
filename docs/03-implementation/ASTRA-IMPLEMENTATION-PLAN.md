# TicketChile — implementation plan

Baseline: 2026-09-18, branch `astra/ticketchile-v2`, commit `6104fd9`.
Execution state lives in [ASTRA-PROGRESS.md](ASTRA-PROGRESS.md). This is a multi-milestone implementation, not a production-readiness claim.

## Current state and verified audit differences

The working application is `apps/web`: Next 16.1.1, React 19, TypeScript, Tailwind 4, PostgreSQL via `pg`. Root package configuration is a `.bak`; `apps/api/src/main.ts` is empty, no worker exists, and shared types are unused. Keep the functioning application and stack.

The clean baseline still has the audit's cookie-only admin proxy, unguarded admin handlers, global organizer payment queries, demo scanner event lookup, public QR signing, public ticket lookup and overlapping payment finalizers. The payments page is outside the organizer panel layout, so it also needs its own server guard. Ticket resend additionally accepts an arbitrary ticket ID and adds the requesting session's email as a recipient: ownership must be checked before reading/sending. Contrary to one audit table, the checked-in SQL already includes `tickets.ticket_type_id`. Typecheck succeeds on this checkout; do not assume the audit's old type-generation errors persist. Lint/build are being measured independently. No production database or provider credentials have been inspected or exercised.

## Target state and architecture

One cohesive TicketChile application covering buyer discovery/purchase/tickets, organizer event operations, scoped staff access, administrative operations and contextual AI. Retain Next route groups and public URLs. Extract domain services incrementally into `src/lib`, with thin authenticated route handlers and typed runtime-validated inputs. Do not introduce a second frontend or an unnecessary ORM migration.

## Security risks and authorization model

Server guards validate persisted, unexpired admin/organizer sessions; NextAuth remains the buyer identity boundary initially. The proxy is navigation assistance, never the authorization authority. Authenticate every sensitive handler independently. Scope organizer queries through `organizer_events(organizer_id,event_id)`, including totals, filters, exports and check-in. Buyer ownership is derived from the authenticated identity and persisted ticket owner, never a supplied email. Preserve existing hashes/sessions until a separately tested migration.

Existing roles: buyer, approved organizer owner, admin. Add event-scoped door/manager/viewer permissions with staff persistence, then finance/support only for actual workflows. Admin MFA, recovery, rate limits and audit logging are required follow-up work; a valid admin session alone does not finish the PRD's security requirements.

## Data strategy and migration approach

See [MIGRATION-PLAN.md](MIGRATION-PLAN.md). Reconcile runtime SQL and an explicitly local schema snapshot before versioned additive migrations. Preserve holds, row locks, server pricing, unique order-per-hold and webhook idempotency. No remote migrations, credential rotations or production data writes. Unknown owners are denied access, never assigned automatically.

## Design system strategy

Only the four files in `docs/02-design/approved/` define visual intent, with `00-TicketChile-1D-FINAL.html` taking priority. The earlier design prompt's request to stop at concepts is historical and superseded by the implementation request. Extract Manrope, selective IBM Plex Mono, near-black/graphite/warm text, red `#D8342C`, fine borders and restrained ticket details into reusable tokens and components. Prototype metrics/fees/legal content are examples, not policies. Inspect the bundled HTML templates, not their loading thumbnails.

## Public web migration

Replace hardcoded discovery with published database events while preserving slugs and routes. Deliver catalog/search/categories, event detail, ticket selection, checkout, confirmation, account/history/tickets, recovery and help/legal states. Reuse correct transactional behavior. Build keyboard-accessible navigation and forms at 390/430/768/1024/1440 widths. Only show configured payment methods.

## Organizer migration

Implement the approved organizer shell, dashboard and event list. Extend the same system to manual/AI creation, drafts/autosave, multi-tier tickets, preview, lifecycle validation, Event Center, editor, sales, attendees, promotions, staff, access, analytics and settings. Restrict changes affecting sold tickets. Display real metrics only.

## Admin migration

First close existing authorization gaps without changing working URLs. Then add denser 1D operational views for organizer verification, moderation, users, orders/payments/refunds, configurable commissions, settlements, support and audit. Sensitive mutations require explicit actor authority and audit records.

## Payment strategy

Inventory the actual configured integrations without exposing keys. Consolidate Flow and ticket finalization behind services with provider adapters. Preserve signed callbacks, provider-side verification, amount/currency checks, transaction locks and idempotency. No simulated success, payments or payouts during development. Fees, tax treatment, refund windows and settlement calendars remain configurable/pending business approval.

## Scanner strategy

Resolve real database events with owner/staff authorization; verify signed QR, event and ticket state; atomically transition VALID to USED with actor metadata. Show duplicate, invalid, cancelled, wrong-event, forbidden and network states. Keep camera/permission/manual fallback controls usable on mobile. No offline guarantee until a secure synchronization model exists. Legacy routes must receive the same authorization while clients migrate.

## AI strategy

Structured validated editable proposals, explicit missing fields, draft continuity across registration, preview and contextual actions. Scope analytics to authorized real data; distinguish fact/inference/recommendation. Never publish, change confirmed prices/capacity, activate promotions, send communications or move money without authorized user confirmation. Implement an unavailable-provider state and explicit local adapter if credentials are absent; never claim a mock is a real model response.

## Test strategy and verification criteria

See [QA-CHECKLIST.md](QA-CHECKLIST.md). Start with real handler/service executions using isolated session/database doubles for authorization boundaries; add disposable PostgreSQL integration tests for concurrency, migrations and financial invariants. Tests must never inherit `.env.local` credentials. Typecheck, scoped lint, tests and production build gate each milestone; record pre-existing whole-repo lint failures honestly. Add browser/mobile/accessibility checks when visual work starts. Provider sandbox end-to-end tests remain distinct from local adapter tests.

## Rollback strategy

Use coherent forward commits on the existing branch. Revert an application milestone only in an isolated environment; do not restore a known authorization bypass in a live deployment. Additive migrations require backward-compatible readers and documented backfill; never auto-drop data on rollback. No deployment or remote financial changes in this task.

## Phase order

| Milestone | Scope | Completion evidence |
| --- | --- | --- |
| M0 | Repository/documentation comparison, execution docs and baseline checks | Persisted findings and command results |
| M1 | Admin authorization and organizer financial isolation; highest-risk ticket access fixes | Denied requests never reach domain reads/writes; owner scope tests |
| M2 | Remaining ticket/QR/wallet/scanner/export/demo boundaries | Ownership and cross-event tests; real event scanner |
| M3 | Versioned local schema, identity/RBAC, recovery, rate limits, MFA and audit | Local migrations plus authorization/recovery integration tests |
| M4 | Payment/hold/finalization consolidation, provider availability and email | Idempotency, expiry, amount and issuance tests |
| M5 | 1D primitives/shells, media boundary, public discovery and account | Responsive visual QA and real data |
| M6 | Organizer event lifecycle, multi-tier editor and Event Center | Create/edit/preview/publish and tenant tests |
| M7 | Public AI simulator and organizer contextual AI | Validated proposals, preserved drafts, confirmed sensitive changes |
| M8 | Staff, attendees, promotions, complimentary tickets and operational scanner | Least privilege, inventory/audit and concurrent check-in tests |
| M9 | Admin operations, finance/refunds/settlements and support | Authorized audited operations; no invented business policies |
| M10 | Complete states, accessibility, performance, cleanup and release documentation | Full gates and responsive end-to-end acceptance matrix |

M1/M2 are security containment milestones, not a claim that the platform is production-ready. Continue unfinished milestones using the progress document rather than redoing M0.
