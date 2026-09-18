# PRD — TicketChile.com
**Versión:** 1.0  
**Estado:** Draft para diseño  
**Fecha:** 2026-08-27

## 1. Visión
TicketChile debe evolucionar de una ticketera funcional pero frágil a una plataforma chilena de eventos capaz de cubrir el ciclo completo:

**Descubrir → crear → publicar → vender → pagar → emitir → operar acceso → analizar → liquidar.**

La experiencia debe ser moderna, profesional, rápida y con identidad propia. No debe parecer una plantilla SaaS genérica ni una web “generada por IA”.

## 2. Objetivos
1. Rediseñar completamente la experiencia pública y los paneles.
2. Construir una experiencia mobile-first real.
3. Convertir la creación de eventos en el punto de diferenciación de TicketChile.
4. Integrar IA como copiloto de tareas reales, no como chatbot decorativo.
5. Permitir una simulación pública de creación de eventos con preview en vivo.
6. Mejorar la conversión de visitantes a compradores y de organizadores potenciales a organizadores registrados.
7. Crear un panel de organizador completo, eficiente y operativo.
8. Consolidar seguridad, multi-tenancy, base de datos, pagos y check-in antes de producción.

## 3. Usuarios
### Comprador
Busca eventos, compra entradas, administra sus tickets y recibe acceso digital.

### Organizador Owner
Crea, publica, opera y analiza eventos. Gestiona ventas, tickets, asistentes, staff y liquidaciones.

### Organizer Staff
Acceso limitado por evento: puerta/check-in, ventas o soporte operativo según permisos.

### Admin
Opera la plataforma: organizadores, eventos, compradores, pagos, reembolsos, comisiones, configuración y soporte.

### Superadmin
Control completo de plataforma y configuración sensible.

## 4. Principios de producto
- **Mobile-first**, no “desktop encogido”.
- **Velocidad antes que decoración**.
- **Una acción principal por pantalla**.
- **Información crítica visible sin buscarla**.
- **IA sugerente y reversible**: propone; el usuario confirma acciones sensibles.
- **Diseño editorial/cinemático**, no dashboard SaaS genérico.
- **El evento es el protagonista visual**.
- **Consistencia absoluta** mediante Design System.
- **Accesibilidad AA** como mínimo.
- **Seguridad y multi-tenancy por defecto**.

## 5. Arquitectura funcional
### Público
- `/`
- `/eventos`
- `/eventos/[slug]`
- `/checkout/[eventId]`
- `/checkout/confirm`
- `/mis-tickets`
- `/perfil`
- `/categorias/[slug]`
- `/organizadores/[slug]` opcional
- legales, FAQ, contacto

### Organizador
- `/organizador`
- `/organizador/eventos`
- `/organizador/eventos/nuevo`
- `/organizador/eventos/[id]`
- `/organizador/eventos/[id]/editar`
- `/organizador/eventos/[id]/ventas`
- `/organizador/eventos/[id]/entradas`
- `/organizador/eventos/[id]/asistentes`
- `/organizador/eventos/[id]/scanner`
- `/organizador/eventos/[id]/promociones`
- `/organizador/eventos/[id]/staff`
- `/organizador/liquidaciones`
- `/organizador/configuracion`
- `/organizador/soporte`

### Admin
- `/admin`
- `/admin/organizers`
- `/admin/events`
- `/admin/users`
- `/admin/sales`
- `/admin/payments`
- `/admin/refunds`
- `/admin/fees`
- `/admin/support`
- `/admin/settings`

## 6. Flujo público principal
1. Descubrir evento.
2. Abrir detalle.
3. Elegir entrada y cantidad.
4. Crear hold.
5. Identificación mínima.
6. Seleccionar pago.
7. Pago confirmado.
8. Ticket emitido.
9. Wallet / email / Mis Tickets.
10. Check-in.

## 7. Home
La Home debe sentirse como una plataforma de entretenimiento/eventos, no como un directorio.

