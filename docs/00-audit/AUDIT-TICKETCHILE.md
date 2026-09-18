# AUDITORÍA COMPLETA — TicketChile.com

> Fase: **solo investigación**. Ningún archivo del producto fue modificado.
> Fecha de auditoría: 2026-08-27.
> Alcance: repositorio completo (`apps/web`), rama `main`, último commit `cca4613`.

---

## 0. Resumen ejecutivo (TL;DR)

TicketChile es una **ticketera funcional pero frágil**, construida sobre Next.js 16 / React 19 con
Postgres crudo (`pg`, sin ORM ni migraciones). El flujo núcleo **comprar → pagar → emitir ticket con QR → escanear en puerta**
está implementado de punta a punta y el `next build` pasa limpio. Sin embargo:

- **La estructura de monorepo está abandonada** (no hay `package.json` raíz — fue renombrado a `.bak`; `apps/api` vacío; `packages/types` sin uso). La app real es solo `apps/web`.
- **Hay 3 sistemas de autenticación distintos** (NextAuth para compradores, auth propia para organizadores, auth propia para admin) con 3 codificaciones de hash scrypt diferentes.
- **El panel de administrador NO tiene validación de sesión real**: `src/proxy.ts` solo verifica que exista una cookie de más de 10 caracteres, y las rutas `/api/admin/*` no revalidan. Es un **bypass de autorización crítico**.
- **El panel de organizador no aísla datos por organizador** en varios endpoints (dashboard y pagos devuelven datos de todos).
- **El schema SQL versionado (`apps/web/sql/schema.sql`) está obsoleto**: le faltan tablas y columnas enteras que el código usa (`usuarios`, `admin_users`, `organizer_verifications`, `events.is_published`, campos de comprador en `orders`, etc.). La base real evolucionó por ALTERs manuales no versionados.
- **Mezcla de fuentes de verdad**: la home y el scanner usan un array hardcodeado de 3 eventos (`EVENTS` en `lib/events.ts`); `/eventos` usa la DB. El scanner **solo funciona para los 3 eventos demo**, no para eventos reales creados por organizadores.
- **Deuda técnica alta**: ~302 errores de ESLint, `any` omnipresente en el mapeo de filas, 3 implementaciones de la integración Flow, 3 implementaciones de emisión de tickets, 4 selectores de tickets distintos, 2 dashboards de organizador, componentes huérfanos, comentarios informales/jocosos en producción.
- **Sin tests, sin CI, sin `.env.example` (está vacío)**.

Veredicto: **el backend de dominio (holds, pagos, emisión, QR firmado) es reutilizable con refactor**;
la capa de auth/roles, el schema, los paneles y todo el sistema visual deben **rediseñarse o reconstruirse**.

---

## 1. Arquitectura general

### 1.1 Framework y runtime

| Aspecto | Detalle |
|---|---|
| Framework | **Next.js 16.1.1** (App Router, Turbopack) |
| React | **19.2.3** + `react-dom` 19.2.3 |
| React Compiler | **Activado** (`babel-plugin-react-compiler@1.0.0`, `next.config.ts: reactCompiler: true`) |
| TypeScript | **5.9.3**, `strict: true`, `moduleResolution: bundler`, target ES2017 |
| Estilos | **Tailwind CSS v4** (`@tailwindcss/postcss@4.1.18`), sin `tailwind.config` — configuración vía `@theme` en `globals.css` |
| Gestor de paquetes | **pnpm** (`packageManager: pnpm@9` en el `package.json.bak`) |
| Monorepo | **turbo** declarado, pero **inoperante** (ver 1.3) |
| Node | `@types/node@20` |

### 1.2 Sistema de routing

- **App Router** (`apps/web/src/app`), 100% file-based.
- Route groups: `(public)`, `(organizer)`, `(admin)`, y anidados `(organizer)/organizador/(auth)` y `(organizer)/organizador/(panel)`.
- **Middleware**: `apps/web/src/proxy.ts` — nótese el nombre `proxy.ts`, que es el rename oficial de `middleware.ts` en Next.js 16. Se compila como "Proxy (Middleware)" en el build.
- La mayoría de páginas y rutas API declaran `export const runtime = "nodejs"` y `export const dynamic = "force-dynamic"`.

### 1.3 Estructura de carpetas (nivel repo)

```
tiketera/
├── package.json.bak          ← el package.json raíz fue RENOMBRADO. `turbo *` no funciona.
├── turbo.json                ← tasks: dev/build/lint/typecheck (sin efecto sin package.json raíz)
├── pnpm-lock.yaml
├── .env.example              ← VACÍO (0 bytes)
├── .gitignore
├── tools/
│   └── make-admin-hash.js    ← genera hash scrypt para admin (script suelto)
├── apps/
│   ├── api/
│   │   └── src/main.ts       ← VACÍO (proyecto backend abandonado)
│   └── web/                  ← LA APLICACIÓN REAL
│       ├── package.json      ← name: "web"
│       ├── pnpm-workspace.yaml  ← packages: ["."]  (solo se incluye a sí mismo)
│       ├── next.config.ts    ← { reactCompiler: true }
│       ├── next.config.js    ← { turbopack.root, allowedDevOrigins }   ← DOS configs (conflicto)
│       ├── tsconfig.json
│       ├── eslint.config.mjs
│       ├── postcss.config.mjs
│       ├── .demo-db.json     ← datos de prueba COMMITEADOS (stale)
│       ├── .demo/db.json     ← "DB" JSON del modo demo (COMMITEADA)
│       ├── sql/schema.sql    ← schema OBSOLETO
│       ├── scripts/apply-schema.mjs
│       ├── public/           ← logos, banners, imágenes de eventos demo
│       └── src/
│           ├── app/          ← rutas (ver UI-INVENTORY.md)
│           ├── components/
│           ├── lib/
│           ├── auth.ts       ← config NextAuth
│           ├── organizer-auth.ts  ← VACÍO
│           └── proxy.ts      ← middleware
└── packages/
    └── types/               ← @ticketchile/types — package.json + src/index.ts, SIN USO real
```

### 1.4 Arquitectura de aplicación

- **Sin capa de arquitectura formal**. No hay separación domain/infra/application. La lógica de negocio vive mezclada en:
  - `src/lib/*.pg.server.ts` (queries SQL + lógica de dominio, marcados `import "server-only"` de forma inconsistente),
  - rutas API (mucha lógica duplicada inline: transacciones, expiración de holds, emisión de tickets),
  - server components (`.tsx` de páginas del panel).
- **Acceso a datos**: `pg.Pool` singleton en `src/lib/db.ts` (global `__pgPool`), helper `withTx()`. Queries SQL crudas con parámetros posicionales. Sin repositorios, sin tipos generados.
- **Patrón "demo vs real"**: existe una capa legacy basada en un fichero JSON (`src/lib/demo-db.server.ts`, `.demo/db.json`) que convive con la capa Postgres. Algunas rutas `/api/demo/*` usan JSON, otras usan Postgres (ver 3.6).

### 1.5 Componentes / Layouts / Providers / Contextos / Hooks

- **Providers**: `src/app/providers.tsx` → solo `<SessionProvider refetchInterval={0}>` de NextAuth. No hay theme provider, query client, ni contexto propio.
- **Contextos**: ninguno propio. Estado global = sesión NextAuth + `sessionStorage`/`localStorage` puntual + `BroadcastChannel("tc-dashboard")` en el dashboard de organizador.
- **Layouts**:
  - `app/layout.tsx` — root, `<html lang="es">`, body `text-white`.
  - `(public)/layout.tsx` — `SiteHeader` + `<main max-w-6xl>` + footer inline.
  - `(organizer)/organizador/(auth)/layout.tsx` — barra minimal login/registro.
  - `(organizer)/organizador/(panel)/layout.tsx` — **con guard real** (`getOrganizerFromSession`, redirects por verified/approved).
  - **NO existe** `(admin)/admin/layout.tsx` → las páginas admin no tienen guard de servidor.
- **Hooks personalizados**: no hay hooks reutilizables en `src/`. Toda la lógica de estado está inline en cada componente `"use client"`.
- **Componentes** (`src/components/`): 24 archivos. Ver `UI-INVENTORY.md` y `PROJECT-MAP.md`. Hay duplicación notable (4 selectores de tickets, 2 heroes, 2 dashboards).

### 1.6 Servicios / APIs / integraciones externas

| Servicio | Librería | Uso | Estado |
|---|---|---|---|
| Postgres | `pg@8` | DB principal | Activo |
| NextAuth | `next-auth@4.24.13` | Login compradores (Google + credenciales) | Activo |
| Google OAuth | provider NextAuth | Login social | Activo (claves en env) |
| Resend | `resend@6` | Emails (verificación, tickets, reenvío) | Activo |
| Stripe | `stripe@20` | Checkout Session (CLP) | Activo (clave en env) |
| Transbank Webpay Plus | `transbank-sdk@6` | Pago tarjeta CL | Activo (claves en env) |
| Flow | fetch manual (3 impls) | Pago transferencia/redirect CL | **Configurado en UI pero `FLOW_API_KEY`/`FLOW_SECRET_KEY` NO están en `.env.local`** → falla en runtime |
| Fintoc | fetch | Transferencia bancaria | **Deshabilitado** — `/api/payments/fintoc/create` responde 410; webhook sigue existiendo |
| Transferencia manual | — | Datos bancarios por env + referencia | Activo |
| Google Wallet | `jsonwebtoken@9` (RS256) | Pase "Add to Google Wallet" | Activo (claves en env) |
| QR | `qrcode@1.5` + HMAC propio | Genera PNG con token firmado | Activo (`TICKETCHILE_QR_SECRET`) |
| Scanner QR | `@zxing/browser` + `@zxing/library` | Cámara en `/organizador/.../scanner` | Activo |
| API DPA (gob.cl) | `fetch` desde cliente | Regiones/comunas en `CheckoutClient.tsx` (huérfano) | El componente vivo (`CheckoutBuyerForm`) usa una lista hardcodeada de solo 4 regiones |

