# PROJECT-MAP — TicketChile.com

Mapa completo del repositorio. Complementa `AUDIT-TICKETCHILE.md`.

---

## 1. Vista de alto nivel

```
Repo (monorepo pnpm/turbo — NO OPERATIVO: sin package.json raíz)
│
├── apps/web        ← ÚNICA aplicación real (Next.js 16 App Router)
├── apps/api        ← vacío (src/main.ts sin contenido)
├── packages/types  ← @ticketchile/types, sin uso
└── tools/          ← make-admin-hash.js (script suelto)
```

Runtime real = `apps/web`, ejecutado con `next dev` / `next build` directamente dentro de `apps/web`.

---

## 2. Stack por capa

| Capa | Tecnología | Fichero(s) clave |
|---|---|---|
| Framework | Next.js 16.1.1 App Router + Turbopack | `apps/web/next.config.{ts,js}` |
| Runtime UI | React 19.2.3 + React Compiler | `babel-plugin-react-compiler` |
| Lenguaje | TypeScript 5.9 strict | `apps/web/tsconfig.json` |
| Estilos | Tailwind CSS v4 (`@theme` en CSS, sin config) | `apps/web/src/app/globals.css`, `postcss.config.mjs` |
| Middleware | Next 16 "proxy" | `apps/web/src/proxy.ts` |
| DB | PostgreSQL vía `pg` (Pool) | `apps/web/src/lib/db.ts`, `apps/web/sql/schema.sql` (obsoleto) |
| Auth compradores | NextAuth v4 (JWT, Google + Credentials) | `apps/web/src/auth.ts`, `app/api/auth/[...nextauth]` |
| Auth organizador | Propia (DB sessions, scrypt b64) | `lib/organizer-auth.pg.server.ts` |
| Auth admin | Propia (DB sessions, scrypt b64) | `lib/admin-auth.pg.server.ts` |
| Pagos | Stripe SDK, Transbank SDK, Flow (fetch ×3), Fintoc (off), transferencia | `lib/stripe.server.ts`, `lib/flow.ts`, `app/api/payments/*` |
| Email | Resend (HTML inline) | `lib/email.server.ts`, `lib/tickets.email.ts` |
| QR | `qrcode` + HMAC propio | `lib/qr-token.server.ts`, `app/api/qr`, `app/api/demo/qr` |
| Wallet | `jsonwebtoken` RS256 (solo Google) | `lib/google-wallet.server.ts`, `app/api/wallet/google/save-url` |
| Scanner | `@zxing/browser` + `@zxing/library` | `components/QRScanner.tsx` |
| Iconos | `lucide-react` | — |
| Primitivos UI | `@radix-ui/react-select` (único) | `components/ui/select.tsx` |
| "DB" demo legacy | fichero JSON | `lib/demo-db.server.ts`, `apps/web/.demo/db.json` |
| Storage cliente legacy | localStorage | `lib/storage.ts` |

---

## 3. Árbol de rutas (`apps/web/src/app`)

