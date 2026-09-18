# TECH-DEBT — TicketChile.com

Listado accionable de deuda técnica, errores potenciales, código muerto y duplicación.
Severidad: 🔴 crítico · 🟠 alto · 🟡 medio · ⚪ bajo/cosmético.

---

## 1. Estructura / build / configuración

| # | Sev | Item | Detalle | Acción sugerida |
|---|---|---|---|---|
| 1.1 | 🟠 | Monorepo sin raíz | `package.json` raíz renombrado a `package.json.bak`. `turbo dev/build/lint/typecheck` no funcionan. `pnpm-workspace.yaml` solo en `apps/web` con `packages: ["."]`. | Decidir: colapsar a una sola app, o restaurar el monorepo de verdad (`packages/ui`, `packages/db`). |
| 1.2 | 🟡 | Dos `next.config` | `next.config.ts` (`reactCompiler`) y `next.config.js` (`turbopack.root`, `allowedDevOrigins`). Next carga uno solo. | Unificar en `next.config.ts`. |
| 1.3 | 🟡 | Build incremental roto | Con `.next` previo, `next build` y `tsc` fallan: `.next/types/validator.ts` referencia rutas sin los route groups `(auth)`/`(panel)` → `TS2307`. Se arregla con `rm -rf .next`. | Añadir `rm -rf .next` al pipeline de CI; reportar a Next si persiste con build limpio + edición. |
| 1.4 | 🟠 | `.env.example` vacío | Cero documentación de configuración. Faltan `FLOW_API_KEY/SECRET`, `ADMIN_BOOTSTRAP_*`, `TICKETCHILE_EXPORT_SECRET`, `TRANSFER_BANK_*`, `FROM_EMAIL`, `DATABASE_POOL_MAX`. | Escribir `.env.example` completo con comentarios. |
| 1.5 | 🟡 | Datos de prueba commiteados | `apps/web/.demo-db.json` (con `buyerEmail: "@"` y eventos "Festival Summer Chile"/"Urbano Vibes" que **ni siquiera coinciden** con `EVENTS`), `apps/web/.demo/db.json`. | Borrar y añadir a `.gitignore`. |
| 1.6 | ⚪ | `apps/api/src/main.ts` vacío | Proyecto backend abandonado. | Borrar `apps/api`. |
| 1.7 | ⚪ | `packages/types` sin uso | `@ticketchile/types` no lo importa nadie; los tipos se redefinen en `lib/events.ts`. | Borrar o convertir en la fuente única de tipos. |
| 1.8 | 🟡 | `sharp` en `ignoredBuiltDependencies` | Optimización de imágenes de Next deshabilitada. | Habilitar + mover imágenes fuera de la DB. |
| 1.9 | ⚪ | `README.md` = boilerplate | Habla de Geist y `create-next-app`. Contenido irrelevante. | Reescribir. |
| 1.10 | ⚪ | `tools/make-admin-hash.js` | Script suelto con codificación scrypt distinta a la de `admin-auth.pg.server.ts` (params N/r/p vs default). | Consolidar en un CLI del proyecto. |

---

## 2. Base de datos

| # | Sev | Item | Detalle | Acción |
|---|---|---|---|---|
| 2.1 | 🔴 | `sql/schema.sql` obsoleto | Faltan tablas (`usuarios`, `admin_users`, `admin_sessions`, `organizer_verifications`) y columnas (`events.is_published`, `organizer_users.{email,phone,verified,approved}`, `orders.buyer_*`, `tickets.{ticket_type_id,emailed_at,emailed_to}`, `ticket_types.{slug,max_per_order}`, `payments.buyer_*`). Ver `AUDIT §3.2`. | Reconstruir el schema desde la DB real; adoptar migraciones (Drizzle/Prisma). |
| 2.2 | 🟠 | Sin herramienta de migraciones | Todo por `apply-schema.mjs` + ALTERs manuales no versionados. | Migraciones versionadas + CI. |
| 2.3 | 🟠 | Imágenes como base64 en Postgres | `events.image` y `organizer_event_submissions.payload.image` guardan data-URLs. Filas y payloads enormes. | Blob storage + `next/image`. |
| 2.4 | 🟡 | Sondas `information_schema` en runtime | `/api/events*` consulta columnas existentes en cada cold start (cacheado en `global`). | Eliminar con schema fiable. |
| 2.5 | 🟡 | Fallbacks try/catch por columnas ausentes | `checkout.pg.server.ts` intenta SELECT/INSERT "nuevo" y cae a "antiguo" si falla. Oculta drift de schema. | Eliminar con schema fiable. |
| 2.6 | 🟡 | N+1 | `listEventsDb`, `getEventBySlugDb`, `getEventByIdDb` cargan `ticket_types` en bucle. | JOIN + agregación. |
| 2.7 | ⚪ | Agregados sin `LIMIT` efectivo | Dashboard trae hasta 200 filas de tickets/pagos y recorta en JS. | Paginar en SQL. |
| 2.8 | ⚪ | `webhook_events` con `token` como `event_id` (Flow) | Un token repetido bloquea reproceso legítimo. | Usar id de evento del proveedor o clave compuesta con timestamp. |