### 1.7 Middleware

`src/proxy.ts` (`config.matcher`): `/organizador/:path*`, `/api/organizador/:path*`, un puñado de `/api/demo/*` (`event-stats`, `event-checkins`, `reset-checkins`, `export`, `reset`), `/admin/:path*`, `/api/admin/:path*`.

Lógica: permite allowlist pública (login/registro/verificar), luego para el resto exige **solo presencia de cookie** (`tc_org_sess` o `tc_admin_sess`) con `trim().length > 10`. **No valida la sesión contra la base de datos.** Ver §11 Seguridad.

### 1.8 Utilidades (`src/lib/`)

`api.ts` (prefijo API configurable), `db.ts` (pool + `withTx`), `events.ts` (array `EVENTS` demo + helpers de formato CLP/fecha + parsers de carrito), `events.server.ts` (queries DB, filtra `is_published`), `events.admin.server.ts`, `availability.pg.server.ts`, `hold.pg.server.ts`, `checkout.pg.server.ts` (emisión idempotente), `organizer.pg.server.ts` (~1100 líneas: stats, submissions, export CSV, dashboard de pagos), `organizer.server.ts` (wrapper demo/pg), `organizer-auth.pg.server.ts`, `organizer-guard.server.ts`, `organizerAuth.server.ts` (**HMAC cookie sign, sin uso**), `admin-auth.pg.server.ts`, `qr-token.server.ts` (firma/verifica token `tc1.<ticketId>.<eventId>.<iat>.<sig>`), `email.server.ts`, `tickets.email.ts`, `stripe.server.ts`, `flow.ts`, `google-wallet.server.ts`, `demo-db.server.ts` (**JSON DB legacy**), `seed.pg.server.ts`, `storage.ts` (**localStorage legacy**).

### 1.9 Variables de entorno

`.env.example` está **vacío** → no hay documentación de configuración. Claves presentes en `apps/web/.env.local` (valores no auditados):

```
DATABASE_URL, POSTGRES_URL_NON_POOLING, DATABASE_SSL
NEXTAUTH_SECRET, NEXTAUTH_URL, NEXTAUTH_URL_INTERNAL
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
APP_URL, APP_BASE_URL, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_APP_ORIGIN, NEXT_PUBLIC_TICKET_API_PREFIX
RESEND_API_KEY, EMAIL_FROM
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
WEBPAY_ENV, WEBPAY_API_KEY, WEBPAY_COMMERCE_CODE
FINTOC_SECRET_KEY, FINTOC_WEBHOOK_SECRET, FINTOC_RECIPIENT_*, NEXT_PUBLIC_FINTOC_*
GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL, GOOGLE_WALLET_PRIVATE_KEY
TICKETCHILE_QR_SECRET
ORGANIZER_ADMIN_KEY, ORGANIZER_KEY, ORGANIZER_EMAILS, ORGANIZER_SESSION_SECRET
```

**Faltan (usadas por el código):** `FLOW_API_KEY`, `FLOW_SECRET_KEY`, `FLOW_BASE_URL`, `ADMIN_BOOTSTRAP_KEY`/`_USER`/`_PASS`, `TICKETCHILE_EXPORT_SECRET`, `TRANSFER_BANK_*`, `TICKETCHILE_DB_POSTGRES_URL*`, `DATABASE_POOL_MAX`, `FROM_EMAIL`.

---

## 2. Dependencias

`apps/web/package.json`:

**dependencies (13):**
`@radix-ui/react-select`, `@zxing/browser`, `@zxing/library`, `bcryptjs`, `jsonwebtoken`, `lucide-react`, `next@16.1.1`, `next-auth@4.24.13`, `pg`, `qrcode`, `react@19.2.3`, `react-dom@19.2.3`, `resend`, `stripe`, `transbank-sdk`.

**devDependencies (14):**
`@tailwindcss/postcss`, `@types/{jsonwebtoken,node,pg,qrcode,react,react-dom}`, `babel-plugin-react-compiler@1.0.0`, `dotenv`, `eslint@9`, `eslint-config-next@16.1.1`, `postcss`, `tailwindcss@4.1.18`, `typescript@5`.

### 2.1 Por categoría

| Categoría | Librería | Observación |
|---|---|---|
| UI / componentes | `@radix-ui/react-select` únicamente | No hay librería de componentes (shadcn parcial: solo `select.tsx`). Todo lo demás es Tailwind a mano. |
| Animaciones | **ninguna** | No hay `framer-motion` / `motion`. Animaciones = CSS/`transition` de Tailwind. |
| Iconos | `lucide-react@0.562` | OK |
| Formularios | **ninguna** | No hay `react-hook-form`. Todo con `useState` manual. |
| Validación | **ninguna** | No hay `zod` / `yup`. Validación con regex y funciones ad-hoc, principalmente en cliente. |
| Autenticación | `next-auth@4` + crypto nativo (scrypt) | v4 (v5/Auth.js no adoptado). Auth de organizador/admin es propia. |
| Base de datos | `pg@8` | Sin ORM, sin query builder, sin migraciones. |
| Pagos | `stripe@20`, `transbank-sdk@6` | Flow y Fintoc son `fetch` a mano. |
| Generación de QR | `qrcode@1.5` | OK |
| PDFs | **ninguna** | No se generan PDFs de tickets (solo email HTML + PNG QR). |
| Emails | `resend@6` | HTML inline (sin plantillas / react-email). |
| Almacenamiento | `pg` + fichero JSON local (`.demo/db.json`) + `localStorage`/`sessionStorage` | Sin blob storage: **las imágenes de eventos se guardan como data-URL base64 en la DB**. |
| Analytics | **ninguna** | — |
| Gráficos | **ninguna** | Dashboards usan barras CSS a mano. |
| Wallet | `jsonwebtoken@9` | Solo Google Wallet (no Apple Wallet). |
| Scanner | `@zxing/browser@0.1.5` + `@zxing/library@0.21.3` | ~1 MB, route-split al scanner. |

### 2.2 Sin utilizar / eliminables

- **`bcryptjs`** — declarado pero **no se usa** en `src/`. Todo el hashing es `crypto.scryptSync`. Eliminable.
- **`packages/types`** (`@ticketchile/types`) — package con `TicketType`/`Event` que **nadie importa** (los tipos se redefinen en `lib/events.ts`). Eliminable.
- **`apps/api`** — `main.ts` vacío. Eliminable.
- **`dotenv`** (devDep) — solo lo usa `scripts/apply-schema.mjs`. OK mantener.
- **`transbank-sdk`** — se usa (Webpay). Mantener.
- El array `EVENTS` + funciones `getEventById`/`getEventBySlug` de `lib/events.ts` son de facto código muerto en el flujo real pero siguen siendo importados por home, scanner, pagos y rutas demo.

### 2.3 Duplicadas / implementadas a mano que podrían simplificarse

- **Hash de contraseña scrypt: 3 codificaciones distintas** en el repo:
  - `src/auth.ts` / `api/auth/signup`: `scrypt$<saltHex>$<hashHex>`
  - `src/lib/admin-auth.pg.server.ts` / `src/lib/organizer-auth.pg.server.ts`: `scrypt$<salt_b64>$<hash_b64>`
  - `src/lib/organizerAuth.server.ts` (sin uso): `scrypt$<salt_b64url>$<hash_b64url>`
  - `tools/make-admin-hash.js`: params N/r/p explícitos + base64
  → unificar en un solo módulo de credenciales.
- **Integración Flow triplicada**: `src/lib/flow.ts`, `src/app/api/payments/flow/_lib/flow.ts`, y firma/`getStatus` reimplementados inline en `flow/confirm/route.ts`.
- **Emisión de tickets triplicada**: `checkout.pg.server.finalizeHoldToOrderCoreTx` (la "buena", idempotente), `flow/confirm/route.finalizePaidPayment`, `flow/return/route.finalizePaidPayment`. Semánticas ligeramente distintas (p.ej. `held >= qty` vs `GREATEST(held - qty, 0)`).
- **`fetchQrPngBase64` + `autoEmailOrderTickets`** copiadas literalmente en `flow/return/route.ts` y `payments/status/route.ts` (y `tickets/resend`).
- **API de eventos duplicada**: `/api/events?slug=…`, `/api/events/by-slug/[slug]`, `/api/events/[id]` (3 handlers casi idénticos con sondas a `information_schema`).
- **`releaseExpiredHoldsTx` / `expireHoldsTx`** reimplementada en ~6 sitios (webpay/create, stripe/create, transfer/create, hold.pg.server, availability.pg.server, checkout.pg.server).
- **Selectores de tickets**: `EventTicketSelector` (vivo), `EventInlineCheckout`, `CheckoutTicketSelector`, `QuickBuyClient`, más `CheckoutBuyerForm`/`CheckoutCustomerForm` — funcionalidad solapada.
- **Dashboards de organizador**: `OrganizadorClient.tsx` (client, itera `EVENTS`) vs `organizador/ui.tsx` `OrganizadorUI` (server, DB). Solo el segundo se renderiza.
- **Heroes**: `HomeHeroRotator` (vivo) vs `HomeHeroCarousel` (sin uso).

### 2.4 Librerías antiguas / incompatibilidades

- **NextAuth v4** con Next 16 / React 19: funciona pero está en modo mantenimiento; la migración natural es Auth.js v5.
- Sin `tailwind.config.*` — todo Tailwind v4 vía `@theme`. Correcto para v4 pero limita tooling que espera el config.
- `next.config.ts` **y** `next.config.js` coexisten → riesgo: Next carga uno solo; `reactCompiler` y `turbopack.root`/`allowedDevOrigins` están en archivos distintos.