```
app/
├── layout.tsx                         ← root: <html lang=es>, <body text-white>, <Providers>
├── providers.tsx                      ← <SessionProvider refetchInterval={0}>
├── globals.css                        ← tokens + Tailwind v4 @theme + @import Outfit
├── favicon.ico
│
├── (public)/
│   ├── layout.tsx                     ← SiteHeader + <main max-w-6xl> + footer inline
│   ├── page.tsx                       ← HOME (usa EVENTS hardcodeado)
│   ├── eventos/
│   │   ├── page.tsx                   ← listado (DB, listEventsDb)
│   │   └── [slug]/
│   │       ├── page.tsx               ← detalle (DB, getEventBySlugDb)
│   │       └── QuickBuyClient.tsx     ← [HUÉRFANO] selector de tickets alternativo
│   ├── checkout/
│   │   ├── [eventId]/
│   │   │   ├── page.tsx               ← (DB) → CheckoutBuyerForm
│   │   │   └── CheckoutClient.tsx     ← [HUÉRFANO] versión morada, API DPA real
│   │   ├── confirm/
│   │   │   ├── page.tsx               ← <Suspense> → ui.tsx
│   │   │   └── ui.tsx                 ← polling estado pago + emisión + reenvío
│   │   └── success/
│   │       ├── page.tsx               ← redirige a /checkout/confirm
│   │       └── SuccessClient.tsx      ← [CASI HUÉRFANO] cuenta atrás
│   ├── signin/
│   │   ├── page.tsx  · ui.tsx (SignInClient)  · signin-buttons.tsx [huérfano]
│   ├── signup/
│   │   ├── page.tsx  · ui.tsx (SignupClient)
│   └── mis-tickets/
│       ├── page.tsx (redirige a /signin si no hay sesión)
│       └── ui.tsx (MisTicketsClient) → TicketCard
│
├── (organizer)/organizador/
│   ├── OrganizadorClient.tsx          ← [HUÉRFANO] dashboard client sobre EVENTS
│   ├── ui.tsx (OrganizadorUI)         ← dashboard server real (DB, por organizador)
│   ├── ResetDemoButton.tsx
│   ├── logout/route.ts                ← GET, revoca sesión + limpia cookies
│   ├── (auth)/
│   │   ├── layout.tsx
│   │   ├── login/page.tsx · OrganizerLoginClient.tsx
│   │   ├── registro/page.tsx          ← wizard 9 pasos (client)
│   │   └── verificar/page.tsx · OrganizerVerifyClient.tsx
│   ├── (panel)/
│   │   ├── layout.tsx                 ← GUARD real (sesión + verified + approved)
│   │   ├── page.tsx → OrganizadorUI
│   │   ├── eventos/
│   │   │   ├── nuevo/page.tsx · ui.tsx (NuevoEventoClient, wizard 4 pasos)
│   │   │   └── [id]/scanner/page.tsx (usa EVENTS!) · ui.tsx (ScannerUI)
│   └── pagos/
│       ├── page.tsx (dropdown usa EVENTS) · PaymentsTableClient.tsx
│
├── (admin)/admin/
│   ├── login/page.tsx · AdminLoginClient.tsx
│   ├── page.tsx                       ← dashboard (client, SIN guard server): tabs eventos/organizadores
│   ├── organizadores/page.tsx         ← [DUPLICADO del tab] client
│   └── eventos/[id]/page.tsx          ← publicar/despublicar (client)
│
└── api/                               ← ver §5
```

**Nota**: no existe `(admin)/admin/layout.tsx`.

---

## 4. Componentes (`apps/web/src/components`)

| Componente | Usado por | Estado |
|---|---|---|
| `public/SiteHeader.tsx` | `(public)/layout.tsx` | ✅ vivo (client, `useSession`) |
| `public/SiteFooter.tsx` | — | ❌ huérfano + **roto** (clases `bg-muted` inexistentes) |
| `public/AuthButtons.tsx` | — | ❌ huérfano (SiteHeader tiene su propia lógica) |
| `EventCard.tsx` | home, `/eventos` | ✅ vivo |
| `EventosFilters.tsx` | home (Suspense), `EventosFiltersSuspense` | ✅ vivo (usa `ui/select`) |
| `EventosFiltersSuspense.tsx` | `/eventos` | ✅ vivo (wrapper Suspense) |
| `HomeHeroRotator.tsx` | home | ✅ vivo → `HeroBanner` |
| `HomeHeroCarousel.tsx` | — | ❌ huérfano |
| `HeroBanner.tsx` | `HomeHeroRotator` | ✅ vivo |
| `EventTicketSelector.tsx` | `/eventos/[slug]` | ✅ vivo (selector "oficial") |
| `EventInlineCheckout.tsx` | — | ❌ huérfano |
| `CheckoutTicketSelector.tsx` | — | ❌ huérfano (flujo Stripe directo) |
| `CheckoutBuyerForm.tsx` | `/checkout/[eventId]` | ✅ vivo (form comprador "oficial") |
| `CheckoutCustomerForm.tsx` | — | ❌ huérfano |
| `TicketCard.tsx` | `mis-tickets/ui.tsx` | ✅ vivo (embebe `<img src=/api/qr>`) |
| `QRScanner.tsx` | `scanner/ui.tsx` | ✅ vivo (`@zxing`) |
| `ui/select.tsx` | `EventosFilters` únicamente | ✅ vivo (Radix) |
| `ui/Card.tsx` | (casi nadie) | ⚠️ semi-huérfano (light theme) |