---

## 3. Autenticación / seguridad (cross-ref `AUDIT §11`)

| # | Sev | Item | Acción |
|---|---|---|---|
| 3.1 | 🔴 | Admin sin validación de sesión (middleware solo mira longitud; APIs admin no revalidan) | Guard server + `getAdminFromSession` en toda ruta `/api/admin/*` + layout `(admin)`. |
| 3.2 | 🟠 | Sin aislamiento multi-tenant (`/api/organizador/dashboard`, `/organizador/pagos` devuelven todo) | Filtrar siempre por `organizer_id`. Tests. |
| 3.3 | 🟠 | `/api/demo/tickets?email=` público expone tickets/PII de cualquiera | Requerir sesión; devolver solo lo del usuario. |
| 3.4 | 🟡 | `/api/qr` y `/api/demo/qr` firman token para cualquier ticket ajeno | Verificar propiedad (sesión) antes de firmar. |
| 3.5 | 🟡 | `/api/demo/checkin` no está en el matcher del middleware | Añadir al matcher + verificar que el operador es dueño/portero del evento. |
| 3.6 | 🟡 | Export de PII abierto si `TICKETCHILE_EXPORT_SECRET` no seteado | Requerir sesión de organizador dueño; quitar el "demo abierto". |
| 3.7 | 🟠 | Sin recuperación de contraseña (3 roles) | Implementar reset por email. |
| 3.8 | 🟡 | Sin rate limiting en login/signup/verify/resend/checkin | Añadir (upstash/redis o middleware). |
| 3.9 | 🟡 | Sin cabeceras de seguridad (CSP, HSTS, X-Frame-Options, Referrer-Policy) | Configurar en `next.config` / `proxy.ts`. |
| 3.10 | 🟡 | 3 codificaciones scrypt distintas (hex / b64 / b64url) + `tools/make-admin-hash.js` con params propios | Un solo módulo de credenciales (argon2id recomendado). |
| 3.11 | ⚪ | `NEXTAUTH_SECRET` cae a `""` si falta | `throw` si no está definido. |
| 3.12 | ⚪ | `console.log` con email de comprador (enmascarado) en `flow/create` | Logger estructurado, sin PII. |
| 3.13 | ⚪ | Cookies legacy leídas "por si acaso" (`organizer_session`, `tc_org_session`, `tc_org_user`) | Eliminar tras migración. |

---

## 4. Código muerto / huérfano

| Fichero | Motivo | Acción |
|---|---|---|
| `apps/web/src/organizer-auth.ts` | vacío | borrar |
| `apps/api/src/main.ts` | vacío | borrar (con `apps/api`) |
| `apps/web/src/lib/organizerAuth.server.ts` | HMAC cookie `tc_org_user`, sin uso (superado por DB sessions) | borrar |
| `apps/web/src/lib/storage.ts` | fallback localStorage de orders/tickets/checkins | borrar |
| `apps/web/src/lib/demo-db.server.ts` | "DB" JSON legacy (aún referenciada por `demo/stats`, `demo/cart-hold*`, `demo/reset`, `paid-order` fallback) | migrar esas rutas a PG y borrar |
| `apps/web/src/app/(public)/checkout/[eventId]/CheckoutClient.tsx` | ~900 líneas, tema morado, usa API DPA real; **no se renderiza** | borrar |
| `apps/web/src/app/(organizer)/organizador/OrganizadorClient.tsx` | dashboard client sobre `EVENTS`, no se renderiza | borrar |
| `apps/web/src/app/(public)/checkout/success/SuccessClient.tsx` | apenas usado | revisar / borrar |
| `apps/web/src/app/(public)/signin/signin-buttons.tsx` | botón Google suelto | borrar |
| `apps/web/src/components/HomeHeroCarousel.tsx` | superado por `HomeHeroRotator` | borrar |
| `apps/web/src/components/EventInlineCheckout.tsx` | selector de tickets alternativo, sin uso | borrar |
| `apps/web/src/components/CheckoutTicketSelector.tsx` | selector alternativo (flujo Stripe directo), sin uso | borrar |
| `apps/web/src/components/CheckoutCustomerForm.tsx` | form alternativo, sin uso | borrar |
| `apps/web/src/app/(public)/eventos/[slug]/QuickBuyClient.tsx` | selector alternativo, sin uso | borrar |
| `apps/web/src/components/public/SiteFooter.tsx` | huérfano + roto (`bg-muted` inexistente) | borrar |
| `apps/web/src/components/public/AuthButtons.tsx` | huérfano (SiteHeader tiene su lógica) | borrar |
| `apps/web/src/components/ui/Card.tsx` | light theme, casi sin uso | borrar o integrar al DS |
| `apps/web/src/app/(admin)/admin/organizadores/page.tsx` | duplicado del tab de `/admin` | borrar |
| `apps/web/src/lib/seed.pg.server.ts` + `/api/dev/seed` | dev-only, siembra los 3 eventos demo | mantener solo si hay entorno de dev; documentar |