---

## 3. Base de datos y backend

### 3.1 Proveedor

Postgres gestionado (probablemente Neon o Vercel Postgres, deducido de los fallbacks `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL`, `TICKETCHILE_DB_POSTGRES_URL`). Conexión vía `pg.Pool` (`max` configurable, default 5), SSL condicional.

### 3.2 Migraciones / gestión de schema

- **No hay herramienta de migraciones.** Un único fichero `apps/web/sql/schema.sql` aplicado a mano con `node apps/web/scripts/apply-schema.mjs` (ejecuta el fichero completo con `CREATE TABLE IF NOT EXISTS`).
- **`schema.sql` está desincronizado con el código.** Diferencias detectadas:

| El código usa… | ¿Está en `schema.sql`? |
|---|---|
| Tabla `usuarios` (columnas `nombre`, `updated_at`, `email_verified_at`) | ❌ (el fichero define `users`, sin `nombre`) |
| Tabla `admin_users`, `admin_sessions` | ❌ |
| Tabla `organizer_verifications` | ❌ |
| `organizer_users.email`, `.phone`, `.verified`, `.approved` | ❌ (solo `is_active`) |
| `events.is_published` | ❌ |
| `events.image` (se sondea con `information_schema`) | Sí, con default |
| `orders.buyer_rut/buyer_phone/buyer_region/buyer_comuna/buyer_address1/buyer_address2` | ❌ (código tiene fallback try/catch) |
| `tickets.order_id` | ✅ |
| `tickets.ticket_type_id` | ❌ (código lo usa en checkin/stats) |
| `tickets.emailed_at`, `.emailed_to` | ❌ (código sondea y degrada) |
| `tickets.used_at` | ✅ |
| `ticket_types.slug`, `.max_per_order` | ❌ (código sondea) |
| `payments.buyer_rut/phone/region/comuna/address1/address2` | ❌ (código try/catch) |

→ **La base de datos real es un artefacto no versionado.** Riesgo alto de "funciona en mi entorno". Prioridad 1 del rediseño: reconstruir el schema desde el código real e introducir migraciones.

### 3.3 Tablas / modelos (según código real)

| Tabla | Propósito | Notas |
|---|---|---|
| `usuarios` | Compradores (NextAuth) | UUID, `password_hash` scrypt-hex, `email_verified_at` |
| `email_verification_tokens` | Verificación email comprador | 1 por usuario (`UNIQUE user_id`), SHA-256 del token |
| `events` | Eventos publicados | `slug` único, `is_published`, `image`, `hero_desktop/mobile` |
| `ticket_types` | Tipos de entrada por evento | PK `(event_id, id)`, contadores `capacity/sold/held` |
| `holds` | Reserva temporal de stock | `status ACTIVE/EXPIRED/CONSUMED`, `expires_at` |
| `hold_items` | Líneas del hold | precio/nombre snapshoteados |
| `orders` | Orden pagada | `hold_id` único, `buyer_email` (recipient) vs `owner_email` (cuenta) |
| `tickets` | Entrada individual | `status VALID/USED/CANCELLED`, `used_at`, QR firmado on-the-fly |
| `payments` | Intento de pago | `hold_id` único, `provider`, `status CREATED/PENDING/PAID/FAILED/CANCELLED`, `provider_ref` |
| `webhook_events` | Dedupe de webhooks | PK `(provider, event_id)` |
| `organizer_users` | Organizadores | scrypt-b64, `verified`, `approved`, `email`, `phone` |
| `organizer_sessions` | Sesiones organizador (7d) | cookie `tc_org_sess` |
| `organizer_verifications` | Códigos OTP de 6 dígitos | canal email/whatsapp, `expires_at` 10 min |
| `organizer_event_submissions` | Eventos enviados a revisión | `payload jsonb` (incluye imagen base64), `status IN_REVIEW/APPROVED/REJECTED` |
| `organizer_events` | Mapa evento → organizador dueño | PK `event_id` |
| `admin_users` | Administradores | scrypt-b64 |
| `admin_sessions` | Sesiones admin (7d) | cookie `tc_admin_sess` |

### 3.4 Relaciones

`events` 1─N `ticket_types`; `holds` 1─N `hold_items`; `holds` 1─1 `orders`; `orders` 1─N `tickets`; `holds` 1─1 `payments`; `organizer_users` 1─N `organizer_sessions`/`organizer_event_submissions`/`organizer_events`; `organizer_events` N─1 `events`.

### 3.5 Endpoints / server actions / APIs

- **No se usan Server Actions.** Todo es Route Handlers (`route.ts`) + fetch desde cliente.
- ~70 rutas API. Inventario completo en `UI-INVENTORY.md`.
- Grupos: `auth/*`, `events/*`, `remaining`, `qr`, `tickets/*`, `payments/{stripe,webpay,flow,fintoc,transfer,status}/*`, `wallet/google/*`, `organizador/*`, `admin/*`, `demo/*`, `dev/seed`.

### 3.6 Almacenamiento y "modo demo"

`src/lib/demo-db.server.ts` implementa una "DB" en `apps/web/.demo/db.json` (orders/tickets/holds). Rutas que **aún la usan**: `/api/demo/stats`, `/api/demo/cart-hold`, `/api/demo/cart-hold/release`, `/api/demo/reset`, y `/api/demo/paid-order` como fallback si no hay Stripe. El resto de `/api/demo/*` (`checkin`, `event-stats`, `event-checkins`, `tickets`, `availability`, `remaining`, `hold`, `export`, `export-checkins`, `reset-checkins`, `qr`) **usa Postgres**. El prefijo `NEXT_PUBLIC_TICKET_API_PREFIX` (probablemente `/api/demo`) hace que el frontend hable con `/api/demo/*`.

`src/lib/storage.ts` implementa además un fallback en `localStorage` para orders/tickets/check-ins (código muerto del flujo real).

### 3.7 Autenticación / roles / permisos

Ver §4.

### 3.8 Qué existe / qué falta (dominio ticketera)

| Entidad | Estado |
|---|---|
| Usuarios / compradores | ✅ (registro, verificación email, login, Google) |
| Organizadores | ✅ registro multi-paso + OTP + aprobación admin |
| Administrador | ✅ auth propia (pero sin guard, ver §11) |
| Eventos | ⚠️ crear = submission → aprobación admin la convierte en `events`. **No hay editar evento** (botón "Gestionar" deshabilitado). No hay borrar. |
| Tipos de entrada | ⚠️ solo **1 tipo** por evento al crear (el form solo pide un ticket base). Multi-tier no soportado en creación. |
| Precios / stock / fechas / ubicación / descripción / imágenes | ⚠️ solo en creación, sin edición posterior. Imagen = base64 en DB. |
| Órdenes | ✅ |
| Pagos | ✅ Webpay + Stripe + transferencia manual; ⚠️ Flow sin claves; ❌ Fintoc deshabilitado |
| Asistentes | ✅ vía `tickets` / export CSV |
| QR | ✅ token HMAC firmado, PNG on-the-fly, email inline, Google Wallet |
| Check-in | ⚠️ scanner **solo funciona para 3 eventos hardcodeados** (`EVENTS`); endpoint checkin no está tras middleware |
| Promociones / cupones / códigos de descuento | ❌ inexistente |
| Estadísticas | ⚠️ existen (por evento y global) pero **no aisladas por organizador** en el endpoint |
| Exportaciones | ✅ CSV tickets + CSV check-ins |
| Liquidaciones / payouts a organizadores | ❌ inexistente |
| Comisiones de plataforma | ❌ inexistente (no hay fee) |
| Soporte | ❌ link `/organizador/soporte` → 404 |
| Notificaciones | ⚠️ solo email transaccional |

---

## 4. Autenticación y roles

### 4.1 Tres sistemas paralelos

| Sistema | Para | Mecanismo | Sesión | Cookie | Hash |
|---|---|---|---|---|---|
| **NextAuth v4** | Compradores | Google OAuth + Credenciales | JWT (`strategy: "jwt"`) | `next-auth.session-token` | scrypt hex |
| **Organizer auth** | Organizadores | user/pass propio | DB `organizer_sessions` (7 días) | `tc_org_sess` | scrypt base64 |
| **Admin auth** | Administradores | user/pass propio | DB `admin_sessions` (7 días) | `tc_admin_sess` | scrypt base64 |

Además: `/api/organizador/sso` permite convertir una sesión NextAuth (email en allowlist `ORGANIZER_EMAILS`) en sesión de organizador. Y `organizerAuth.server.ts` (HMAC de cookie `tc_org_user`) es un **cuarto** mecanismo, muerto.

### 4.2 Registro

- **Comprador**: `/signup` → `POST /api/auth/signup` → crea `usuarios` + token, envía email Resend con link `?token=`. `GET /api/auth/verify-email` marca `email_verified_at`. Login por credenciales **exige email verificado**.
- **Organizador**: `/organizador/registro` (wizard 9 pasos: tipo, razón social, RUT, nombre público, email, canal, teléfono, password ×2) → `POST /api/organizador/register` → crea `organizer_users` (`verified=false, approved=false`) + `organizer_verifications` (OTP 6 dígitos, 10 min) → email. `/organizador/verificar` → `POST /api/organizador/verify` marca `verified=true`. Luego **queda pendiente de aprobación del admin**.
- **Admin**: no hay registro. `POST /api/admin/bootstrap` (header `x-bootstrap-key` = `ADMIN_BOOTSTRAP_KEY`) crea el primero desde env. Admin puede crear organizadores ya aprobados vía `/api/organizador/admin/create-user`.

### 4.3 Login