Adicionalmente en `app/`: `QuickBuyClient.tsx`, `CheckoutClient.tsx`, `OrganizadorClient.tsx`, `SuccessClient.tsx`, `signin-buttons.tsx` → **huérfanos**.

---

## 5. Rutas API (`apps/web/src/app/api`)

### Auth (compradores)
| Ruta | Método | Función | Auth |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth handler | — |
| `/api/auth/signup` | POST | crea `usuarios` + token + email | pública |
| `/api/auth/verify-email` | GET | marca `email_verified_at` | token en URL |

### Catálogo
| Ruta | Método | Notas |
|---|---|---|
| `/api/events` | GET | lista o lookup `?slug=`/`?id=`; **no filtra `is_published`**; sondea `information_schema` |
| `/api/events/[id]` | GET | idem, por id |
| `/api/events/by-slug/[slug]` | GET | idem, por slug (versión con más sondas) |
| `/api/remaining` | GET | `?eventId=` → `remainingByTicketTypeId` (PG) |

### Tickets / QR
| Ruta | Método | Auth | Notas |
|---|---|---|---|
| `/api/tickets` | GET | ✅ sesión NextAuth | tickets del `owner_email` de sesión, ignora `?email=` |
| `/api/tickets/resend` | POST | ⚠️ solo `ticketId` | reenvía a buyer+owner+sesión, adjunta QR PNG |
| `/api/qr` | GET | ❌ ninguna | firma token para **cualquier** ticketId/eventId |

### Pagos
| Ruta | Método | Notas |
|---|---|---|
| `/api/payments/stripe/create` | POST | crea hold (si falta) + payment + Checkout Session; idempotency key |
| `/api/payments/stripe/status` | GET | reconcilia sesión Stripe, emite si `paid` |
| `/api/payments/stripe/webhook` | POST | ✅ firma + dedupe; `checkout.session.completed/expired` |
| `/api/payments/webpay/create` | POST | hold + payment + `WebpayPlus.Transaction.create` |
| `/api/payments/webpay/return` | GET/POST | commit + emisión + redirect a `/checkout/confirm` |
| `/api/payments/flow/create` | POST | hold + payment + `flowCreatePayment`; valida `amount_mismatch` |
| `/api/payments/flow/return` | GET/POST | (=kick) → `flow/kick` es el urlReturn real |
| `/api/payments/flow/kick` | POST | redirige a `/checkout/confirm?flow_token=` |
| `/api/payments/flow/confirm` | POST | urlConfirmation; `getStatus` + finalize (impl. propia) |
| `/api/payments/flow/webhook` | GET/POST | firma opcional; `getStatus` + finalize |
| `/api/payments/flow/status` | GET | debug `getStatus` (usa `_lib/flow.ts`) |
| `/api/payments/fintoc/create` | POST | **410 Gone** (deshabilitado) |
| `/api/payments/fintoc/webhook` | POST | ✅ HMAC; sigue activo |
| `/api/payments/transfer/create` | POST | genera referencia + datos bancarios (env) |
| `/api/payments/status` | GET | `?payment_id=` estado + tickets + auto-email |