---

## 5. Duplicación

| # | Item | Ubicaciones | Acción |
|---|---|---|---|
| 5.1 | Integración Flow | `lib/flow.ts`, `api/payments/flow/_lib/flow.ts`, inline en `flow/confirm/route.ts` | 1 módulo `lib/payments/flow.ts` |
| 5.2 | Emisión de order+tickets | `checkout.pg.server.finalizeHoldToOrderCoreTx`, `flow/confirm.finalizePaidPayment`, `flow/return.finalizePaidPayment` | usar solo `finalizeHoldToOrderCoreTx` (idempotente, con fallbacks) en todos los webhooks |
| 5.3 | Hash scrypt | `auth.ts`, `admin-auth.pg.server.ts`, `organizer-auth.pg.server.ts`, `organizerAuth.server.ts`, `tools/make-admin-hash.js` | 1 módulo `lib/credentials.ts` |
| 5.4 | API de evento | `/api/events?slug=`, `/api/events/by-slug/[slug]`, `/api/events/[id]` | 1 handler + `lib/events.server.ts` |
| 5.5 | "release expired holds" | webpay/create, stripe/create, transfer/create, `hold.pg.server`, `availability.pg.server`, `checkout.pg.server` | 1 función `releaseExpiredHolds(client)` |
| 5.6 | `fetchQrPngBase64` + `autoEmailOrderTickets` | `flow/return/route.ts`, `payments/status/route.ts`, (`tickets/resend` variante) | 1 módulo `lib/emails/tickets.ts` |
| 5.7 | Selectores de tickets | `EventTicketSelector` (vivo) + `EventInlineCheckout` + `CheckoutTicketSelector` + `QuickBuyClient` | 1 componente parametrizable |
| 5.8 | Dashboards de organizador | `OrganizadorUI` (vivo) + `OrganizadorClient` | 1 |
| 5.9 | Heroes | `HomeHeroRotator` (vivo) + `HomeHeroCarousel` | 1 |
| 5.10 | Google Wallet | `lib/google-wallet.server.ts` + inline en `wallet/google/save-url/route.ts` | usar el lib |
| 5.11 | Footers | inline `(public)/layout.tsx` + inline layouts organizer + `SiteFooter.tsx` | 1 componente |
| 5.12 | Validación RUT/teléfono/email | reimplementada en `CheckoutClient.tsx` y `CheckoutBuyerForm.tsx` (funciones casi iguales) | `lib/cl/{rut,phone,email}.ts` |
| 5.13 | Regiones/comunas de Chile | `CHILE_REGIONES` (4 regiones, `CheckoutBuyerForm`) vs API DPA (`CheckoutClient` huérfano) | dataset completo o proxy interno a DPA |

---

## 6. Tipos / lint

| # | Sev | Item | Detalle |
|---|---|---|---|
| 6.1 | 🟠 | **302 errores ESLint** | Mayoría `@typescript-eslint/no-explicit-any` en `lib/*.server.ts` y rutas API (`(r: any) => ...`, `catch (e: any)`, `(row: any)`). |
| 6.2 | 🟡 | 36 warnings ESLint | `@next/next/no-img-element` (detalle, hero, `TicketCard`, preview de "nuevo evento"), `no-unused-vars` (`err`, `_`), "Unused eslint-disable" en `lib/db.ts`. |
| 6.3 | 🟡 | Lint no corre en `next build` (Next 16) | Añadir `eslint` a CI como gate. |
| 6.4 | ⚪ | `tsconfig` incluye `.next/**/*.ts` | Provoca los 10 errores de typegen en `tsc`; considerar excluir o limpiar antes. |
| 6.5 | ⚪ | `any` en el mapeo de filas de `pg` | Sin tipos de fila (sin ORM). Resolver con Drizzle/tipos generados. |