- Comprador: `/signin` → `signIn("credentials")` o `signIn("google")`. Sanitiza `callbackUrl` (bloquea `/organizador`, `/api/organizador`, `/api/demo`, y open-redirect).
- Organizador: `/organizador/login` → `POST /api/organizador/login` (soporta form y JSON) → valida user/pass, **verified** y **approved**, crea sesión, setea cookie (`domain=.ticketchile.com` en prod). Redirige a `from` si empieza por `/organizador`.
- Admin: `/admin/login` → `POST /api/admin/login`.

### 4.4 Recuperación de contraseña

**No existe** para ninguno de los 3 roles. No hay flujo "olvidé mi contraseña".

### 4.5 Sesiones

- Comprador: JWT stateless, `refetchInterval: 0`. El `uid` en el token se resuelve contra `usuarios` (para Google se hace upsert por email).
- Organizador/Admin: fila en DB con `expires_at`, revocable en logout. **Cookies zombie**: si se borra la fila pero queda la cookie, el middleware la deja pasar (solo mira longitud) y recién el layout del panel detecta la sesión inválida.

### 4.6 Protección de rutas

| Superficie | ¿Guard real? |
|---|---|
| `/organizador/(panel)/*` (páginas) | ✅ layout server valida sesión + verified + approved |
| `/api/organizador/dashboard` | ✅ `requireOrganizerApproved()` |
| `/api/organizador/eventos/submit` | ✅ valida sesión + verified + approved |
| `/api/organizador/*` (login/logout/register/verify/sso) | públicas por diseño |
| `/organizador/*` (middleware) | ⚠️ solo presencia de cookie |
| `/admin/*` (páginas) | ❌ **sin guard de servidor** (client components, sin layout) |
| `/api/admin/*` (events, organizers, approve, publish, unpublish, event) | ❌ **sin validación de sesión** — dependen 100% del middleware, que solo mira longitud de cookie |
| `/api/admin/bootstrap` | ✅ header key |
| `/api/organizador/admin/*` | ✅ sesión admin **o** header `x-organizer-admin-key` |
| `/api/demo/{event-stats,event-checkins,reset-checkins,export,reset}` | ⚠️ middleware (presencia cookie org) |
| `/api/demo/checkin` | ❌ **NO está en el matcher del middleware** → público |
| `/api/demo/tickets`, `/api/demo/hold`, `/api/demo/qr`, `/api/qr` | ❌ públicos, sin auth |
| `/api/tickets` (mis tickets) | ✅ sesión NextAuth, ignora `?email=` |
| `/api/tickets/resend` | ⚠️ solo requiere `ticketId` válido (más email de sesión como destinatario extra) |

### 4.7 Roles existentes y qué puede hacer cada uno hoy

**Comprador (`usuarios`)**
- Registrarse / verificar email / login (email o Google) / logout.
- Navegar eventos, seleccionar entradas, checkout, pagar (Webpay/Stripe/transferencia).
- Ver "Mis tickets" (por `owner_email` de la sesión), ver QR, reenviar por email, "Add to Google Wallet".
- **No puede**: recuperar contraseña, cancelar/transferir tickets, ver historial de órdenes, editar perfil.

**Organizador (`organizer_users`, verified + approved)**
- Login / logout.
- Crear evento (wizard 4 pasos) → queda `IN_REVIEW`.
- Ver dashboard: KPIs (ventas, tickets, eventos, check-ins), lista de submissions, lista de eventos activos con % ocupación.
- Abrir scanner por evento y validar QR (**solo si el evento es evt_001/002/003**).
- Ver dashboard de pagos con filtros (evento/estado/texto) y export CSV — **pero ve pagos de TODOS los organizadores**.
- Descargar CSV de tickets / check-ins.
- **No puede**: editar/despublicar evento, crear más tipos de entrada, gestionar promociones, ver liquidaciones, contactar soporte (404), invitar staff.

**Administrador (`admin_users`)**
- Login / logout.
- Ver submissions `IN_REVIEW` y **aprobarlas** (crea `events` + `ticket_types` + `organizer_events`, publica).
- Ver eventos publicados.
- Ver organizadores pendientes/aprobados y **aprobarlos** (si están verificados).
- `/admin/eventos/[id]`: publicar/despublicar un evento.
- **No puede** (no existe UI): editar eventos, gestionar usuarios/compradores, ver ventas globales/reportes financieros, configurar comisiones, gestionar pagos/reembolsos, soporte, configuración de plataforma.

---

## 5. Web pública

| Ruta | Objetivo | Componentes | Fuente de datos | Estado | Problemas |
|---|---|---|---|---|---|
| `/` | Home: hero rotativo + grid de eventos + filtros | `HomeHeroRotator`→`HeroBanner`, `EventosFilters`, `EventCard` | **`EVENTS` hardcodeado (3)** | Funcional pero desconectado de la DB | Home muestra eventos demo, no los reales. Ciudad/orden filtran sobre 3 registros. `EventosFilters` dentro de `<Suspense>` doble. |
| `/eventos` | Listado con búsqueda / ciudad / orden / paginación | `EventosFiltersSuspense`, `EventCard` | DB (`listEventsDb`, `is_published`) | Funcional | **N+1** al cargar ticket_types. Filtrado y paginación en memoria (carga todos los eventos siempre). Layout usa `-mx-6 -my-10` (hack anti-container). `dynamic=force-dynamic`. |
| `/eventos/[slug]` | Detalle + selección de entradas | `EventTicketSelector` | DB (`getEventBySlugDb`) | Funcional | `<img>` crudo (no `next/image`). Anchors `#tickets`/`#info` con `scroll-mt`. Descripción `whitespace-pre-wrap`. Selector hace fetch a `/api/remaining` (vía `NEXT_PUBLIC_TICKET_API_PREFIX`, ojo prefijo). `MAX_PER_TYPE=10` hardcodeado. |
| `/checkout/[eventId]` | Datos de comprador + método de pago | `CheckoutBuyerForm` | DB (`getEventByIdDb`) | Funcional (Webpay/Stripe/transferencia) | Ofrece **Fintoc** (backend 410) y **Flow** (sin claves). Regiones = lista **hardcodeada de solo 4** (`CHILE_REGIONES`). Carrito viaja por querystring `?cart=tt:qty` + `sessionStorage`. Sin resumen visual del evento (imagen/fecha) prominente. `CheckoutBuyerForm` (rojo/oscuro) vs `CheckoutClient.tsx` huérfano (morado, usa API DPA real, 16 regiones). |
| `/checkout/confirm` | Polling de estado de pago + emisión de tickets | `CheckoutConfirmClient` (`ui.tsx`) | `/api/payments/status` o `/api/payments/stripe/status` | Funcional | Polling cada 5s, timeout 45s. Lógica compleja de refs anti-duplicado. "Reenviar al correo" itera ticket por ticket. Google Wallet solo para el primer ticket. |
| `/checkout/success` | Redirige a `/checkout/confirm` (compat) | `SuccessClient` (parcialmente sin uso) | — | Funcional | Página casi vacía; existe `SuccessClient.tsx` con lógica de cuenta atrás que apenas se usa. |
| `/signin` | Login comprador | `SignInClient` (`ui.tsx`) | NextAuth | Funcional | Copys informales ("Ese email huele raro"). Banners por query (`verified`, `registered`, `mail`). |
| `/signup` | Registro comprador | `SignupClient` (`ui.tsx`) | `/api/auth/signup` | Funcional | Sin política de contraseña visible más allá de "mín 8". Sin captcha. |
| `/mis-tickets` | Tickets del usuario | `MisTicketsClient` (`ui.tsx`) → `TicketCard` | `/api/tickets` (o `/api/demo/tickets` según prefijo) | Funcional | `page.tsx` redirige a `/signin` si no hay sesión, pero `ui.tsx` tiene además un "fallback por email" que en teoría permitiría ver tickets por `?email=` (mitigado porque el endpoint real usa sesión). `TicketCard` embebe `<img src="/api/qr?...">`. |
| Categorías / búsqueda avanzada | — | — | — | ❌ **No existe** página de categorías; no hay taxonomía de eventos. |
| Contacto / FAQ / legales (términos, privacidad) | — | — | — | ❌ **No existen** páginas. El checkout pide "aceptar términos" con checkbox sin link. |
| Perfil de usuario | — | — | — | ❌ **No existe**. |
| Perfil público de organizador | — | — | — | ❌ **No existe**. |

### Problemas UX transversales de la web pública

- **Dos temas visuales conviviendo**: rojo/oscuro "glass" (home, detalle, mis-tickets) vs morado (`CheckoutClient.tsx` huérfano).
- Copys jocosos/poco profesionales en producción ("te tocará llorar (o arreglarlo en DB)", "no es brujería, es async", "ya sé: falta el modo 'se ve caro' 😄" en el footer).
- `SiteFooter.tsx` y `AuthButtons.tsx` usan clases Tailwind (`bg-muted`, `text-muted-foreground`, `border-border`) que **no están definidas** en `globals.css` → estilos rotos/invisibles. (El footer real es el inline de `(public)/layout.tsx`, distinto.)
- El "botón flotante" de `QuickBuyClient` usa `position: fixed` full-width que puede tapar contenido en móvil.
- No hay estados de carga skeleton consistentes; mezcla de spinners y texto "Cargando…".
- No hay manejo de "evento agotado" a nivel de detalle más allá de deshabilitar `+`.

---

## 6. Panel del organizador (auditoría detallada)

Ruta base: `/organizador` (grupo `(organizer)/organizador/(panel)`), protegida por layout server.

### 6.1 Dashboard — `/organizador` (`(panel)/page.tsx` → `organizador/ui.tsx` `OrganizadorUI`)