### Wallet
| Ruta | Método | Notas |
|---|---|---|
| `/api/wallet/google/save-url` | GET | JWT RS256 → `pay.google.com/gp/v/save/...` (JSON o redirect) |

### Organizador
| Ruta | Método | Auth | Notas |
|---|---|---|---|
| `/api/organizador/register` | POST | pública | crea `organizer_users` + OTP + email |
| `/api/organizador/verify` | POST | OTP | marca `verified` |
| `/api/organizador/login` | POST | user/pass | valida verified+approved, cookie |
| `/api/organizador/logout` | POST | cookie | |
| `/api/organizador/sso` | GET | sesión NextAuth + allowlist `ORGANIZER_EMAILS` | convierte a sesión organizador |
| `/api/organizador/dashboard` | GET | ✅ `requireOrganizerApproved` | ⚠️ stats **globales** (no por organizador) |
| `/api/organizador/eventos/submit` | POST | ✅ sesión + verified + approved | inserta submission |
| `/api/organizador/admin/bootstrap` | POST | admin session **o** `x-organizer-admin-key` | crea org aprobado |
| `/api/organizador/admin/create-user` | POST | idem | crea org aprobado (form o JSON) |

### Admin
| Ruta | Método | Auth real | Notas |
|---|---|---|---|
| `/api/admin/login` | POST | user/pass | cookie `tc_admin_sess` |
| `/api/admin/logout` | POST | cookie | |
| `/api/admin/bootstrap` | POST | ✅ `x-bootstrap-key` | crea primer admin |
| `/api/admin/events` | GET | ❌ **ninguna** (solo middleware por longitud de cookie) | `?tab=pending|published` |
| `/api/admin/event/[id]` | GET | ❌ | detalle |
| `/api/admin/events/[id]/approve` | POST | ❌ | submission → `events` + `ticket_types` + `organizer_events` |
| `/api/admin/events/[id]/publish` | POST | ❌ | `is_published=true` |
| `/api/admin/events/[id]/unpublish` | POST | ❌ | `is_published=false` |
| `/api/admin/organizers` | GET | ❌ | `?status=pending|approved` |
| `/api/admin/organizers/[id]/approve` | POST | ❌ | `approved=true` (si verified) |

### Demo (mezcla PG / JSON)
| Ruta | Método | Backend | Auth |
|---|---|---|---|
| `/api/demo/checkin` | POST | **PG** | ❌ (no está en el matcher del middleware) |
| `/api/demo/event-stats` | GET | **PG** | ⚠️ middleware (cookie org) |
| `/api/demo/event-checkins` | GET | **PG** | ⚠️ middleware |
| `/api/demo/tickets` | GET | **PG** | ❌ ninguna (`?email=`) |
| `/api/demo/hold` | POST | **PG** (`createHoldPgServer`) | ❌ ninguna |
| `/api/demo/qr` | GET | firma token | ❌ ninguna |
| `/api/demo/availability` | GET | **PG** | ❌ ninguna |
| `/api/demo/remaining` | GET | **PG** (usa `/api/remaining`? no, propio) | ❌ |
| `/api/demo/export` | GET | **PG** | `TICKETCHILE_EXPORT_SECRET` (no seteado) + middleware |
| `/api/demo/export-checkins` | GET | **PG** | idem |
| `/api/demo/reset-checkins` | POST | **PG** | ⚠️ middleware |
| `/api/demo/reset` | POST | **JSON** (`resetDemoServer`) | ⚠️ middleware |
| `/api/demo/stats` | GET | **JSON** + `EVENTS` | ❌ |
| `/api/demo/cart-hold` | POST | **JSON** + `EVENTS` | ❌ |
| `/api/demo/cart-hold/release` | POST | **JSON** | ❌ |
| `/api/demo/paid-order` | POST | **PG** (`preparePaymentForHoldPg`) o JSON fallback | ❌ |

### Dev
| Ruta | Método | Notas |
|---|---|---|
| `/api/dev/seed` | POST | 403 en producción; siembra 3 eventos de `EVENTS` |

