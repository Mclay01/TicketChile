// apps/web/src/LandingPage.tsx
import React, { useMemo, useState } from 'react';
import { PublicEventCard } from './components/PublicEventCard';
type CategoryKey = 'Todos' | 'Deportes';

type LandingEvent = {
  id: string;
  title: string;
  category: Exclude<CategoryKey, 'Todos'>;
  dateLabel: string;
  location: string;
  ticketsLabel: string;
  minPriceLabel: string;
  imageUrl: string;
};

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: 'Todos', label: 'Todos' },
  { key: 'Deportes', label: 'Deportes' },
];

// 🔴 ÚNICO EVENTO REAL DE LA LANDING
const LANDING_EVENTS: LandingEvent[] = [
  {
    id: 'velada-boxeo-san-joaquin',
    title: 'Velada de Boxeo San Joaquín',
    category: 'Deportes',
    dateLabel: 'vie, 19 dic · 7:00 p. m.',
    location: 'Casa de la Juventud · Pintor Murillo #5369 · San Joaquín',
    ticketsLabel: 'Entradas disponibles',
    minPriceLabel: '$8.895',
    imageUrl:
      'https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
];

const PRIMARY_RED = '#7c1515';

const LandingPage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryKey>('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalEvent, setModalEvent] = useState<LandingEvent | null>(null);

  // 🔍 Filtrado (aunque hoy solo hay 1 evento, esto queda listo para más)
  const filteredEvents = useMemo(() => {
    let list = LANDING_EVENTS;

    if (selectedCategory !== 'Todos') {
      list = list.filter((e) => e.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q),
      );
    }

    return list;
  }, [selectedCategory, searchQuery]);

  const featuredEvents = filteredEvents; // solo uno
  const regularEvents: LandingEvent[] = []; // no hay otros

  const goToEvents = () => {
    window.location.href = '/?view=events';
  };

  const goToOrganizer = () => {
    window.location.href = '/?login=1';
  };


  // 👉 Botón "Comprar tickets" del modal:
  // usamos la misma página real de compra que ya tienes (/eventos?evento=...)
  const goToEventPurchase = (event: LandingEvent) => {
    const encoded = encodeURIComponent(event.title);
    window.location.href = `/?evento=${encoded}`;
  };


  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#ffffff',
        color: '#111827',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* HEADER ROJO CON LOGO */}
      <header
        style={{
          backgroundColor: PRIMARY_RED,
          color: '#ffffff',
          padding: '10px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src="/logo-ticketchile.png"
            alt="TicketChile"
            style={{ height: 48, width: 'auto', display: 'block' }}
          />
        </div>

        <nav style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={goToEvents}
            style={{
              padding: '8px 18px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14,
              backgroundImage:
                'linear-gradient(90deg,#f97316,#fb923c,#f97316)',
              color: '#ffffff',
              boxShadow: '0 10px 24px rgba(0,0,0,0.3)',
            }}
          >
            Ver eventos
          </button>

          <button
            type="button"
            onClick={goToOrganizer}
            style={{
              padding: '8px 18px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.5)',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: 14,
              backgroundColor: 'transparent',
              color: '#ffffff',
            }}
          >
            Soy organizador
          </button>
        </nav>
      </header>

      {/* CONTENIDO */}
      <main
        style={{
          flex: 1,
          padding: '32px 16px 56px',
          maxWidth: 1200,
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Keyframes para shimmer */}
        <style>{`
          @keyframes tc-shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
        `}</style>

        {/* Banner promo (reemplaza el Hero + botones) */}
        <section style={{ marginBottom: 28 }}>
          <div
            style={{
              position: 'relative',
              borderRadius: 26,
              overflow: 'hidden',
              boxShadow: '0 24px 70px rgba(15,23,42,0.18)',
              border: '1px solid #eef2f7',
              background: 'linear-gradient(135deg, #7c1515, #b91c1c, #f97316)',
            }}
          >
            {/* Si quieres imagen real: ponla en apps/web/public/banner-home.jpg */}
            <div style={{ aspectRatio: '21 / 9', minHeight: 180 }}>
              <img
                src="/banner-home.jpg"
                alt="TicketChile"
                onError={(e) => {
                  // si no existe la imagen, no mostramos el icono roto
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                  opacity: 0.55,
                  filter: 'saturate(1.05) contrast(1.05)',
                }}
              />
            </div>

            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(90deg, rgba(124,21,21,0.95) 0%, rgba(124,21,21,0.65) 45%, rgba(0,0,0,0.05) 75%), linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0.10))',
              }}
            />

            <div
              style={{
                position: 'absolute',
                inset: 0,
                padding: 22,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                color: '#fff',
              }}
            >
              <div style={{ maxWidth: 760 }}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 12px',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.14)',
                    border: '1px solid rgba(255,255,255,0.22)',
                    fontSize: 12,
                    fontWeight: 800,
                    marginBottom: 10,
                  }}
                >
                  ⚡ TicketChile
                </div>

                <h1
                  style={{
                    margin: 0,
                    fontSize: 'clamp(1.9rem, 3.4vw, 3rem)',
                    fontWeight: 950,
                    lineHeight: 1.05,
                  }}
                >
                  Tu entrada más rápida al evento.
                </h1>

                <p style={{ margin: '10px 0 0', maxWidth: 720, fontSize: 15, opacity: 0.92 }}>
                  Compra en segundos, entra con QR y que nadie te cuente el show. (Excepto el del guardia en la entrada).
                </p>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={goToEvents}
                    style={{
                      padding: '12px 20px',
                      borderRadius: 999,
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 800,
                      fontSize: 14,
                      backgroundImage: 'linear-gradient(90deg,#f97316,#fb923c,#b91c1c)',
                      color: '#ffffff',
                      boxShadow: '0 16px 36px rgba(0,0,0,0.35)',
                    }}
                  >
                    Ver eventos
                  </button>

                  <button
                    type="button"
                    onClick={goToOrganizer}
                    style={{
                      padding: '12px 20px',
                      borderRadius: 999,
                      border: '1px solid rgba(255,255,255,0.5)',
                      background: 'rgba(255,255,255,0.10)',
                      cursor: 'pointer',
                      fontWeight: 800,
                      fontSize: 14,
                      color: '#ffffff',
                    }}
                  >
                    Publicar mi evento
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>


        {/* Beneficios */}
        <section style={{ marginBottom: 32 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 12,
            }}
          >
            {[
              'Sin costos fijos para publicar',
              'Pagos seguros con Flow',
              'QR único por asistente',
            ].map((text) => (
              <div
                key={text}
                style={{
                  padding: '10px 16px',
                  borderRadius: 999,
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  fontSize: 13,
                  color: '#7f1d1d',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 8px 20px rgba(248,113,113,0.4)',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '999px',
                    backgroundColor: '#ef4444',
                  }}
                />
                {text}
              </div>
            ))}
          </div>
        </section>

        {/* Buscador + categorías */}
        <section style={{ marginBottom: 40 }}>
          <div
            style={{
              maxWidth: 720,
              margin: '0 auto 20px auto',
              display: 'flex',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              placeholder="Buscar eventos, artistas, lugares..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                padding: '12px 18px',
                borderRadius: 999,
                border: '2px solid #e5e7eb',
                fontSize: 15,
                outline: 'none',
                backgroundColor: '#f9fafb',
              }}
            />
            <button
              type="button"
              style={{
                padding: '11px 24px',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 14,
                backgroundImage:
                  'linear-gradient(90deg,#f97316,#fb923c,#b91c1c)',
                color: '#ffffff',
                boxShadow: '0 10px 24px rgba(185,28,28,0.45)',
              }}
            >
              Buscar
            </button>
          </div>

          <div
            style={{
              textAlign: 'center',
              marginBottom: 12,
              fontSize: 14,
              fontWeight: 600,
              color: '#374151',
              letterSpacing: 0.4,
            }}
          >
            Explora por categoría
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            {CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setSelectedCategory(cat.key)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 999,
                    border: isActive ? 'none' : '1px solid #e5e7eb',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: isActive
                      ? 'linear-gradient(90deg,#f97316,#fb923c,#b91c1c)'
                      : '#ffffff',
                    color: isActive ? '#ffffff' : '#374151',
                    boxShadow: isActive
                      ? '0 10px 24px rgba(248,113,113,0.4)'
                      : '0 2px 8px rgba(15,23,42,0.06)',
                    minWidth: 90,
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Listado de eventos – solo la velada */}
        {filteredEvents.length > 0 ? (
          <section>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 16,
              }}
            >
              <span style={{ fontSize: 20 }}>✨</span>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  margin: 0,
                  color: '#111827',
                }}
              >
                Eventos disponibles
              </h2>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 18,
              }}
            >
              {filteredEvents.map((event) => (
                <LandingEventCard
                  key={event.id}
                  event={event}
                  onClick={setModalEvent}
                />
              ))}
            </div>
          </section>
        ) : (
          <section
            style={{
              textAlign: 'center',
              padding: '40px 0',
            }}
          >
            <p style={{ color: '#6b7280' }}>
              No se encontraron eventos que coincidan con tu búsqueda.
            </p>
          </section>
        )}
      </main>

      {/* MODAL DE DETALLE DEL EVENTO */}
      {modalEvent && (
        <div
          onClick={() => setModalEvent(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.65)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 50,
            padding: '16px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#f9fafb',
              borderRadius: 24,
              maxWidth: 900,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 80px rgba(15,23,42,0.5)',
            }}
          >
            {/* Header imagen */}
            <div
              style={{
                position: 'relative',
                height: 220,
                overflow: 'hidden',
              }}
            >
              <img
                src={modalEvent.imageUrl}
                alt={modalEvent.title}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0.1))',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 18,
                  left: 18,
                  padding: '6px 12px',
                  borderRadius: 999,
                  backgroundColor: 'rgba(15,23,42,0.85)',
                  color: '#f9fafb',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {modalEvent.category}
              </div>
              <button
                type="button"
                onClick={() => setModalEvent(null)}
                style={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  width: 32,
                  height: 32,
                  borderRadius: '999px',
                  border: 'none',
                  backgroundColor: 'rgba(15,23,42,0.7)',
                  color: '#f9fafb',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 18,
                }}
              >
                ×
              </button>
              <div
                style={{
                  position: 'absolute',
                  left: 24,
                  bottom: 20,
                  color: '#f9fafb',
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: 26,
                    fontWeight: 800,
                  }}
                >
                  {modalEvent.title}
                </h2>
              </div>
            </div>

            {/* Contenido */}
            <div
              style={{
                padding: '18px 20px 0',
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    backgroundColor: '#eef2ff',
                    borderRadius: 16,
                    padding: '10px 14px',
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#4b5563',
                      marginBottom: 4,
                    }}
                  >
                    Fecha
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: '#111827',
                    }}
                  >
                    {modalEvent.dateLabel}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: '#eff6ff',
                    borderRadius: 16,
                    padding: '10px 14px',
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#4b5563',
                      marginBottom: 4,
                    }}
                  >
                    Ubicación
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: '#111827',
                    }}
                  >
                    {modalEvent.location}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: '#ecfdf5',
                    borderRadius: 16,
                    padding: '10px 14px',
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#4b5563',
                      marginBottom: 4,
                    }}
                  >
                    Disponibilidad
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: '#15803d',
                    }}
                  >
                    {modalEvent.ticketsLabel}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <h3
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: '#111827',
                    marginBottom: 4,
                  }}
                >
                  Descripción
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    color: '#4b5563',
                    margin: 0,
                  }}
                >
                  Velada de boxeo con combates nacionales e internacionales,
                  transmisión en vivo y control de acceso con código QR único
                  por asistente.
                </p>
              </div>
            </div>

            {/* Footer precio + CTA */}
            <div
              style={{
                marginTop: 'auto',
                padding: '14px 20px 18px',
                borderTop: '1px solid #e5e7eb',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 16,
                alignItems: 'center',
                justifyContent: 'space-between',
                background:
                  'linear-gradient(to right, #fef2f2, #fee2e2, #ffe4e6)',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#6b7280',
                    marginBottom: 2,
                  }}
                >
                  Precio desde
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: '#b91c1c',
                  }}
                >
                  {modalEvent.minPriceLabel}
                </div>
              </div>

              <button
                type="button"
                onClick={() => goToEventPurchase(modalEvent)}
                style={{
                  padding: '12px 26px',
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 15,
                  backgroundImage:
                    'linear-gradient(90deg,#f97316,#fb923c,#b91c1c)',
                  color: '#ffffff',
                  boxShadow: '0 16px 36px rgba(185,28,28,0.55)',
                  minWidth: 210,
                }}
              >
                Comprar tickets
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

