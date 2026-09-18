# TicketChile 1D implementation — M5

## Reference and audit

Priority: approved `00-TicketChile-1D-FINAL.html`, then public Fase 1A, public Fase 1B, then organizer 2A shell language. Read the actual JSON `__bundler/template` markup in the three bundled files. The approved files are unchanged. Temporary decoded frames stayed under ignored `.local/m5-design`; no artifact runtime or inline prototype implementation entered the application.

The audit found fixture-backed Home data, N+1/unbounded catalog queries, three public API readers exposing unpublished events, generic rounded/glass public layouts, placeholder-only auth labels, missing account/history/detail pages, and base64 organizer uploads. M5 replaces those paths while retaining M1–M4 authority and financial services.

## Tokens and components

`apps/web/src/app/globals.css` defines the small token system and responsive component styles. Tailwind 4 scans only `src`, avoiding design artifacts, binary fonts and generated build files. The `.tc` scope separates public layout rules from legacy organizer/admin layouts; shared root typography/colors apply consistently.

| Token | Value / use |
| --- | --- |
| Background / surfaces | `#0A0B0C`, `#101215`, `#15181C`; fields `#0E1013` |
| Text / muted | `#E9EAE7`, `#A8ADB1` |
| Accent | `#D8342C`; focus/light accent `#E9615A` |
| Status | Muted green `#9DB8A5`, warning `#D5AC70`; always accompanied by text |
| Borders / radius | Fine white at 12% opacity; 4px default; restrained perforation only on tickets |
| Spacing | 4 / 8 / 12 / 16 / 24 / 32 / 48px |
| Container | 1280px maximum; 40px desktop and 20px mobile side margins |
| Type | Manrope primary; IBM Plex Mono for dates, prices, folios and short metadata |
| Motion | 160ms feedback, small image hover; reduced-motion disables animation/transitions |

Fonts are local Latin WOFF2 files extracted from the supplied approved reference, with upstream OFL notices in `public/fonts`. No runtime Google Fonts request. Manrope uses the same variable font file across approved weights; mono has 400/500/600 subsets. Root metadata no longer calls the product a demo.

`components/tc` provides Button variants, labeled fields/hints/errors, Notice, EmptyState, page headings, status indicators, a native modal dialog, quantity stepper, responsive media, price/event metadata, EventCard/EventHero, ticket stubs, account navigation, auth shell and footer. Native input/select/textarea/details and navigation links serve controls and URL-backed tabs. CSS skeleton/spinner/focus/divider/perforation styles are reusable. Unused dropdown/switch/popover wrappers were deliberately not added.

Public shell: desktop discovery/search/account/organizer access, mobile native dialog navigation with focus containment/Escape, skip link, semantic main and footer. Breakpoints at 480/800/1100px adapt filters, two-column mobile event cards, account navigation and ticket/list layouts. No overflow masking on the public container.

## Data and state

- Home uses current published PostgreSQL events; the nearest event is the hero. Eight real events form discovery, with real configured categories/cities and counts. Empty/DB-failure states remain honest.
- `events.server.ts` serves Home, catalog, category/detail and all three compatibility event API routes. Search values are bounded, SQL parameters bound, LIKE metacharacters escaped, sort allowlisted, and results limited to 12 with pagination. Ticket types aggregate in SQL instead of N+1 queries. Public readers never expose unpublished events.
- `0005_discovery_media.sql` configures seven categories. Existing events remain uncategorized until a deliberate editorial assignment; the migration does not infer categories. Category editing belongs to later organizer lifecycle work.
- Event details use real organizer metadata, venue, description, persisted tiers/prices and Chile-local time. The stepper reads M4 availability, fails closed on read error, honors per-tier and ten-ticket limits, and navigates with IDs/quantities only. M4 still determines final prices, holds and provider availability.
- `account.server.ts` derives ownership from the live M3 buyer session. Upcoming/past/cancelled tickets, ticket detail, profile and order history are bounded SQL queries. Ticket ownership takes precedence over original buyer/order ownership. Order history separately scopes orders and payment summaries; it never returns provider references or original purchaser PII.
- Ticket detail uses the existing owner-authorized QR URL in the browser, never a public server-to-server QR fetch. VALID state controls rendering; the endpoint rechecks ownership/state. Wallet appears only with required server configuration. Resend uses the existing 202 queue service and does not claim mail delivery. Transfer is explicitly unavailable.
- Sign-in/sign-up/recovery/reset call M3 services. Google appears only when configured. Profile exposes current account data with existing security/logout actions; profile editing is explicitly pending.
- FAQ/contact/legal/simulator have real navigation and honest states. `SUPPORT_EMAIL` enables a validated mailto contact address; otherwise contact clearly remains unavailable. No form pretends to send support messages. Legal text is marked provisional. AI generation is disabled pending M7 and does not send/store user input or fabricate output.