---

## 6. Módulos de librería (`apps/web/src/lib`)

| Fichero | Responsabilidad | Estado |
|---|---|---|
| `db.ts` | Pool `pg` singleton + `withTx()` | ✅ núcleo |
| `api.ts` | Prefijo API configurable (`apiUrl`) | ✅ |
| `events.ts` | Array `EVENTS` demo + tipos + helpers formato (CLP, fecha) + parsers de carrito + `remainingFor`/`eventPriceFrom` | ⚠️ mezcla datos demo + utilidades vivas |
| `events.server.ts` | `getEventBySlugDb`, `getEventByIdDb`, `listEventsDb` (filtran `is_published`) | ✅ (N+1) |
| `events.admin.server.ts` | `adminListEventsDb`, `adminGetEventDb`, `adminSetPublishedDb` | ✅ |
| `availability.pg.server.ts` | Disponibilidad por evento + expiración de holds | ✅ |
| `hold.pg.server.ts` | `createHoldPgServer` (lock `FOR UPDATE`, valida stock) | ✅ |
| `checkout.pg.server.ts` | `preparePaymentForHoldPg`, `consumeHoldToPaidOrderPg`, `finalizePaidHoldToOrderPgTx`, `finalizeHoldToOrderCoreTx` (idempotente, con fallbacks de columnas) | ✅ núcleo — **la implementación buena de emisión** |
| `organizer.pg.server.ts` | ~1100 líneas: `DashboardStats`, listados de eventos/submissions del organizador, stats global y por-organizador, export CSV tickets/checkins, dashboard de pagos, `resetCheckinsPg` | ✅ (parcialmente sin scope) |
| `organizer.server.ts` | wrapper demo-vs-pg de stats | ⚠️ semi-usado |
| `organizer-auth.pg.server.ts` | hash scrypt-b64 + `organizer_users`/`organizer_sessions` | ✅ |
| `organizer-guard.server.ts` | `requireOrganizerApproved()` (cookies) | ✅ |
| `organizerAuth.server.ts` | HMAC cookie `tc_org_user` + scrypt-b64url | ❌ código muerto |
| `admin-auth.pg.server.ts` | hash scrypt-b64 + `admin_users`/`admin_sessions` | ✅ (pero rutas admin no lo llaman) |
| `qr-token.server.ts` | `signTicketToken` / `verifyTicketToken` (HMAC + `timingSafeEqual`) | ✅ núcleo |
| `email.server.ts` | `sendOrganizerVerificationEmail` (Resend) | ✅ |
| `tickets.email.ts` | `sendTicketEmail` (HTML + adjuntos QR inline CID) | ✅ |
| `stripe.server.ts` | Proxy lazy de Stripe + `appBaseUrl()` | ✅ |
| `flow.ts` | firma + `flowCreatePayment` + `flowGetStatus` + verificación webhook | ✅ (1 de 3 impls) |
| `google-wallet.server.ts` | `buildGoogleWalletSaveUrl` (JWT RS256) | ⚠️ duplica lógica de `wallet/google/save-url/route.ts` |
| `demo-db.server.ts` | "DB" JSON (orders/tickets/holds), stats sobre `EVENTS` | ⚠️ legacy, aún referenciada |
| `seed.pg.server.ts` | `seedFromEvents()` | ⚠️ dev-only |
| `storage.ts` | fallback localStorage orders/tickets/checkins | ❌ código muerto |

---

## 7. Configuración