- **Server component** que resuelve la sesión leyendo cookies (`tc_org_sess` + 2 nombres legacy `organizer_session`, `tc_org_session`) y hace `Promise.all` de: eventos del organizador, submissions, stats.
- KPIs: Ventas Totales (`amountPaidClp`), Tickets Vendidos (`pending+used`), Eventos Activos (`events.length`), Check-ins (`used`). Varios subtítulos son placeholders sin sentido (`"{percent(x, max(x,1))}% del total"` → siempre 100%, `"Hoy"` hardcodeado, `"{min(3, n)} próximos"`).
- Secciones: "Solicitudes en revisión", "Historial de solicitudes", "Eventos Activos" (tarjeta con barra de ocupación + botones "Abrir Scanner" y "Gestionar" (**deshabilitado**, `title="Aún no implementado"`)).
- **Bug de aislamiento**: aunque `OrganizadorUI` filtra eventos por `organizerId`, el `KpiCard` "Ventas/Tickets/Check-ins" se calcula solo sobre `events` del organizador (OK aquí), pero:
- **`/api/organizador/dashboard`** (usado por el otro dashboard client y por refrescos) llama `getOrganizerDashboardStatsPgServer()` **sin `organizerId`** → devuelve stats de **todos los eventos de la plataforma**.
- Existe además `OrganizadorClient.tsx` (client component) que itera `EVENTS` (3 hardcodeados) y hace polling cada 12s + on-focus + `BroadcastChannel`. **Está huérfano** (no se renderiza desde ninguna ruta actual) pero se mantiene en el árbol.

### 6.2 Crear evento — `/organizador/eventos/nuevo` (`ui.tsx` `NuevoEventoClient`)

- Wizard de 4 pasos (Básico / Detalles / Tickets / Revisión) con preview de tarjeta en vivo (replica `EventCard`).
- Campos: título, ciudad, venue, fecha+hora (se compone ISO con offset local), **imagen (drag&drop, máx 1.5 MB, se convierte a data-URL base64)**, descripción, **un** ticket (nombre, precio, capacidad).
- Envía `multipart/form-data` a `POST /api/organizador/eventos/submit` → inserta `organizer_event_submissions` (`payload jsonb` con la imagen base64 dentro) → redirige a `/organizador`.
- **Problemas**:
  - Solo permite **1 tipo de entrada**. No hay preventa/general/VIP.
  - Imagen base64 en JSONB → filas enormes, payloads enormes, sin CDN, sin optimización, sin validación de dimensiones/ratio.
  - No hay banner/hero separado (el schema tiene `hero_desktop/mobile` pero el form no los captura).
  - No hay guardado de borrador; si recargas pierdes todo.
  - Tras enviar, el organizador **no puede editar ni retirar** la submission.

### 6.3 Editar evento

**No existe.** Botón "Gestionar" deshabilitado. No hay ruta `/organizador/eventos/[id]/editar`.

### 6.4 Precios / stock / fechas / ubicaciones / descripción / imágenes (post-creación)

**No editables.** Solo el admin puede publicar/despublicar. No hay UI para ajustar capacidad, precio o fecha después de crear.

### 6.5 Promociones

**No existe** ninguna funcionalidad de cupones, descuentos, códigos de acceso, listas de invitados o cortesías.

### 6.6 Ventas / asistentes

- Dashboard de pagos: `/organizador/pagos` (`page.tsx` + `PaymentsTableClient`).
  - Filtros GET: `eventId` (dropdown poblado con **`EVENTS` hardcodeado**), `status`, `q` (busca en id/hold/order/email/nombre/provider_ref), paginación.
  - Tarjetas por pago con estado, comprador, evento, montos, timestamps, `provider_ref`.
  - Acción "Revisar" = reconciliar sesión Stripe (`/api/payments/stripe/status`).
  - **Bug de aislamiento**: `getPaymentsDashboardPgServer` **no recibe `organizerId`** → cualquier organizador ve **todos los pagos de la plataforma**, con emails y nombres de compradores de otros organizadores.
- Asistentes: vía export CSV o vía el scanner. No hay tabla navegable de asistentes por evento en el panel.

### 6.7 Check-in / QR / Scanner — `/organizador/eventos/[id]/scanner`

- `page.tsx`: **`const event = EVENTS.find(e => e.id === id)`** → si no está en el array demo, `notFound()`. **El scanner solo funciona para `evt_001`, `evt_002`, `evt_003`.** Para eventos reales (id `evt_<hex>`), 404.
- `ui.tsx` `ScannerUI`: cámara (`QRScanner` con `@zxing`) + input manual. Valida contra `POST /api/demo/checkin`:
  - `/api/demo/checkin` **usa Postgres** (`UPDATE tickets SET status='USED'... WHERE status='VALID'`), parsea token `tc1.*` firmado, JSON, querystring o `tix_`.
  - **No verifica** que el operador sea el organizador dueño del evento (ni siquiera exige sesión — la ruta no está en el matcher del middleware).
  - Anti-spam: cooldown 1.5s + dedupe.
- KPIs del scanner (`/api/demo/event-stats`, `/api/demo/event-checkins`): Postgres, correctos, pero de nuevo sin comprobar propiedad del evento.
- Export CSV desde el scanner: `/api/demo/export` (abierto si `TICKETCHILE_EXPORT_SECRET` no está seteado, que es el caso).

### 6.8 Estadísticas

`organizer.pg.server.ts` calcula por evento: totales (capacity/sold/held/remaining/used/pending), breakdown por tipo, últimos check-ins, agregados de pagos. Hay versión "global" y versión "por organizador" (`...ByOrganizer`). El dashboard server usa la correcta; el endpoint `/api/organizador/dashboard` usa la global.

### 6.9 Exportaciones

`exportTicketsCsvPgServer` (filtros: status, ticketTypeId, rango de fechas, campo createdAt/usedAt, BOM UTF-8, escape anti-CSV-injection ✅) y `exportCheckinsCsvPgServer`. Correctas.

### 6.10 Configuración / pagos / liquidaciones

**No existe.** No hay: configuración de organizador, datos bancarios para payout, historial de liquidaciones, comisión de plataforma, facturación, gestión de staff/roles.

### 6.11 Resumen de estado del panel de organizador

| Función | Funciona | Incompleto | Duplicado | Lento | Demasiados pasos | Falta |
|---|---|---|---|---|---|---|
| Dashboard | ⚠️ (KPIs con placeholders) | ✔ | ✔ (2 impls) | ✔ (polling 12s recalcula todo) | | |
| Crear evento | ✔ | ✔ (1 solo ticket, imagen base64) | | | ✔ (wizard 9+4 pasos) | multi-tier, hero, borrador |
| Editar evento | | | | | | ✔ **todo** |
| Promociones | | | | | | ✔ **todo** |
| Ventas / pagos | ⚠️ (fuga entre organizadores) | | | | | payouts, comisiones |
| Asistentes | ⚠️ (solo CSV/scanner) | ✔ | | | | tabla navegable, reenvío masivo |
| Scanner / check-in | ❌ (solo 3 eventos demo) | ✔ | | ✔ (refresh por scan) | | multi-evento, roles de portero |
| Estadísticas | ✔ (server) / ⚠️ (endpoint global) | | ✔ | | | gráficos, comparativas |
| Exportaciones | ✔ | | | | | |
| Configuración / liquidaciones | | | | | | ✔ **todo** |
| Soporte | ❌ (404) | | | | | ✔ **todo** |

---

## 7. Panel administrador

Ruta base: `/admin` (grupo `(admin)`). **Sin layout, sin guard de servidor.** Todas las páginas son client components.

| Sección | Ruta | Estado real |
|---|---|---|
| Dashboard | `/admin` | ⚠️ Página con 2 secciones toggle: **Eventos** (tabs "Por confirmar" = submissions `IN_REVIEW`, "Confirmados" = `events` publicados) y **Organizadores** (tabs "Pendientes"/"Aprobados"). Botón "Aprobar" en cada fila. Sin métricas, sin totales, sin gráficos. |
| Usuarios (compradores) | — | ❌ **No existe.** El admin no puede ver ni gestionar `usuarios`. |
| Organizadores | `/admin` (tab) + `/admin/organizadores` (**página duplicada**, casi idéntica al tab) | ⚠️ Listar + aprobar. No editar, no suspender, no ver detalle, no ver eventos del organizador. |
| Eventos | `/admin` (tab) + `/admin/eventos/[id]` | ⚠️ Aprobar submission (crea evento + 1 ticket_type). Detalle: publicar/despublicar. **No editar** contenido, precios, capacidad. No rechazar con motivo (la columna `review_notes` existe pero no hay UI). |
| Ventas | — | ❌ **No existe.** |
| Pagos | — | ❌ **No existe** vista admin (el dashboard de pagos vive en `/organizador/pagos`). |
| Comisiones | — | ❌ **No existe** (no hay modelo de fee). |
| Soporte | — | ❌ **No existe.** |
| Reportes | — | ❌ **No existe.** |
| Configuración | — | ❌ **No existe.** |

**Estado global del panel admin: mínimo funcional para "aprobar organizadores y eventos", sin nada más, y sin seguridad real (§11).**

---

## 8. Diseño actual

### 8.1 Sistema visual

- **Tokens** (`globals.css` `:root`): `--background #0f0f10`, `--foreground #eef2f7`, `--surface`/`--surface-2` (blancos translúcidos), `--border rgba(255,255,255,.14)`, `--accent #ef4444` (rojo), `--accent-2 #b91c1c`, `--accent-soft`, `--shadow`. Expuestos a Tailwind v4 vía `@theme inline` (`--color-accent`, `--color-surface`, …).
- **Tipografía**: `Outfit` (Google Fonts vía `@import url(...)` en la primera línea del CSS — **render-blocking**, no usa `next/font`). El README dice "Geist" (residuo de `create-next-app`). `--font-sans: var(--font-geist-sans)` referencia una variable **que no existe**.
- **Fondo**: color sólido oscuro. Selección de texto y scrollbar tintados de rojo.