type CardProps = {
  event: LandingEvent;
  onClick: (event: LandingEvent) => void;
};

function splitLocation(location: string) {
  const parts = (location || '')
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return { venueName: location, venueAddress: '' };
  }

  return {
    venueName: parts[0],
    venueAddress: parts.slice(1).join(' · '),
  };
}

function getLandingCardImage(src: string) {
  const fallback = '/event-fallback.jpg';
  const clean = src || fallback;

  // local o raro => no proxy
  if (clean.startsWith('/') || clean.startsWith('data:') || clean.startsWith('blob:')) {
    return { src: clean, srcSet: undefined as string | undefined, sizes: undefined as string | undefined };
  }

  // solo proxy si es http(s)
  if (!/^https?:\/\//i.test(clean)) {
    return { src: fallback, srcSet: undefined, sizes: undefined };
  }

  const enc = encodeURIComponent(clean);
  const src480 = `/api/img?url=${enc}&w=480&q=70`;
  const src800 = `/api/img?url=${enc}&w=800&q=72`;
  const src1200 = `/api/img?url=${enc}&w=1200&q=75`;

  return {
    src: src800,
    srcSet: `${src480} 480w, ${src800} 800w, ${src1200} 1200w`,
    sizes: '(max-width: 640px) 100vw, (max-width: 1200px) 50vw, 33vw',
  };
}

