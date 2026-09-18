# REDESIGN-SCOPE — TicketChile.com

Insumo para el nuevo PRD. Clasifica cada pieza en:
**CONSERVAR** · **REDISEÑAR** (misma función, otra UI/UX) · **REFACTORIZAR** (misma UI, mejor código) · **ELIMINAR** · **CONSTRUIR DESDE CERO**.

---

## 1. CONSERVAR (tal cual o con ajustes menores)

| Pieza | Por qué | Nota |
|---|---|---|
| Modelo de dominio conceptual | `events → ticket_types → holds → hold_items → orders → tickets` + `payments` con contadores `capacity/sold/held` y máquinas de estado es correcto y estándar de ticketera. | Reimplementar con migraciones y tipos generados, pero mantener la forma. |
| `checkout.pg.server.ts::finalizeHoldToOrderCoreTx` | Emisión de order+tickets **idempotente** por `hold_id`, con locks `FOR UPDATE` y transición `held → sold`. Es la mejor pieza del backend. | Quitar los try/catch de "columnas ausentes" cuando el schema sea fiable. |
| Patrón de **hold con expiración** | Reserva temporal de stock + liberación de `held` al expirar. Buen diseño anti-sobreventa. | Unificar TTL y la función de "release expired". |
| Firma HMAC de QR (`qr-token.server.ts`) | Token `tc1.<ticketId>.<eventId>.<iat>.<sig>`, `timingSafeEqual`, imposible de forjar sin secreto. | Añadir: comprobar propiedad antes de **emitir** el QR (ver §5.4 del AUDIT). Considerar `exp` en el token. |
| Parser flexible de QR en check-in | Acepta token firmado, JSON, querystring, `tix_...`. Robusto para lectores variados. | Mantener. |
| Verificación de webhooks Stripe / Fintoc | Firma + dedupe por `event.id` en `webhook_events`. Correcto. | Mantener; aplicar el mismo rigor a Flow. |
| Cálculo de monto **server-side** desde `hold_items` | No se confía en el cliente; Flow rechaza `amount_mismatch`. Correcto. | Mantener en todos los proveedores. |
| Export CSV con escape anti-injection (`csvEscapeCell`) | Prefija `= + - @` y entrecomilla. Correcto. | Mantener. |
| Estética base: dark + acento rojo (#ef4444), tokens de color en `globals.css` | Identidad visual coherente en la web pública. | Formalizarla como Design System (§4). |
| Estructura de rutas de la web pública (`/`, `/eventos`, `/eventos/[slug]`, `/checkout/...`, `/mis-tickets`) | El árbol de URLs es sensato. | Mantener las URLs; rehacer el interior. |
| `@zxing` para el scanner | Funciona en móvil, route-split correcto. | Mantener; envolver en un componente del DS. |
| Sanitización de open-redirect (`safeNextPath`, `isBlockedCallback`) | Correcta. | Mantener. |

---

## 2. REDISEÑAR (misma función — nueva UI/UX)

| Pieza | Problema actual | Objetivo del rediseño |
|---|---|---|
| **Home `/`** | Datos hardcodeados; hero frágil; filtros sobre 3 registros. | Catálogo real (DB + ISR); hero editable por admin; secciones (destacados, por ciudad, próximos). |
| **Detalle de evento `/eventos/[slug]`** | `<img>` crudo; layout con anchors; info densa. | `next/image`, galería, mapa de ubicación, sección de tipos de entrada con ventanas de venta, FAQ del evento, compartir. |
| **Checkout** | Formulario larguísimo (nombre, RUT, teléfono, email ×2, región, comuna, dir ×2, términos); 4 métodos de pago (2 rotos); 4 regiones hardcodeadas; tema inconsistente. | 2 pasos claros (identidad → pago); solo métodos activos; regiones/comunas completas o solo lo necesario (¿realmente hace falta dirección para un ticket digital?); resumen visual del evento; timer de hold visible. |
| **`/checkout/confirm`** | Polling complejo con refs anti-duplicado; reenvío ticket-por-ticket. | Estado en tiempo real (SSE o revalidación); acción única "reenviar", "descargar", "añadir a wallet"; pantalla de éxito con QR embebido. |
| **`/mis-tickets`** | Lista básica; "fallback por email"; QR vía `<img>` a endpoint. | Cartera de tickets con estados, transferencia de ticket, historial de compras, filtro por evento pasado/futuro. |
| **Dashboard de organizador `/organizador`** | KPIs con subtítulos placeholder; "Gestionar" deshabilitado; 2 implementaciones. | Dashboard real: ventas netas / fee / a liquidar, embudo de conversión, gráfico de ventas en el tiempo, próximos eventos, alertas (agotándose, pagos pendientes). |
| **Crear evento** | Wizard 4 pasos; 1 solo ticket; imagen base64; sin borrador. | Editor de evento (borrador → publicar), múltiples tipos de entrada, hero + poster a CDN, previsualización, guardado automático. |
| **Panel admin `/admin`** | Solo "aprobar"; sin métricas; página duplicada. | Consola de operaciones: cola de aprobación, salud de la plataforma, buscador global, accesos a las secciones nuevas (§3). |
| **Registro de organizador** | 9 pasos; `orgType` no se guarda. | 3–4 pasos; guardar todos los datos capturados; validación de RUT/empresa. |
| **Login (los 3)** | 3 pantallas distintas, 3 estilos. | Una identidad visual; selector de tipo de cuenta si aplica; "olvidé mi contraseña". |
| **Emails de ticket** | HTML inline básico. | Plantillas (react-email / MJML) con marca, QR grande, "añadir a wallet", detalles del evento, política de acceso. |

---

## 3. CONSTRUIR DESDE CERO (funcionalidad inexistente)

### 3.1 Autenticación y roles (unificado)
- Un solo sistema de identidad (Auth.js v5 sobre Postgres, o Lucia, o propio bien hecho).
- Roles: `buyer`, `organizer_owner`, `organizer_staff` (portero/vendedor por evento), `admin`, `superadmin`.
- Sesiones **siempre validadas** contra store.
- Recuperación de contraseña (email) para todos los roles.
- Verificación de email/teléfono, 2FA opcional (obligatorio para admin).
- Rate limiting + CAPTCHA en signup.
- RBAC declarativo (middleware + helpers `requireRole`).

### 3.2 Aislamiento multi-tenant
- Toda query/endpoint de organizador filtrado por `organizer_id` (o `event_id ∈ eventos del organizador`).
- Tests automáticos de aislamiento.

### 3.3 Base de datos + migraciones
- Reconstruir el schema real (observando la DB actual).
- Drizzle ORM (recomendado, encaja con `pg`) o Prisma; migraciones versionadas en CI.
- Tipos de fila generados (elimina el `any` del punto 6 de TECH-DEBT).

### 3.4 Almacenamiento de medios
- Blob storage (Vercel Blob / S3 / R2) + `next/image`.
- Migrar imágenes base64 existentes.

### 3.5 Gestión completa de eventos (organizador)
- Editar evento (con reglas si ya hay ventas).
- Múltiples tipos de entrada, ventanas de venta (preventa/general), límite por orden configurable, entradas ocultas/por invitación.
- Publicar / pausar ventas / cancelar evento (con reembolsos).

### 3.6 Promociones
- Códigos de descuento (% o monto fijo, tope de usos, fecha de validez, por tipo de entrada).
- Cortesías / lista de invitados (emite tickets sin pago, con auditoría).

### 3.7 Asistentes (organizador)
- Tabla navegable por evento: nombre, email, tipo, estado (válido/usado), fecha de check-in.
- Acciones: reenviar email (individual y masivo), cancelar ticket, exportar.

### 3.8 Check-in / puerta (reconstruir)
- App/PWA de portero conectada a la DB para **cualquier** evento.
- Verificación de que el operador es dueño o `organizer_staff` del evento.
- Log de accesos (quién escaneó, cuándo, resultado).
- Modo offline opcional (sync).
- Endpoint de check-in autenticado + idempotente + en el matcher del middleware.
- Reemplaza `/api/demo/checkin` y `scanner/*`.

### 3.9 Liquidaciones / payouts (organizador)
- Ventas brutas, comisión de plataforma, impuestos, neto, saldo a liquidar.
- Historial de payouts; export contable.
- Configuración de datos bancarios del organizador.

### 3.10 Panel de administrador (secciones nuevas)
- **Usuarios/compradores**: buscar, ver, suspender.
- **Organizadores**: aprobar / rechazar con motivo / suspender / ver detalle + eventos + ventas.
- **Eventos**: editar cualquier campo, forzar despublicar, historial.
- **Ventas globales**: por periodo, por organizador, por evento, por método de pago.
- **Pagos / reembolsos**: buscar transacción, iniciar reembolso, ver conciliación por proveedor.
- **Comisiones**: fee por defecto + overrides por organizador/evento.
- **Soporte**: bandeja de tickets de soporte (o integración con herramienta externa).
- **Configuración de plataforma**: feature flags, métodos de pago activos, textos legales, banners de home.

### 3.11 Páginas públicas nuevas
- Categorías / taxonomía de eventos.
- Términos y condiciones, Política de privacidad, Política de reembolsos.
- Contacto / FAQ / "Sobre nosotros".
- Perfil de comprador (datos, historial).
- Perfil público de organizador (opcional).

### 3.12 Observabilidad
- Logger estructurado (pino) + Sentry.
- Analytics de producto (embudo: vista evento → carrito → checkout → pago → ticket).

---

## 4. Design System (construir como paquete)

`packages/ui` (o `src/components/ui` bien hecho):

- **Tokens**: color (light/dark coherentes), spacing, radios (definir 2–3, no 5), sombras, tipografía (`next/font`, no `@import`).
- **Componentes base**: `Button` (variantes primary/secondary/ghost/destructive + sizes), `Input`, `Textarea`, `Select` (extender el Radix existente), `Checkbox`, `Radio`, `Switch`, `Label`, `FormField` (con error).
- **Layout/estructura**: `Card`, `Badge`, `Tabs`, `Table` (con orden + paginación), `Pagination`, `EmptyState`, `Skeleton`.
- **Feedback**: `Toast`, `Dialog`/`Modal`, `AlertDialog`, `Tooltip`, `Banner`.
- **Navegación**: `AppShell` (header + sidebar colapsable), `MobileNav` (hamburguesa — **hoy no existe en ninguna pantalla**), `Breadcrumbs`.
- **Dominio**: `EventCard`, `TicketCard`, `PriceTag`, `QRDisplay`, `StatCard`, `StatusPill`, `QuantityStepper`.
- **Charts**: adoptar una librería (Recharts/visx/Tremor) para dashboards.
- Todo mobile-first, dark mode real, sin cards blancas sueltas sobre shell oscuro.

---

## 5. REFACTORIZAR (mantener comportamiento, mejorar código)

| Pieza | Acción |
|---|---|
| Integración Flow (×3) | Colapsar en `lib/payments/flow.ts`, detrás de una interfaz `PaymentProvider`. |
| Emisión de tickets (×3) | Usar solo `finalizeHoldToOrderCoreTx` en todos los webhooks/return/status. |
| Hash scrypt (×5 codificaciones) | `lib/credentials.ts` único (migrar a argon2id). |
| API de evento (×3 handlers) | 1 handler + `lib/events.server.ts`. |
| "Release expired holds" (×6) | 1 función compartida. |
| `fetchQrPngBase64` / `autoEmailOrderTickets` (×3) | 1 módulo `lib/emails/tickets.ts`. |
| Validación RUT/teléfono/email (×2) | `lib/cl/*`. |
| Wrapper `PaymentProvider` | `create()`, `handleReturn()`, `handleWebhook()`, `reconcile()` por proveedor. |
| Rutas API con lógica de transacción inline | Mover a servicios (`lib/services/checkout.ts`, `lib/services/payments.ts`). |
| `organizer.pg.server.ts` (~1100 líneas) | Dividir por responsabilidad (stats, submissions, export, payments-dashboard) y **añadir `organizerId` obligatorio**. |
| `any` en mapeo de filas | Tipos generados por Drizzle. |
| `console.*` | Logger estructurado. |
| 3 footers / 2 heroes / 4 selectores | 1 de cada, en el DS. |
| Middleware `proxy.ts` | RBAC real: validar sesión contra store, no solo longitud de cookie. |

---

## 6. ELIMINAR

### Ficheros / carpetas
```
package.json.bak                → restaurar como package.json (decisión monorepo)
apps/api/                       → borrar
packages/types/                 → borrar (o convertir en fuente única de tipos)
apps/web/.demo-db.json          → borrar + gitignore
apps/web/.demo/db.json          → borrar + gitignore
apps/web/next.config.js         → fusionar en next.config.ts y borrar
apps/web/src/organizer-auth.ts  → borrar (vacío)
apps/web/src/lib/organizerAuth.server.ts   → borrar
apps/web/src/lib/storage.ts                → borrar
apps/web/src/lib/demo-db.server.ts         → borrar (tras migrar demo/* a PG)
apps/web/src/lib/seed.pg.server.ts + /api/dev/seed  → borrar (o mover a scripts de dev)
apps/web/src/app/(public)/checkout/[eventId]/CheckoutClient.tsx  → borrar
apps/web/src/app/(public)/checkout/success/SuccessClient.tsx     → revisar/borrar
apps/web/src/app/(public)/eventos/[slug]/QuickBuyClient.tsx      → borrar
apps/web/src/app/(public)/signin/signin-buttons.tsx              → borrar
apps/web/src/app/(organizer)/organizador/OrganizadorClient.tsx   → borrar
apps/web/src/app/(admin)/admin/organizadores/page.tsx            → borrar (duplicado)
apps/web/src/components/HomeHeroCarousel.tsx        → borrar
apps/web/src/components/EventInlineCheckout.tsx     → borrar
apps/web/src/components/CheckoutTicketSelector.tsx  → borrar
apps/web/src/components/CheckoutCustomerForm.tsx    → borrar
apps/web/src/components/public/SiteFooter.tsx       → borrar
apps/web/src/components/public/AuthButtons.tsx      → borrar
apps/web/src/components/ui/Card.tsx                 → borrar (o integrar al DS)
```

### Funcionalidad
- **Modo demo / DB JSON** completo (`demo-db.server.ts`, `.demo/db.json`, rutas `/api/demo/{stats,cart-hold,cart-hold/release,reset}` que usan JSON). Migrar lo necesario a PG bajo `/api/*` real.
- **Array `EVENTS`** de `lib/events.ts` (mantener solo los helpers de formato/parse, moverlos a `lib/format.ts`).
- **Fintoc** (o reactivar del todo, o quitar de UI + rutas).
- **Cookies legacy** (`organizer_session`, `tc_org_session`, `tc_org_user`).
- **`bcryptjs`** de dependencias (no se usa).

---

## 7. Orden sugerido de trabajo (para el PRD)

1. **Fundaciones** (bloqueante para todo): decisión monorepo · migraciones + schema real · blob storage · logger/Sentry · `.env.example` · limpieza de código muerto.
2. **Seguridad** (bloqueante para producción): auth unificada + RBAC + reset de contraseña · guard admin + aislamiento multi-tenant · rate limiting · cabeceras de seguridad.
3. **Design System** (bloqueante para el rediseño visual): tokens + componentes base + AppShell + MobileNav.
4. **Núcleo de negocio**: modelo de comisión · editor de eventos (borrador→publicar, multi-tier) · checkout rediseñado (1–2 proveedores, `PaymentProvider`) · emisión única · check-in reconstruido.
5. **Paneles**: organizador (dashboard, asistentes, liquidaciones) · admin (usuarios, organizadores, eventos, ventas, pagos/reembolsos, comisiones, config).
6. **Público**: home real · detalle rediseñado · mis-tickets (cartera + transferencia) · páginas legales/contacto/FAQ · perfil.
7. **Extras**: promociones/cortesías · analytics de producto · emails con plantillas · Google/Apple Wallet.
8. **Calidad continua**: tests (pagos + aislamiento) en CI · ESLint gate · previews por PR.
