# PRD — Landing / Web pública TicketChile

## 1. Propósito
Convertir TicketChile en una experiencia pública de descubrimiento de eventos con alto impacto visual y, al mismo tiempo, una herramienta de adquisición de organizadores.

## 2. Dirección
Referencia emocional: plataformas de entretenimiento premium, cine, streaming y entradas físicas/digitales.  
No copiar literalmente interfaces de películas; adaptar su lenguaje visual a eventos reales.

## 3. Home
### Hero
- Evento destacado.
- Background full-bleed o edge-to-edge.
- Blur/overlay derivados de la misma imagen.
- Contenedor central opcional con borde fino y profundidad.
- Título grande pero controlado.
- Fecha, ciudad, categoría.
- CTA principal “Comprar entradas”.
- CTA secundario “Ver evento”.
- Header discreto y legible.

### Carruseles
- Destacados.
- Próximos.
- Esta semana.
- Por ciudad.
- Por categoría.
- Últimas entradas / tendencia cuando exista data.

### Event cards
Evitar tarjetas SaaS blancas.  
La imagen debe dominar. Información corta, clara y consistente.

## 4. Simulador “Crea tu evento”
Bloque interactivo prominente.

### Estado 1
Campo natural-language:
“Quiero organizar…”

CTA: **Crear una simulación con IA**

### Estado 2
Se genera:
- título
- fecha
- ciudad
- lugar
- descripción
- tipos de ticket
- precios
- visual/hero placeholder

### Estado 3
Editor ligero + preview:
- desktop/mobile switch
- cambios en tiempo real
- sin necesidad de cuenta

### Estado 4
CTA:
**Publicar este evento con TicketChile**

## 5. Evento
Diseño editorial/cinemático:
- cover de fondo
- poster o art principal
- metadata
- tickets
- compra
- detalles
- ubicación
- organizador
- FAQ
- relacionados

En desktop puede adoptar una composición de “panel inmersivo dentro de fondo expandido”.  
En mobile, priorizar hero → metadata → compra.

## 6. Checkout
Inspiración útil: ticket físico/digital como objeto visual.
- Stepper mínimo.
- Resumen visual.
- Ticket tier como “ticket strip” cuando ayude.
- Rojo solo para acciones/acento.
- Fondo oscuro.
- Contraste fuerte.
- Formularios sobrios.

## 7. Header
Desktop:
- logo
- Eventos
- Categorías
- Para organizadores
- Buscar
- Mis tickets / cuenta
- CTA secundario según sesión

Mobile:
- logo
- búsqueda
- cuenta
- menú sheet
- acceso directo a tickets cuando corresponda

## 8. Motion
- Transiciones 180–350ms.
- Hover con profundidad mínima.
- Hero crossfade/slide suave.
- Parallax solo si no afecta performance.
- No animar cada elemento.
- Respetar `prefers-reduced-motion`.

## 9. Responsive
Targets obligatorios:
390, 430, 768, 1024, 1440.

No:
- `w-screen` con offsets que creen overflow.
- tablas o filtros de escritorio aplastados.
- CTAs tapando contenido.
- texto de hero que ocupe toda la pantalla.

## 10. Tono
Profesional, directo, chileno neutro.
Evitar:
- bromas internas
- jerga de desarrollo
- “copy de startup de IA”
- frases grandilocuentes sin contenido

## 11. SEO
- Metadata por evento.
- OpenGraph.
- JSON-LD Event.
- Slugs estables.
- Sitemap.
- indexación de categorías.