### 8.2 Componentes visuales

| Elemento | Implementación |
|---|---|
| Cards | Ad-hoc por sitio. Públicas: `rounded-[28px] border-white/10 bg-white/[0.04] backdrop-blur-2xl shadow-[0_22px_70px_...]`. Paneles organizador/admin: **fondo blanco** (`bg-white text-black`) sobre shell oscuro → contraste chocante. `components/ui/Card.tsx` (light, `border-zinc-200`) apenas se usa. |
| Botones | Sin componente `<Button>`. Cada botón repite clases. Variantes informales: blanco/negro, rojo `bg-[color:var(--accent)]`, "pill" con flecha, ghost `border-white/10 bg-white/5`. |
| Inputs | Sin componente. `rounded-xl border-white/10 bg-black/30 px-4 py-3 text-sm` repetido decenas de veces. En paneles: `border-black/10 bg-white`. |
| Select | Único primitivo real: `components/ui/select.tsx` (Radix, estilo glass oscuro). Solo lo usa `EventosFilters`. El resto usa `<select>` nativo. |
| Navegación / Header | `SiteHeader` (público, sticky, `bg-black/40 backdrop-blur`, logo `next/image`), header propio en cada layout de organizer/admin. Sin menú móvil (hamburguesa) — la nav se apila. |
| Footer | 3 footers distintos: inline en `(public)/layout.tsx`, inline en layouts de organizer, y `SiteFooter.tsx`/`components/public/SiteFooter.tsx` (roto, tokens inexistentes). |
| Modales | **No hay** sistema de modales/diálogos. Todo es páginas o `<details>`. |
| Tablas | Grids de 12 columnas a mano (`grid grid-cols-12`) en admin; tarjetas apiladas en pagos. Sin componente de tabla, sin orden/paginación reutilizable. |
| Dashboards | Barras de progreso `div` con `width: %`. Sin librería de charts. |
| Iconografía | `lucide-react` en checkout/algunos sitios; **emojis** (📅 🎟️ ⚠️ ✅) en organizer/admin. Inconsistente. |
| Animaciones / microinteracciones | Solo `transition`/`hover:` de Tailwind + `animate-spin` + un carrusel CSS translate. Sin framer-motion. |

### 8.3 ¿Existe un Design System real?

**No.** Hay *tokens* de color y una *estética* (dark glass + rojo) razonablemente consistente en la web pública, pero:
- No hay componentes reutilizables (Button, Input, Card, Badge, Table, Modal, Toast…).
- Los paneles internos rompen la estética (cards blancas, emojis).
- Hay 2 paletas (rojo/oscuro y morado en código huérfano) y clases fantasma (`bg-muted`).
- Spacing, radios (`rounded-xl` / `rounded-2xl` / `rounded-3xl` / `rounded-[22px]` / `rounded-[28px]`) y sombras se eligen ad-hoc.

### 8.4 Inconsistencias visuales concretas

- Web pública oscura vs paneles con cards blancas.
- `CheckoutBuyerForm` (rojo) vs `CheckoutClient.tsx` (morado, huérfano).
- Radios de card: al menos 5 valores distintos.
- Botón primario: a veces blanco sobre negro, a veces rojo.
- Emojis vs `lucide-react` según pantalla.
- Tres footers con contenido y estilo distintos.
- `text-white` forzado en `<body>` hace que las páginas admin (cards blancas) dependan de overrides locales.

---

## 9. Responsive / mobile

No se ejecutó test visual en dispositivos (fase de solo lectura), pero por análisis del markup:

| Breakpoint | Riesgos detectados |
|---|---|
| **390 px** | Header de organizer/admin: la nav (`Soporte`, `Crear Evento`, `Salir`) no colapsa → probable overflow horizontal. Grids `grid-cols-12` en `/admin` no tienen variante móvil → columnas comprimidas ilegibles. Tarjetas de pago (`PaymentsTableClient`) con `flex-wrap` deberían aguantar. Botón flotante `fixed` de `QuickBuyClient` ocupa todo el ancho. |
| **430 px** | Similar. `EventosFilters` usa `grid md:grid-cols-[1fr_220px_220px_120px]` → en móvil se apila (OK). |
| **768 px** | Punto de cambio `md:`. Checkout `lg:grid-cols-[1.2fr_0.8fr]` → en tablet una sola columna (OK). Wizard "Crear evento" `lg:grid-cols-[minmax(0,1fr)_340px]` → preview baja debajo (OK). |
| **1024 px** | `EventCard` grid `lg:grid-cols-3`. Detalle de evento `lg:grid-cols-[1.2fr_360px]`. Sticky sidebars (`lg:sticky lg:top-20`). Generalmente OK. |
| **1440 px** | `max-w-6xl`/`max-w-7xl` → contenido centrado, mucho margen lateral. El hero full-bleed (`w-screen`, `left-1/2 -translate-x-1/2`) puede generar **scroll horizontal** si hay scrollbar (técnica `-mx-[50vw]`/`w-screen` es frágil). |

**Problemas transversales:**
- **Sin menú móvil**: ninguna navegación tiene versión hamburguesa.
- **Tablas admin** (`grid-cols-12`) no son responsive → romper layout < 900 px.
- Técnicas full-bleed (`w-screen`, `-mx-[50vw]`) propensas a overflow-x; `(public)/layout.tsx` lo parchea con `overflow-x-hidden` en el wrapper.
- `/eventos` usa `-mx-6 -my-10` para escapar del `<main>` con padding — hack frágil.
- Inputs de cantidad (`h-9 w-9`) y `<select>` nativos: tamaño táctil justo pero aceptable.
- Formulario de checkout muy largo en móvil (nombre, RUT, teléfono, email ×2, región, comuna, dirección ×2, términos) sin agrupar en acordeones.

---

## 10. Performance

### 10.1 Rendering / red

- **Casi todo `dynamic = "force-dynamic"` + `Cache-Control: no-store`.** No hay ISR, no hay `revalidate`, no hay cache de datos. `/eventos` se renderiza entero en cada request y carga **todos** los eventos + N+1 de ticket_types.
- Home (`/`) sí es estática (○ en el build) pero por la razón equivocada: usa datos hardcodeados.
- `/api/events*` ejecuta `SELECT ... information_schema.columns` para detectar columnas (cacheado en `global.__ticketchile_*` pero con coste en cold start y en cada worker).
- Dashboard de organizador: polling `/api/organizador/dashboard` cada **12 s** + en `focus` + `visibilitychange` + `BroadcastChannel`; cada llamada **recalcula stats de toda la plataforma** (varias queries de agregación sin índices garantizados por el schema versionado).
- Scanner: tras **cada** scan hace `Promise.all` de stats + check-ins.
- `checkout/confirm`: polling cada 5 s hasta 45 s.

### 10.2 JS / bundles

- React Compiler activado (bien) pero muchos componentes conservan `useMemo`/`useRef`/`useCallback` manuales redundantes.
- `@zxing/library` (~1 MB) — correctamente aislado a la ruta del scanner.
- `CheckoutClient.tsx` (huérfano, ~900 líneas, morado) sigue en el árbol de tipos; conviene borrarlo.
- `next-auth/react` `SessionProvider` en el root → `useSession` en `SiteHeader` fuerza componente cliente en toda la cabecera pública.

### 10.3 Imágenes

- **Imágenes de eventos = data-URL base64 en Postgres** (`events.image`, `organizer_event_submissions.payload`). Esto:
  - infla filas y JSONB,
  - infla el HTML de `/eventos` y del detalle (cada `<img src="data:image/...;base64,...">` puede pesar cientos de KB),
  - impide `next/image`, CDN, `srcset`, formatos modernos.
- `sharp` está en `ignoredBuiltDependencies` → **optimización de imágenes de Next deshabilitada**. `EventCard` usa `<Image unoptimized>`. Detalle y hero usan `<img>` crudo.
- Fallback de imagen hardcodeado a una URL de **pexels.com** externa (`EventCard`, `HomeHeroCarousel`).

### 10.4 Queries

- N+1 en `listEventsDb` y `getEventBySlugDb`→ticket_types.
- Agregaciones de dashboard sin `LIMIT` real (traen hasta 200 filas de tickets/pagos para luego recortar en JS).
- Sondas `information_schema` repetidas.
- Sin índices garantizados (el schema versionado no coincide con la DB real; puede haber índices manuales o no).

### 10.5 Core Web Vitals (riesgos)

- **LCP**: hero como `<img>` sin dimensiones/`priority` real en algunos casos; Outfit vía `@import` bloquea render; imágenes base64 gigantes.
- **CLS**: heroes sin `aspect-ratio` reservado en todos los casos; cards sin placeholder.
- **INP**: polling agresivo + recomputo de estado en dashboards; `useSearchParams` + `router.push` con debounce en filtros (aceptable).
- **TTFB**: todo dinámico + queries pesadas por request.

---

## 11. Seguridad (revisión de código, sin explotación)

### 11.1 CRÍTICO — Bypass de autorización del panel de administrador

- `src/proxy.ts` protege `/admin/*` y `/api/admin/*` comprobando **únicamente** `req.cookies.get("tc_admin_sess")?.value.trim().length > 10`.
- **No valida la cookie contra `admin_sessions`.**
- Las rutas `/api/admin/events`, `/api/admin/organizers`, `/api/admin/events/[id]/approve|publish|unpublish`, `/api/admin/event/[id]` **no llaman a `getAdminFromSession`**.
- `(admin)/admin/*` son client components sin layout ni guard de servidor.
- **Impacto**: cualquiera que envíe una cookie `tc_admin_sess` de ≥ 11 caracteres arbitrarios obtiene acceso total al panel admin: listar submissions/eventos/organizadores, **aprobar organizadores**, **aprobar submissions (creando eventos publicados)**, publicar/despublicar eventos.
- **Mitigación**: `HttpOnly`/`Secure`/`SameSite=Lax` en la cookie legítima dificultan el robo, pero **no impiden la fabricación** de una cookie falsa desde un cliente.