Bloques:
1. Header transparente/oscuro.
2. Hero de evento destacado con imagen inmersiva.
3. CTA principal “Ver entradas”.
4. CTA secundario “Explorar evento”.
5. Carruseles editoriales: destacados, esta semana, Santiago, conciertos, fiestas, deportes, etc.
6. Buscador/filtro rápido.
7. Módulo “Crea tu evento con IA”.
8. Simulador público con preview.
9. Beneficios para organizadores.
10. Footer completo.

## 8. Catálogo de eventos
- Búsqueda inmediata.
- Categoría.
- Ciudad/comuna.
- Fecha.
- Precio.
- Orden.
- Paginación o carga progresiva.
- URLs compartibles con filtros.
- Cards con jerarquía visual clara.
- Skeletons.
- Estados vacíos útiles.
- Mobile filter sheet.

## 9. Detalle del evento
Debe ser una de las pantallas visualmente más fuertes.

### Desktop
- Fondo inmersivo derivado del hero.
- Shell central oscuro.
- Poster/hero.
- Título, fecha, lugar y organizador.
- CTA de compra persistente pero no invasivo.
- Ticket selector.
- Descripción.
- Ubicación/mapa.
- Información del acceso.
- FAQ.
- Compartir.
- Eventos relacionados.

### Mobile
- Hero full-width.
- Información esencial primero.
- CTA sticky inferior.
- Ticket selector en bottom sheet o sección compacta.
- Contenido en acordeones cuando ayude.

## 10. Checkout
Máximo 2 pasos:
1. **Tus datos**
2. **Pago**

Requisitos:
- Timer visible del hold.
- Resumen lateral en desktop / colapsable en mobile.
- Pedir solo datos realmente necesarios.
- Métodos de pago activos solamente.
- Validación server-side.
- No confiar en precios del cliente.
- Estados de error claros.
- Reintentar pago sin perder orden cuando corresponda.

## 11. Mis Tickets
- Próximos / pasados.
- Ticket card con QR.
- Estado: válido, usado, cancelado, transferido.
- Wallet.
- Reenvío.
- Transferencia de ticket.
- Historial de compra.
- Detalles del evento.
- Acceso rápido desde mobile.

## 12. Panel organizador
La unidad principal no es “la cuenta”: es **el evento**.

### Dashboard global
- Ventas del periodo.
- Entradas vendidas.
- Conversión.
- Próximos eventos.
- Alertas operativas.
- Liquidaciones pendientes.
- Actividad reciente.
- Acceso a TicketChile AI.

### Centro del evento
Cabecera persistente:
- Estado.
- Fecha.
- Ventas.
- Aforo.
- CTA de preview pública.
- CTA editar.
- CTA pausar/publicar según estado.

Tabs/secciones:
- Resumen
- Editar
- Entradas
- Ventas
- Asistentes
- Promociones
- Staff
- Check-in
- Analítica
- Configuración

## 13. Editor de eventos
Estados:
`draft → in_review → published → paused → ended → cancelled`

Capacidades:
- Autosave.
- Preview en vivo.
- Desktop/mobile preview.
- Hero + poster separados.
- Múltiples tipos de entrada.
- Ventanas de venta.
- Stock.
- Máximo por orden.
- Entradas privadas/ocultas.
- Ubicación.
- Fechas y horarios.
- FAQ.
- Políticas.
- SEO.
- Organizador visible.
- Checklist de publicación.
- IA para completar/proponer campos.

## 14. TicketChile AI
La IA se integra en acciones concretas:
- Crear evento desde lenguaje natural.
- Reescribir título/descripcion.
- Generar resumen.
- Proponer categorías/tags.
- Detectar campos faltantes.
- Crear estructura de ticket tiers.
- Crear FAQ.
- Crear texto SEO/social.
- Analizar ventas.
- Detectar anomalías.
- Proponer promociones.
- Resumir asistentes/check-in.
- Generar campañas o mensajes.
- Explicar métricas.

