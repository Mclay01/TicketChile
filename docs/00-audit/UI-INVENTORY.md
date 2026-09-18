# UI-INVENTORY — TicketChile.com

Inventario de **todas** las pantallas/rutas. Clasificación:
`PUBLIC` · `AUTH` · `CUSTOMER` · `ORGANIZER` · `ADMIN` · `INTERNAL` (API/técnica).

---

## PUBLIC

| Ruta | Objetivo | Componentes | Datos | Estado | Notas |
|---|---|---|---|---|---|
| `/` | Home: hero rotativo + filtros + grid | `HomeHeroRotator`, `HeroBanner`, `EventosFilters`, `EventCard` | `EVENTS` hardcodeado (3) | Funcional, **desconectado de la DB** | Estática en el build. |
| `/eventos` | Catálogo con búsqueda / ciudad / orden / paginación (9/pág) | `EventosFiltersSuspense`, `EventCard` | DB (`listEventsDb`, `is_published`) | Funcional | N+1; filtra/pagina en memoria; hack `-mx-6 -my-10`. |
| `/eventos/[slug]` | Detalle de evento + selector de entradas | `EventTicketSelector` | DB (`getEventBySlugDb`) | Funcional | `<img>` crudo; anchors `#tickets`/`#info`; `MAX_PER_TYPE=10`. |
| `/checkout/[eventId]` | Datos del comprador + método de pago | `CheckoutBuyerForm` | DB (`getEventByIdDb`) | Funcional (Webpay/Stripe/transferencia) | Ofrece Fintoc (410) y Flow (sin claves); regiones = 4 hardcodeadas. |
| `/checkout/confirm` | Confirmación / polling de pago / emisión | `CheckoutConfirmClient` | `/api/payments/status` · `/api/payments/stripe/status` | Funcional | Polling 5s/45s; reenvío por email; Google Wallet (1er ticket). |
| `/checkout/success` | Compatibilidad — redirige a `/checkout/confirm` | (`SuccessClient` casi sin uso) | — | Funcional | Página placeholder. |

**Legales / contacto / FAQ / categorías / perfil público** → **NO EXISTEN.**

---

## AUTH

| Ruta | Rol | Componentes | Backend | Estado | Notas |
|---|---|---|---|---|---|
| `/signin` | Comprador | `SignInClient` (`ui.tsx`) | NextAuth (`credentials`, `google`) | Funcional | Banners por query; copys informales. |
| `/signup` | Comprador | `SignupClient` (`ui.tsx`) | `POST /api/auth/signup` | Funcional | Sin captcha; política de pass mínima. |
| `/signin` (`signin-buttons.tsx`) | — | — | — | **Huérfano** | Botón Google suelto, sin uso. |
| `/organizador/login` | Organizador | `OrganizerLoginClient` | `POST /api/organizador/login` | Funcional | Valida verified + approved. |
| `/organizador/registro` | Organizador | inline (`registro/page.tsx`) | `POST /api/organizador/register` | Funcional | **Wizard de 9 pasos**. |
| `/organizador/verificar` | Organizador | `OrganizerVerifyClient` | `POST /api/organizador/verify` | Funcional | OTP 6 dígitos, 10 min. |
| `/admin/login` | Admin | `AdminLoginClient` | `POST /api/admin/login` | Funcional | — |

**Recuperación de contraseña** → **NO EXISTE** para ningún rol.

---

## CUSTOMER

| Ruta | Objetivo | Componentes | Backend | Estado | Notas |
|---|---|---|---|---|---|
| `/mis-tickets` | Ver tickets propios + QR + reenviar + Google Wallet | `MisTicketsClient` → `TicketCard` | `GET /api/tickets` (sesión) | Funcional | `page.tsx` redirige a `/signin`; `ui.tsx` tiene "fallback por email" (mitigado). |

**Perfil / editar datos / historial de órdenes / cancelar-transferir ticket** → **NO EXISTEN.**

---

## ORGANIZER

Todas bajo `/organizador` (grupo `(panel)`, guard de servidor en el layout).

| Ruta | Objetivo | Componentes | Backend | Estado | Problemas |
|---|---|---|---|---|---|
| `/organizador` | Dashboard: KPIs + submissions + eventos activos | `OrganizadorUI` (`ui.tsx`) | `organizer.pg.server` (por organizador) | Funcional | KPIs con subtítulos placeholder; "Gestionar" deshabilitado. |
| `/organizador/eventos/nuevo` | Crear evento (wizard 4 pasos + preview) | `NuevoEventoClient` (`ui.tsx`) | `POST /api/organizador/eventos/submit` | Funcional | **1 solo tipo de entrada**; imagen base64; sin hero; sin borrador. |
| `/organizador/eventos/[id]/scanner` | Escanear QR en puerta + KPIs + check-ins + export | `ScannerUI` (`ui.tsx`), `QRScanner` | `POST /api/demo/checkin`, `/api/demo/event-stats`, `/api/demo/event-checkins`, `/api/demo/export` | **ROTO** para eventos reales | `page.tsx` hace `EVENTS.find(id)` → 404 si no es `evt_001/002/003`. Sin verificación de propiedad del evento. |
| `/organizador/pagos` | Dashboard de pagos con filtros + export CSV | `PaymentsTableClient` | `getPaymentsDashboardPgServer` | **Fuga de datos** | Devuelve pagos de **todos** los organizadores; dropdown usa `EVENTS`. |
| `/organizador/logout` | Cierra sesión (GET, redirect) | — | `logout/route.ts` | Funcional | Revoca sesión + limpia cookies legacy. |
| `/organizador` (`OrganizadorClient.tsx`) | Dashboard alternativo (client, polling) | — | `/api/organizador/dashboard` | **Huérfano** | Itera `EVENTS`; polling 12s recalcula toda la plataforma. |
| `/organizador/soporte` | (enlazado desde el header del panel) | — | — | **404** | No implementado. |