### 11.2 ALTO — Falta de aislamiento multi-tenant (organizadores)

- `/api/organizador/dashboard` → `getOrganizerDashboardStatsPgServer()` **sin `organizerId`**: devuelve stats, check-ins recientes y **pagos con email/nombre de comprador** de **todos los eventos de la plataforma**.
- `/organizador/pagos` → `getPaymentsDashboardPgServer({ eventId, status, q })` **sin `organizerId`**: cualquier organizador ve/filtra/exporta **todos los pagos** de todos los organizadores.
- El dropdown de eventos en `/organizador/pagos` lista `EVENTS` (demo), pero el filtro `q` permite buscar por cualquier email/id.

### 11.3 ALTO — `/api/demo/tickets` expone tickets de cualquier email sin autenticación

- `GET /api/demo/tickets?email=<cualquiera>` (no está en el matcher del middleware, no valida sesión) devuelve `id`, `eventId`, `eventTitle`, `ticketTypeId`, `status`, `createdAt` de **todos los tickets de ese email**.
- Enumeración de PII + obtención de `ticketId`/`eventId` válidos para el siguiente punto.

### 11.4 MEDIO — Generación de QR de check-in para cualquier ticket

- `GET /api/qr?ticketId=X&eventId=Y` y `GET /api/demo/qr?...` **firman un token `tc1.*` válido para cualquier par ticketId/eventId** sin comprobar propiedad ni existencia.
- Combinado con 11.3: un tercero puede generar el QR real de tickets ajenos (y pases de Google Wallet). El daño directo es "denegación de entrada" (marcar USED) más que fraude económico, pero es suplantación de credencial de acceso.

### 11.5 MEDIO — Endpoint de check-in sin autenticación ni verificación de propiedad

- `/api/demo/checkin` **no está en `config.matcher`** de `proxy.ts` → público.
- No comprueba que el llamante sea el organizador dueño del evento (ni que haya sesión).
- Permite marcar `VALID → USED` cualquier ticket cuyo `id` se conozca (o adivine) para cualquier `eventId`.

### 11.6 MEDIO — Export de PII débilmente protegido

- `/api/demo/export` y `/api/demo/export-checkins` solo exigen `TICKETCHILE_EXPORT_SECRET` **si está seteado** (no lo está en `.env.local`). Sin él, el único control es el check de presencia de cookie del middleware.
- El CSV incluye `buyerName`, `buyerEmail`, `holdId`, `orderId` de todos los asistentes.

### 11.7 Manejo de precios y creación de tickets — **correcto**

- Webpay/Stripe/Flow/transferencia calculan el monto **server-side** desde `hold_items` (precio snapshoteado en la creación del hold desde `ticket_types.price_clp`). Flow además rechaza `amount_mismatch` si el cliente manda otro total.
- La emisión de tickets exige `payments.status = 'PAID'` (`requirePaidPayment`) en el flujo real; solo el modo demo (sin Stripe) emite sin pago.
- El QR es HMAC-SHA256 firmado (`verifyTicketToken` con `timingSafeEqual`). No se puede forjar el token sin `TICKETCHILE_QR_SECRET` — pero sí se puede **pedir uno legítimo** (11.4).

### 11.8 Webhooks

- **Stripe**: verifica firma (`stripe.webhooks.constructEvent`) + dedupe por `event.id`. ✅
- **Fintoc**: verifica HMAC `t.rawBody` con `timingSafeEqual` + dedupe. ✅ (aunque la integración está deshabilitada).
- **Flow**: verifica firma **solo si viene el parámetro `s`**; si no, confía en el `token` y re-consulta `getStatus` a Flow (aceptable, porque el estado se obtiene de Flow directamente). Dedupe por `token` como `event_id` (un token repetido bloquearía reprocesos legítimos, riesgo bajo).

### 11.9 Otros

- `NEXTAUTH_SECRET` cae a `""` si no está definido (`(process.env.NEXTAUTH_SECRET || "").trim()`) — inseguro si falta (está presente en env).
- No hay rate limiting en login (comprador/organizador/admin), signup, verify, resend, checkin.
- No hay CAPTCHA en registro.
- No hay recuperación de contraseña → los usuarios que olvidan quedan bloqueados; presión para reutilizar credenciales.
- `console.log` con email parcialmente enmascarado del comprador en `flow/create` (PII en logs).
- Cookies con `domain: .ticketchile.com` en prod — comparten entre subdominios (intencional para SSO, pero amplía superficie).
- `allowedDevOrigins` incluye `*.trycloudflare.com` (solo dev).
- `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy` — **no configurados** (ni en `next.config.*` ni en `proxy.ts`).
- `/api/dev/seed` bloqueado en producción ✅.
- Escape anti CSV injection en exports ✅.
- Sanitización de open-redirect en `signin` y `safeNextPath` ✅.

---

## 12. Errores y deuda técnica

Ver `TECH-DEBT.md` para el listado completo y accionable. Resumen:

- **`sql/schema.sql` obsoleto** (§3.2) — la deuda #1.
- **Monorepo roto**: sin `package.json` raíz (`.bak`), `apps/api` vacío, `packages/types` sin uso, `turbo`/`pnpm-workspace` inertes.
- **Dos `next.config`** (`.ts` y `.js`).
- **Ficheros de datos commiteados**: `.demo-db.json`, `.demo/db.json` (con `buyerEmail: "@"` y eventos que ni siquiera coinciden con `EVENTS`).
- **`.env.example` vacío** → configuración indocumentada; faltan variables (Flow, bootstrap admin, export secret, banco).
- **Código muerto / huérfano**: `src/organizer-auth.ts` (vacío), `apps/api/src/main.ts` (vacío), `lib/organizerAuth.server.ts`, `lib/storage.ts`, `CheckoutClient.tsx`, `OrganizadorClient.tsx`, `HomeHeroCarousel.tsx`, `EventInlineCheckout.tsx`, `CheckoutTicketSelector.tsx`, `CheckoutCustomerForm.tsx`, `QuickBuyClient.tsx`, `SuccessClient.tsx`, `components/public/SiteFooter.tsx`, `components/public/AuthButtons.tsx`, `components/ui/Card.tsx`, `/admin/organizadores` (dup del tab).
- **Duplicación**: 3× Flow, 3× emisión de tickets, 3× hash scrypt, 3× API de evento, 6× "release expired holds", `fetchQrPngBase64`/`autoEmailOrderTickets` copiadas 3×.
- **Tipos**: `any` en casi todo el mapeo de filas (`(r: any) => ...`), `(row: any)`, catch `(e: any)`. **302 errores ESLint** (mayoría `@typescript-eslint/no-explicit-any`).
- **`console.*`**: presentes en ~30 ficheros (checkin, flow, signup, webhooks…).
- **Mocks / hardcode**: `EVENTS` (3 eventos), `CHILE_REGIONES` (4 regiones), fallback pexels, `MAX_PER_TYPE`/`MAX_PER_ORDER` (8/10), TTL de hold (8/15 min según ruta), KPIs placeholder.
- **Comentarios informales en producción**: "te tocará llorar", "huele raro 😅", "no es brujería, es async", "cookie zombie", "(y sí, ya sé: falta el modo 'se ve caro' 😄)".
- **Sin tests, sin CI, sin Storybook, sin lint en el build** (Next 16 no ejecuta ESLint en `next build`).

---

## 13. Build

Ejecutado en `apps/web` (existe `.env.local`).

### 13.1 `next build`

| Escenario | Resultado |
|---|---|
| **Build limpio** (`rm -rf .next && next build`) | ✅ **ÉXITO.** "Compiled successfully". 10 páginas estáticas + ~60 rutas dinámicas + Proxy(Middleware). Sin warnings de compilación. |
| **Build incremental** (con `.next` previo) | ❌ **FALLA.** `.next/types/validator.ts` y `.next/dev/types/validator.ts` referencian rutas **sin los segmentos de route group** (`../../src/app/(organizer)/organizador/login/page.js` en vez de `.../(auth)/login/page.js`) → `TS2307: Cannot find module`. 10 errores, todos en ficheros generados. **Se resuelve borrando `.next`.** Posible quirq de typegen de Next 16 con route groups anidados — vigilar. |

### 13.2 TypeScript (`tsc --noEmit`)

- 10 errores, **todos** provenientes de `.next/**/validator.ts` (el mismo problema de artefacto stale de 13.1).
- **Cero errores en código fuente** de `src/`.

### 13.3 ESLint (`eslint .`)

- **338 problemas: 302 errores, 36 warnings.**
- Errores dominados por `@typescript-eslint/no-explicit-any` (prácticamente todos los ficheros de `lib/*.server.ts` y rutas API).
- Warnings: `@next/next/no-img-element` (`<img>` en detalle/hero/ticket card/preview), `@typescript-eslint/no-unused-vars` (`err`, `_`), 1× "Unused eslint-disable directive" en `lib/db.ts`.
- **No bloquea el build** (Next 16 eliminó el lint automático en `next build`).
- `npm run lint` (= `eslint`) funciona. `turbo lint` a nivel raíz **no funciona** (sin `package.json` raíz).

---

## 14. Inventario de pantallas

Ver `UI-INVENTORY.md` (completo, clasificado PUBLIC / AUTH / CUSTOMER / ORGANIZER / ADMIN / INTERNAL).

---

## 15. Preparación del rediseño

Ver `REDESIGN-SCOPE.md` (conservar / rediseñar / refactorizar / eliminar / reconstruir desde cero).

---

## Resumen final solicitado