### Regla
La IA **no publica, cambia precios, cancela eventos, reembolsa ni mueve dinero automáticamente** sin confirmación explícita.

## 15. Simulador público de evento
Objetivo: convertir visitantes en organizadores.

Input inicial:
> “Describe el evento que quieres crear…”

La IA genera una simulación:
- Nombre.
- Descripción.
- Categoría.
- Fecha tentativa.
- Lugar.
- Ticket tiers.
- Precio.
- Hero conceptual o placeholder.
- Preview pública.

El visitante puede editar:
- Nombre
- Fecha
- Ciudad
- Lugar
- Precio
- Tipos de ticket
- Imagen/estilo

Preview:
- Desktop
- Mobile

CTA final:
**“Crear este evento en TicketChile”**

Al registrarse, se conserva la simulación como borrador cuando sea técnicamente viable.

## 16. Panel Admin
Debe ser una consola operativa, no solo una pantalla de aprobación.

Módulos:
- Overview.
- Organizers.
- Events.
- Users.
- Sales.
- Payments.
- Refunds.
- Fees.
- Payouts.
- Support.
- Platform settings.
- Audit log.

## 17. Seguridad y fundaciones — bloqueantes
Antes de considerar producción:
- Identidad unificada.
- Sesiones validadas en servidor.
- RBAC.
- Multi-tenancy estricto.
- Reset de contraseña.
- Rate limiting.
- CAPTCHA donde corresponda.
- 2FA obligatorio para admin.
- Schema real versionado.
- Migraciones.
- Eliminar rutas demo públicas.
- Check-in autenticado y scoped al evento.
- Blob/CDN para imágenes.
- Logs sin PII.
- Security headers.
- Tests de aislamiento y pagos.

## 18. Pagos
- Mantener máximo 1–2 proveedores activos en la primera versión estable.
- `PaymentProvider` común.
- Cálculo server-side.
- Webhooks validados.
- Reconciliación.
- Idempotencia.
- Reintentos.
- Reembolsos.
- Ledger/auditoría.

## 19. Modelo de comisiones
Debe ser configurable, sin hardcodear:
- Fee base de plataforma.
- Override por organizador.
- Override por evento.
- Opción “absorbe organizador” / “se cobra al comprador” si el negocio lo decide.
- Registro de bruto, comisión, impuestos y neto.

## 20. Check-in
- Funciona para cualquier evento real.
- Staff asignable por evento.
- QR válido y firmado.
- Anti-reutilización server-side.
- Log de quién escaneó.
- Feedback visual y háptico claro.
- PWA mobile.
- Offline sync como fase posterior.

## 21. Design System
Debe definir:
- color
- typography
- spacing
- grid
- radii
- shadows
- imagery
- motion
- buttons
- forms
- tickets
- cards
- tables
- modals
- tabs
- toasts
- status
- shell
- sidebar
- mobile nav
- empty/loading/error states

## 22. Métricas
### Público
- Home → evento.
- Evento → selección ticket.
- Ticket → checkout.
- Checkout → pago.
- Pago → emisión.

### Organizador
- Time to first event.
- Time to publish.
- Eventos publicados.
- GMV.
- Tickets vendidos.
- Conversión.
- Check-in rate.
- Uso de IA.
- Tareas completadas desde AI.

## 23. No objetivos inmediatos
- Mapa de asientos complejo.
- Marketplace secundario.
- Internacionalización completa.
- Multi-moneda.
- App nativa obligatoria.
- IA que ejecute movimientos financieros sin confirmación.

## 24. Criterios de éxito
- El usuario entiende en <5s que TicketChile vende entradas y permite crear eventos.
- Un organizador puede generar un primer borrador en <2 min.
- La creación manual completa requiere claramente menos pasos que hoy.
- Todos los paneles son utilizables en 390px sin overflow.
- No existen datos cross-tenant.
- El scanner funciona para eventos reales.
- Build, typecheck, lint y tests críticos pasan en CI.