const LandingEventCard: React.FC<CardProps> = ({ event, onClick }) => {
  const [hovered, setHovered] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const { venueName, venueAddress } = useMemo(
    () => splitLocation(event.location),
    [event.location],
  );

  const img = useMemo(() => getLandingCardImage(event.imageUrl), [event.imageUrl]);

  const fallbackUrl = '/event-fallback.jpg';
  const finalSrc = imgError ? fallbackUrl : img.src;
  const finalSrcSet = imgError ? undefined : img.srcSet;
  const finalSizes = imgError ? undefined : img.sizes;

  const shimmer: React.CSSProperties = {
    backgroundImage: 'linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)',
    backgroundSize: '200% 100%',
    animation: 'tc-shimmer 1.2s infinite',
  };

  return (
    <div
      onClick={() => onClick(event)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 18,
        overflow: 'hidden',
        boxShadow: hovered
          ? '0 18px 40px rgba(15,23,42,0.25)'
          : '0 14px 30px rgba(15,23,42,0.18)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        willChange: 'transform',
        border: '1px solid #eef2f7',
      }}
    >
      {/* keyframes del shimmer */}
      <style>{`
        @keyframes tc-shimmer {
          0% { background-position: 0% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      <div
        style={{
          position: 'relative',
          aspectRatio: '16 / 9',
          overflow: 'hidden',
          background: '#f3f4f6',
        }}
      >
        {!imgLoaded && <div style={{ position: 'absolute', inset: 0, ...shimmer }} />}

        <img
          src={finalSrc}
          srcSet={finalSrcSet}
          sizes={finalSizes}
          alt={event.title}
          loading="lazy"
          decoding="async"
          onLoad={() => setImgLoaded(true)}
          onError={() => {
            setImgError(true);
            setImgLoaded(true);
          }}
          width={1200}
          height={675}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            opacity: imgLoaded ? 1 : 0,
            transition: 'opacity 0.25s ease',
          }}
        />

        {/* ✅ Igual que Events: fecha abajo en el overlay */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '8px 12px',
            background: 'linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0.1))',
            color: '#f9fafb',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {event.dateLabel}
        </div>
      </div>

      <div style={{ padding: '14px 16px 12px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111827' }}>
          {event.title}
        </h3>

        <div style={{ fontSize: 13, color: '#4b5563', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div>{venueName}</div>
          {venueAddress ? <div>{venueAddress}</div> : null}
          <div>{event.ticketsLabel}</div>
        </div>

        <div
          style={{
            marginTop: 'auto',
            paddingTop: 10,
            borderTop: '1px solid #f3f4f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>Desde</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#b91c1c' }}>
              {event.minPriceLabel}
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick(event);
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              backgroundImage: 'linear-gradient(90deg,#f97316,#fb923c,#b91c1c)',
              color: '#ffffff',
              boxShadow: '0 10px 24px rgba(185,28,28,0.45)',
              whiteSpace: 'nowrap',
            }}
          >
            Ver más
          </button>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
