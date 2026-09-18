# PRD — TicketChile AI

## 1. Rol
TicketChile AI es un copiloto de operación de eventos. Debe reducir trabajo, no añadir una capa de conversación innecesaria.

## 2. Superficies
1. Simulador público.
2. Editor de evento.
3. Dashboard organizador.
4. Ventas/analítica.
5. Promociones.
6. Asistentes/comunicaciones.
7. Soporte guiado.

## 3. Crear evento
Input:
“Fiesta electrónica para 800 personas el 18 de octubre en Santiago. General 15.000 y VIP 30.000.”

Output estructurado:
- title
- short_description
- description
- category
- tags
- date
- start_time
- end_time
- city
- venue
- capacity
- ticket_types[]
- FAQ[]
- SEO title/description
- social copy
- missing_fields[]
- warnings[]

## 4. Confianza y confirmaciones
### IA puede sugerir sin confirmar
- copy
- categorías
- tags
- FAQ
- SEO
- estructura de ticket tiers
- promociones no activadas

### Requiere confirmación
- precios
- stock/capacidad
- fechas
- dirección
- publicación
- pausa/cancelación
- mensajes masivos

### Nunca ejecutar automáticamente
- pagos
- reembolsos
- liquidaciones
- cambios bancarios
- cancelación irreversible

## 5. Edición
Toda salida generada:
- editable
- trazable
- reversible
- con diff cuando modifica datos existentes

## 6. Analítica
Responder sobre datos del organizador y del evento solamente.
Ejemplos:
- “¿Qué ticket se vende más?”
- “Compara esta semana con la anterior.”
- “¿En qué punto cae el checkout?”
- “¿Debo liberar otro tier?”

La respuesta debe:
1. citar la métrica usada dentro de la UI,
2. diferenciar dato de inferencia,
3. proponer acciones,
4. nunca inventar datos faltantes.

## 7. Privacidad
- Scope por organizer_id/event_id.
- No enviar a un modelo más PII de la necesaria.
- Redacción/anonimización cuando se pueda.
- Logs sin PII.
- No exponer datos de otros organizadores.

## 8. UX
Preferencias:
- Command bar.
- Quick actions.
- Inline suggestions.
- Panel lateral contextual.
- Generación estructurada.

Evitar:
- chatbot abierto por defecto
- avatar robótico
- “✨” excesivo
- respuestas verbosas
- acciones ocultas dentro de conversación

## 9. Métricas de IA
- uso por feature
- aceptación
- edición posterior
- tiempo ahorrado
- time-to-draft
- time-to-publish
- tareas completadas
- errores/rechazos