**Editar evento · promociones · asistentes (tabla) · liquidaciones · configuración · staff/porteros** → **NO EXISTEN.**

---

## ADMIN

Bajo `/admin`. **Sin layout, sin guard de servidor** (client components; solo el middleware por longitud de cookie).

| Ruta | Objetivo | Componentes | Backend | Estado | Problemas |
|---|---|---|---|---|---|
| `/admin` | Panel: tabs **Eventos** (por confirmar / confirmados) y **Organizadores** (pendientes / aprobados) + aprobar | inline (`page.tsx`, client) | `/api/admin/events`, `/api/admin/organizers`, `.../approve` | Funcional (para aprobar) | Sin métricas; APIs **sin auth real**. |
| `/admin/organizadores` | Listar + aprobar organizadores pendientes | inline (`page.tsx`, client) | `/api/admin/organizers` | Funcional | **Duplicado** del tab de `/admin`. |
| `/admin/eventos/[id]` | Detalle de evento: publicar / despublicar | inline (`page.tsx`, client) | `/api/admin/event/[id]`, `.../publish`, `.../unpublish` | Funcional | No editar contenido; no rechazar con motivo (`review_notes` sin UI). |

**Usuarios/compradores · ventas globales · pagos/reembolsos · comisiones · reportes · soporte · configuración de plataforma · editar eventos** → **NO EXISTEN.**

---

## INTERNAL (rutas API)

> Detalle completo (método, auth, backend) en `PROJECT-MAP.md §5`. Resumen por grupo:

| Grupo | Rutas | Observación |
|---|---|---|
| `auth/*` | `[...nextauth]`, `signup`, `verify-email` | OK |
| `events/*`, `remaining` | `events`, `events/[id]`, `events/by-slug/[slug]`, `remaining` | 3 handlers de evento casi iguales; no filtran `is_published` |
| `tickets/*`, `qr` | `tickets`, `tickets/resend`, `qr` | `/api/qr` sin auth (firma cualquier ticket) |
| `payments/stripe/*` | `create`, `status`, `webhook` | webhook con firma + dedupe ✅ |
| `payments/webpay/*` | `create`, `return` | OK |
| `payments/flow/*` | `create`, `return`, `kick`, `confirm`, `webhook`, `status`, `_lib/flow.ts` | **3 implementaciones**; sin claves en env |
| `payments/fintoc/*` | `create` (410), `webhook` (activo) | deshabilitado a medias |
| `payments/transfer/*`, `payments/status` | `transfer/create`, `status` | OK |
| `wallet/google/*` | `save-url` | duplica `lib/google-wallet.server.ts` |
| `organizador/*` | `register`, `verify`, `login`, `logout`, `sso`, `dashboard`, `eventos/submit`, `admin/bootstrap`, `admin/create-user` | `dashboard` sin scope de organizador |
| `admin/*` | `login`, `logout`, `bootstrap`, `events`, `event/[id]`, `events/[id]/{approve,publish,unpublish}`, `organizers`, `organizers/[id]/approve` | **la mayoría sin validación de sesión** |
| `demo/*` (16) | `checkin`, `event-stats`, `event-checkins`, `tickets`, `hold`, `qr`, `availability`, `remaining`, `export`, `export-checkins`, `reset`, `reset-checkins`, `stats`, `cart-hold`, `cart-hold/release`, `paid-order` | mezcla PG/JSON; varios sin auth |
| `dev/*` | `seed` | 403 en prod |

---

## Conteo

| Categoría | Pantallas navegables |
|---|---|
| PUBLIC | 6 (+ 4–5 que **faltan**: legales, contacto, FAQ, categorías, perfil) |
| AUTH | 7 (+ 3 flujos de reset **que faltan**) |
| CUSTOMER | 1 (+ perfil/historial **que faltan**) |
| ORGANIZER | 5 vivas + 1 huérfana + 1 rota (scanner) + 1 a 404 (soporte) + ~6 secciones **que faltan** |
| ADMIN | 3 (1 duplicada) + ~8 secciones **que faltan** |
| INTERNAL | ~70 rutas API |

Rutas dinámicas totales en el build: ~60 (`ƒ`). Estáticas: 10 (`○`).