---

## 7. Runtime / lógica

| # | Sev | Item | Detalle | Acción |
|---|---|---|---|---|
| 7.1 | 🔴 | Scanner solo para 3 eventos | `scanner/page.tsx` hace `EVENTS.find(id)`. Eventos reales → 404. | Cargar evento desde DB + verificar propiedad. |
| 7.2 | 🟠 | Home usa `EVENTS` hardcodeado | La home no refleja el catálogo real. | `listEventsDb()` + ISR. |
| 7.3 | 🟠 | `/organizador/pagos` dropdown usa `EVENTS` | Solo lista 3 eventos demo. | Cargar eventos del organizador. |
| 7.4 | 🟡 | Fintoc a medias | `create` responde 410 pero la UI (`CheckoutBuyerForm`, `CheckoutCustomerForm`) sigue ofreciéndolo; webhook activo. | Quitar de la UI o reactivar completo. |
| 7.5 | 🟡 | Flow sin claves en env | Es la opción por defecto en `CheckoutClient` (huérfano) y una opción visible en `CheckoutBuyerForm`. Falla en runtime. | Configurar o quitar de la UI. |
| 7.6 | 🟡 | Rutas `/api/events*` no filtran `is_published` | Se pueden consultar eventos no publicados vía API pública (las páginas server sí filtran). | Añadir `WHERE is_published = true` (o parámetro admin). |
| 7.7 | 🟡 | TTL de hold inconsistente | 8 min (webpay/stripe/transfer/hold), 15 min (flow). `clamp(60, 3600)` en `hold.pg.server`. | Constante única. |
| 7.8 | 🟡 | Polling agresivo | Dashboard organizador (12s + focus + BroadcastChannel), scanner (post-scan), confirm (5s/45s). | Revalidación puntual / SSE donde aporte. |
| 7.9 | 🟡 | Todo `force-dynamic` + `no-store` | Sin caché en absolutamente nada. | ISR para catálogo. |
| 7.10 | 🟡 | Registro de organizador: 9 pasos | Fricción alta; `orgType` capturado pero **no se guarda**. | Reducir a 3–4 pasos. |
| 7.11 | ⚪ | KPIs con placeholders | `"{percent(x, max(x,1))}%"` (siempre 100%), `"Hoy"`, `"{min(3,n)} próximos"`. | Calcular de verdad o quitar subtítulos. |
| 7.12 | ⚪ | Creación de evento: 1 solo tipo de entrada | El form solo pide un ticket base. | Multi-tier. |
| 7.13 | ⚪ | `checkout` pide "aceptar términos" sin link a términos | Y no hay página de términos. | Crear página + enlazar. |
| 7.14 | ⚪ | `sql/schema.sql` `users` vs código `usuarios` | Nombre distinto → el `apply-schema` crea una tabla que nadie usa. | Alinear. |

---

## 8. Contenido / tono

| # | Item |
|---|---|
| 8.1 | Comentarios y copys informales en producción: "te tocará llorar (o arreglarlo en DB)", "Ese email huele raro 😅", "no es brujería, es async", "cookie zombie", "aunque nervioso", `SiteFooter`: "(y sí, ya sé: falta el modo 'se ve caro' 😄)", "Pagos seguros con Stripe" (cuando Stripe no es el método principal). |
| 8.2 | Emojis mezclados con `lucide-react` según pantalla. |
| 8.3 | `console.*` en ~30 ficheros con prefijos de debug (`[checkin] incoming`, `[flow:create][in]`, `[auth:signup] ...`). |

---

## 9. Testing / calidad

| # | Item |
|---|---|
| 9.1 | **Cero tests** (unit, integración, e2e). |
| 9.2 | **Sin CI** (no hay `.github/workflows`, no hay config de Vercel checks visible en el repo). |
| 9.3 | Sin Storybook / catálogo de componentes. |
| 9.4 | Sin logging estructurado ni error tracking (Sentry). |
| 9.5 | Sin analytics de producto (embudo de checkout). |