| Fichero | Contenido | Nota |
|---|---|---|
| `apps/web/next.config.ts` | `{ reactCompiler: true }` | conflicto potencial con `.js` |
| `apps/web/next.config.js` | `{ turbopack: { root }, allowedDevOrigins }` | conflicto potencial con `.ts` |
| `apps/web/tsconfig.json` | strict, `@/* → ./src/*`, include `.next/**/*.ts` | el include de `.next` provoca los 10 errores de typegen |
| `apps/web/eslint.config.mjs` | `eslint-config-next` core-web-vitals + typescript | 302 errores al ejecutar |
| `apps/web/postcss.config.mjs` | `@tailwindcss/postcss` | — |
| `turbo.json` (raíz) | tasks dev/build/lint/typecheck | inerte (sin `package.json` raíz) |
| `apps/web/pnpm-workspace.yaml` | `packages: ["."]` + `ignoredBuiltDependencies: [sharp, unrs-resolver]` | `sharp` ignorado → sin optimización de imágenes |
| `.env.example` (raíz) | **vacío** | — |
| `package.json.bak` (raíz) | scripts turbo + `packageManager: pnpm@9` | debería ser `package.json` |

---

## 8. Flujo de datos — compra de ticket (camino real)

```
/eventos/[slug]  (server, getEventBySlugDb)
   └─ <EventTicketSelector>  (client)
        └─ GET /api/remaining?eventId=…   (prefijo NEXT_PUBLIC_TICKET_API_PREFIX)
        └─ router.push(/checkout/[eventId]?cart=tt:qty)   + sessionStorage tc_cart_<id>
/checkout/[eventId]  (server, getEventByIdDb)
   └─ <CheckoutBuyerForm>  (client)
        ├─ Webpay:  POST /api/payments/webpay/create → hold+payment+tx → form POST token_ws → Webpay
        │            → GET/POST /api/payments/webpay/return → commit → finalizePaidHoldToOrderPgTx
        │            → redirect /checkout/confirm?payment_id=…
        ├─ Stripe:  POST /api/payments/stripe/create → hold+payment+Session → redirect Stripe
        │            → webhook checkout.session.completed → finalizePaidHoldToOrderPgTx
        │            → /checkout/confirm?session_id=… (o payment_id)
        ├─ Flow:    POST /api/payments/flow/create → hold+payment+flowCreatePayment → redirect Flow
        │            → /api/payments/flow/kick → /checkout/confirm?flow_token=…
        │            → webhook + /api/payments/flow/confirm (getStatus + finalize propio)
        └─ Transfer: POST /api/payments/transfer/create → payment PENDING + referencia/banco (no emite)
/checkout/confirm  (client ui.tsx)
   └─ polling GET /api/payments/status?payment_id=…  (o stripe/status)
        └─ si PAID y sin tickets → finalizePaidHoldToOrderPgTx (idempotente)
        └─ autoEmailOrderTickets → sendTicketEmail (QR PNG inline)
   └─ "Ver mis tickets" → /mis-tickets
/mis-tickets  (server redirige si no hay sesión)
   └─ <MisTicketsClient> → GET /api/tickets (owner_email de sesión) → <TicketCard>
        └─ <img src="/api/qr?ticketId=…&eventId=…">   (token firmado)
Puerta:
/organizador/eventos/[id]/scanner   ← page.tsx: EVENTS.find(id) → 404 si no es evt_001/002/003
   └─ <QRScanner> → POST /api/demo/checkin (PG UPDATE status=USED)
```

---

## 9. Cookies

| Cookie | Emisor | Contenido | Validación |
|---|---|---|---|
| `next-auth.session-token` | NextAuth | JWT firmado (`NEXTAUTH_SECRET`) | ✅ NextAuth |
| `tc_org_sess` | `/api/organizador/login`, `/sso` | id de sesión (`orgsess_` + hex) | ⚠️ middleware solo mira longitud; `getOrganizerFromSession` en layout panel + `/api/organizador/dashboard` |
| `tc_admin_sess` | `/api/admin/login` | id de sesión (`admsess_` + hex) | ❌ solo longitud (middleware); rutas admin no revalidan |
| cookies legacy: `organizer_session`, `tc_org_session`, `tc_org_user` | — | — | leídas en algunos sitios "por si acaso" |
