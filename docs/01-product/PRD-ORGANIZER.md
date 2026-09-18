# PRD — Panel Organizador TicketChile

## 1. Objetivo
Crear el panel más eficiente del producto. Debe permitir que un organizador gestione un evento completo sin sentirse dentro de un ERP pesado.

## 2. Principio
**Event-first UI**:
el usuario entra para operar eventos, no para navegar módulos abstractos.

## 3. Dashboard global
Mostrar:
- ventas brutas
- neto estimado
- tickets vendidos
- conversión
- eventos activos
- próximos eventos
- alertas
- tareas pendientes
- liquidaciones
- actividad

Acciones rápidas:
- Crear evento
- Abrir evento
- Ver asistentes
- Abrir scanner
- Crear promoción
- Preguntar a TicketChile AI

## 4. Centro del evento
Header:
- nombre
- fecha
- estado
- tickets vendidos/capacidad
- ventas
- preview
- editar
- publicar/pausar

Navegación:
Resumen · Editor · Entradas · Ventas · Asistentes · Promociones · Staff · Acceso · Analítica · Ajustes

## 5. Editor
### Modo manual
Secciones plegables:
1. Información básica
2. Fecha y horario
3. Ubicación
4. Imagen/branding
5. Entradas
6. Venta
7. Información adicional
8. FAQ/políticas
9. SEO/compartir
10. Publicación

### Modo IA
Prompt natural-language → propuesta estructurada.

Siempre mostrar:
- campos generados
- campos faltantes
- campos críticos por confirmar
- preview

## 6. Tickets
N tipos por evento.
Campos:
- nombre
- descripción
- precio
- stock
- inicio/fin venta
- máximo por orden
- visible/privado
- fee
- estado

Soportar:
- Preventa
- General
- VIP
- Cortesía
- Invitación privada

## 7. Ventas
- GMV.
- Neto.
- Fee.
- Orders.
- Payments.
- Ticket count.
- Revenue timeline.
- Ticket tier performance.
- Payment method breakdown.
- Export.
- Search.

## 8. Asistentes
Tabla responsive:
- nombre
- email
- ticket
- estado
- compra
- check-in

Acciones:
- abrir ticket
- reenviar
- cancelar
- cortesía
- exportar
- bulk message

En mobile: cards/list rows, no tabla horizontal obligatoria.

## 9. Promociones
- código
- % / monto
- límite
- fechas
- ticket tiers
- estado
- uso
- campaña

AI:
“Quiero impulsar ventas para el viernes” → propone promoción; organizador confirma.

## 10. Staff
Roles por evento:
- owner
- manager
- door/check-in
- viewer

Permisos explícitos.

## 11. Scanner
PWA mobile.
Estados instantáneos:
- válido
- ya utilizado
- incorrecto
- otro evento
- cancelado

Mostrar:
- nombre
- ticket tier
- hora
- operador

## 12. Liquidaciones
- bruto
- fee
- impuestos
- neto
- saldo pendiente
- pagado
- payouts
- datos bancarios

## 13. TicketChile AI
Ubicación:
- command bar contextual
- panel lateral
- acciones sugeridas dentro de secciones

No debe ser un globo flotante genérico.

Ejemplos:
- “Crea un evento parecido al anterior.”
- “¿Por qué bajaron las ventas esta semana?”
- “Crea un descuento para las últimas 100 entradas.”
- “Resume el check-in.”
- “¿Qué información me falta para publicar?”

## 14. Estados
Cada pantalla debe especificar:
- loading
- empty
- error
- success
- partial data
- unauthorized
- offline cuando aplique