**1. Estado general** — App funcional en su flujo núcleo (comprar→pagar→QR→escanear) y con `build` limpio, pero con seguridad de administración rota, sin aislamiento entre organizadores, schema de DB no versionado, monorepo abandonado y deuda técnica alta. Nivel: *prototipo avanzado / MVP frágil*, no listo para producción sin trabajo estructural.

**2. Stack detectado** — Next.js 16.1.1 (App Router, Turbopack, React Compiler) · React 19.2.3 · TypeScript 5.9 (strict) · Tailwind CSS v4 (sin config) · Postgres vía `pg` crudo (sin ORM/migraciones) · NextAuth v4 (compradores) + auth propia (organizador/admin) · Pagos: Stripe, Transbank Webpay, Flow (sin claves), Fintoc (off), transferencia manual · Resend (email) · `qrcode` + HMAC (QR) · `@zxing` (scanner) · `jsonwebtoken` (Google Wallet) · `lucide-react` + 1 primitivo Radix.

**3. Arquitectura** — Monorepo pnpm/turbo **inoperante** (sin `package.json` raíz); la app real es `apps/web`. App Router con route groups `(public)/(organizer)/(admin)`. Middleware `proxy.ts`. Sin capas de dominio: lógica repartida entre `lib/*.pg.server.ts`, rutas API (mucha duplicada inline) y server components. Acceso a datos con SQL crudo. Convive una capa "demo" en JSON con la capa Postgres.

**4. Funcionalidades existentes** — Registro/login/verificación de compradores (+ Google); registro multi-paso + OTP + aprobación de organizadores; auth de admin; listado/detalle de eventos (DB); carrito + holds con expiración; checkout con Webpay/Stripe/transferencia; emisión idempotente de órdenes+tickets; QR firmado (PNG, email inline, Google Wallet); "Mis tickets" + reenvío; scanner con cámara; dashboard de organizador (KPIs, submissions, ocupación); dashboard de pagos con filtros y export CSV; panel admin para aprobar organizadores y eventos, publicar/despublicar.

**5. Funcionalidades incompletas** — Editar evento (inexistente); múltiples tipos de entrada (solo 1 al crear); hero/banner en creación; borrador de evento; recuperación de contraseña (los 3 roles); scanner para eventos reales (solo 3 demo); aislamiento de datos por organizador; promociones/cupones/cortesías; liquidaciones/comisiones; gestión de compradores en admin; reportes/ventas globales admin; soporte (`/organizador/soporte` = 404); Flow (sin claves); Fintoc (deshabilitado); páginas legales/contacto/FAQ/perfil; menú móvil.

**6. Problemas graves** — (a) **Bypass total del panel admin** vía cookie fabricada (`proxy.ts` solo mira longitud; APIs admin sin validación). (b) **Fuga de datos entre organizadores** (dashboard y pagos devuelven todo). (c) `/api/demo/tickets?email=` público → PII + IDs de ticket. (d) `/api/qr` genera QR válido para cualquier ticket ajeno. (e) `/api/demo/checkin` público, sin verificar propiedad del evento. (f) **schema SQL versionado no coincide con la DB real** → despliegues impredecibles. (g) Scanner roto para eventos reales.

**7. Problemas de UX** — Dos temas visuales (rojo/oscuro vs morado huérfano); cards blancas en paneles sobre shell oscuro; sin Design System (cero componentes reutilizables); copys jocosos en producción; 3 footers distintos; clases Tailwind inexistentes (`bg-muted`); sin menú móvil; formulario de checkout larguísimo sin agrupar; KPIs con textos placeholder sin sentido; wizard de registro de organizador de 9 pasos.

**8. Problemas mobile** — Sin navegación hamburguesa en ningún layout; tablas admin `grid-cols-12` sin variante responsive; heroes full-bleed (`w-screen`/`-mx-[50vw]`) propensos a scroll horizontal; `/eventos` con hack `-mx-6 -my-10`; botón flotante `fixed` full-width; formularios largos sin acordeón.

**9. Problemas técnicos** — Dos `next.config`; monorepo sin raíz; imágenes como base64 en Postgres; `sharp`/optimización de imágenes deshabilitada; N+1 en listados; todo `force-dynamic`/`no-store` (sin caché); polling agresivo en dashboards; sondas `information_schema` en cada request de eventos; fuente vía `@import` render-blocking; 3 implementaciones de Flow y de emisión de tickets; 3 codificaciones de hash scrypt; build incremental roto por typegen de route groups.

**10. Deuda técnica** — 302 errores ESLint (`any` omnipresente); `console.*` en ~30 ficheros; ~15 componentes/módulos huérfanos; datos y credenciales de prueba commiteados (`.demo-db.json`, `.demo/db.json`); `.env.example` vacío; sin tests, sin CI, sin Storybook; hardcodes (`EVENTS`, 4 regiones, TTLs, límites); comentarios informales; `packages/types` y `bcryptjs` sin uso.

**11. Riesgos** — (a) Seguridad: acceso admin trivial de fabricar; datos de compradores expuestos entre organizadores y públicamente. (b) Datos: sin migraciones ni schema fiable, cualquier cambio puede romper prod; imágenes base64 harán crecer la DB sin control. (c) Operativo: el check-in no funciona para eventos reales — el producto no es usable en puerta hoy. (d) Financiero: sin modelo de comisión ni liquidaciones, no hay negocio monetizable implementado. (e) Legal: sin páginas de términos/privacidad reales pese a pedir aceptación; PII en logs. (f) Mantenibilidad: triple duplicación de integraciones de pago/emisión hace que un fix haya que aplicarlo 3 veces.

**12. Qué conservar** — El modelo de dominio conceptual (events / ticket_types / holds / hold_items / orders / tickets / payments con contadores y estados); la lógica idempotente de `checkout.pg.server.ts` (`finalizeHoldToOrderCoreTx`); la firma HMAC de QR (`qr-token.server.ts`); el patrón hold con expiración y liberación de `held`; el verificador de webhooks de Stripe/Fintoc; el parser flexible de QR del check-in; la estética base (dark + rojo, tokens de color); el árbol de rutas de la web pública.

**13. Qué reconstruir** — Capa de autenticación y roles (unificar en un solo sistema, sesiones validadas siempre, RBAC real, recuperación de contraseña, rate limiting); guardas de servidor para admin y aislamiento multi-tenant para organizadores; schema de base de datos + herramienta de migraciones (Drizzle o Prisma); almacenamiento de imágenes (blob/CDN, no base64); Design System (Button/Input/Card/Table/Modal/Toast/Badge/Tabs); panel de organizador (dashboard real, editar evento, multi-tier de entradas, promociones, asistentes, liquidaciones); panel de administrador (usuarios, organizadores, eventos editables, ventas, comisiones, reportes, soporte, config); una sola integración por proveedor de pago; scanner conectado a DB para cualquier evento con verificación de propiedad; navegación móvil; páginas legales/contacto/perfil.

**14. Recomendaciones para el nuevo PRD**

1. **Definir el modelo de negocio primero**: comisión de plataforma, quién cobra (split payments vs payout diferido), moneda, impuestos/boletas.
2. **Un solo sistema de identidad** con roles `buyer | organizer | staff | admin` (y `organizer` puede tener múltiples `staff`/porteros por evento). Sesiones siempre validadas contra store. Password reset + verificación + 2FA opcional para organizador/admin + rate limiting + CAPTCHA en signup.
3. **Schema + migraciones desde el día 1** (Drizzle recomendado con `pg`). Reconstruir el schema real observando la DB actual antes de migrar datos.
4. **Multi-tenant estricto**: toda query de organizador filtrada por `organizer_id` (o `event_id ∈ eventos del organizador`); tests que lo verifiquen.
5. **Entradas**: soportar N tipos por evento, con ventanas de venta (preventa/general), límites por orden configurables, y opción de "sin asiento" vs mapa (fuera de alcance v1).
6. **Promociones**: códigos de descuento (% o monto), cortesías/lista de invitados, límite de usos.
7. **Gestión de evento**: crear como borrador → publicar; editar mientras no haya ventas (o con reglas); imágenes a blob storage con `next/image`; hero + poster separados.
8. **Pagos**: elegir 1–2 proveedores (Webpay + 1 de transferencia) y **una** implementación limpia por proveedor detrás de una interfaz `PaymentProvider`. Reconciliación y reintentos centralizados. Emisión de tickets en **un** módulo idempotente.
9. **Check-in**: PWA de portero conectada a la DB, offline-first opcional, roles de portero por evento, log de accesos, anti-repetición server-side. Reemplaza el scanner actual.
10. **Liquidaciones**: dashboard de organizador con ventas netas, fee, saldo a liquidar, historial de payouts; export contable.
11. **Admin**: usuarios, organizadores (aprobar/suspender/ver detalle), eventos (editar/rechazar con motivo), ventas globales, pagos/reembolsos, comisiones configurables, tickets de soporte, feature flags/config.
12. **Design System** como paquete (`packages/ui`) — resucitar el monorepo *de verdad* o colapsar a una sola app. Tokens, componentes, dark mode coherente, mobile-first con navegación colapsable.
13. **Observabilidad**: quitar `console.*`, añadir logger estructurado, Sentry, y analytics de producto (embudo de checkout).
14. **Cumplimiento**: páginas de Términos, Privacidad, política de reembolsos, y datos de contacto/empresa reales; boleta/factura si aplica.
15. **Calidad**: TypeScript sin `any` en la capa de datos (tipos generados por la herramienta de migraciones), ESLint en CI, tests de los flujos de pago y de aislamiento multi-tenant, previews por PR.
16. **Rendimiento**: caché/ISR para catálogo de eventos, imágenes en CDN, eliminar polling (usar revalidación puntual o websockets solo donde aporte), `next/font`.
17. **Limpieza previa**: borrar código muerto (§12), `.demo*`, `apps/api`, un solo `next.config`, `.env.example` completo.