## Media boundary

`media-storage.server.ts` defines immutable `MediaStore.put/get`, with a local development adapter under `apps/web/.local/media`. Production currently fails closed with 503: there is no silent local-disk fallback or speculative cloud credential use. A production adapter must implement the same boundary before uploads are enabled. Sharp is now an explicit locked dependency.

`POST /api/media` accepts a raw raster body, not base64 JSON. It requires live `event.edit` scope for an event, or tenant-wide capability for a draft; an organizer owner may derive the tenant from their live session. Same-origin and persisted tenant quotas apply before body/storage work. Input is streamed to a 5MiB limit, decoded with a 24-million-pixel limit, limited to nonanimated PNG/JPEG/WebP, oriented, resized inside 2400px and re-encoded as WebP without EXIF/GPS. Filenames are server UUIDs; writes cannot overwrite or traverse directories. Metadata and audit commit together. A failed DB write may leave an unreachable local orphan; no automatic deletion is implemented.

The existing organizer image picker now uploads through this endpoint. New submissions accept only a media object belonging to that tenant; arbitrary URLs, foreign UUIDs and new base64 are rejected. Submission input is bounded and audited. This is a media integration change, not the M6 lifecycle/editor redesign.

`GET /api/media/:id` permits public access only when a published event actually references that object. Otherwise it requires live event/tenant scope. UUID knowledge is not authorization. Responses are private/no-store and raster-only; the local adapter remains unavailable in production.

`media.ts` allows known relative paths and the legacy raster compatibility format. Arbitrary remote URLs and SVG data URLs are rejected, with an explicit fallback. No broad Next remote-domain wildcard exists. Public legacy base64 fields are mapped to `/api/event-media/:id/:slot`; that reader checks publication, validates/normalizes the raster and returns bounded binary bytes. No base64 blob is serialized into new public event props. An unpublished legacy ticket image uses a placeholder while its owned ticket details remain accessible.

New images use Next Image responsive sizes, declared aspect ratios, lazy card loading, priority hero loading and mobile art direction. Authenticated media/QR bypass the public optimizer so cookies stay in the browser. See [MIGRATION-PLAN.md](MIGRATION-PLAN.md) for the manual legacy transition.

## Verification and remaining deviations

Browser evidence and reproducible commands: [qa/m5/README.md](qa/m5/README.md). The 390/430/768/1024/1440 matrix covers 18 page states. Captures use synthetic DB records and existing local event art; titles/dates printed inside fixture art are not real offers or canonical prices. Approved artwork and production catalog curation were not fabricated.

The design's fixed counts, carousel slides, commission examples, sector maps, transfer policy, corporate/legal copy and AI output are not production truth. Home uses chronological discovery, not a fictional featured/curation service. Account editing, safe transfer, live AI, approved legal/contact operations and production storage remain explicit gaps. The detailed M4 checkout/confirmation forms keep their existing behavior and inner layout inside the new shell; they were not rebuilt as a second payment flow. Organizer/admin/finance screens remain later milestone design work. No pixel-perfect or formal WCAG certification, mobile hardware, Safari/Firefox, provider/Wallet/email end-to-end, load benchmark or production readiness claim is made.
