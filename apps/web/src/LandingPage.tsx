// apps/web/src/LandingPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { fetchEvents, type Event } from './api';

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-CL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

// Icono tipo "Sparkles" sin librerías
function SparklesIcon(props: { size?: number; color?: string }) {
  const { size = 24, color = '#eab308' } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3zM16 3l1.5 4.5L22 9l-4.5 1.5L16 15l-1.5-4.5L10 9l4.5-1.5L16 3zM7 15l.7 2.3L10 18l-2.3.7L7 21l-.7-2.3L4 18l2.3-.7L7 15z"
        fill={color}
      />
    </svg>
  );
}

type FilteredBuckets = {
  featured: Event[];
  regular: Event[];
};

export default function LandingPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchEvents();
        setEvents(data);
      } catch (err) {
        console.error('Error cargando eventos en landing:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const { featured, regular }: FilteredBuckets = useMemo(() => {
    const query = search.trim().toLowerCase();

    let filtered = events.filter((e) => e.status !== 'CANCELLED');

    if (query) {
      filtered = filtered.filter((e) => {
        const title = e.title?.toLowerCase() ?? '';
        const desc = e.description?.toLowerCase() ?? '';
        const venue = e.venueName?.toLowerCase() ?? '';
        const address = e.venueAddress?.toLowerCase() ?? '';
        return (
          title.includes(query) ||
          desc.includes(query) ||
          venue.includes(query) ||
          address.includes(query)
        );
      });
    }

    // “Eventos destacados”: primeros 3 próximos
    const sorted = [...filtered].sort(
      (a, b) =>
        new Date(a.startDateTime).getTime() -
        new Date(b.startDateTime).getTime(),
    );

    return {
      featured: sorted.slice(0, 3),
      regular: sorted.slice(3),
    };
  }, [events, search]);

  function handleGoToEventos() {
    if (typeof window !== 'undefined') {
      window.location.href = '/eventos';
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f9fafb 0%, #e0f2fe 40%, #eff6ff 100%)',
        color: '#0f172a',
      }}
    >
      {/* NAVBAR: usa tu mismo header rojo + logo */}
      <header
        style={{
          background: '#7f1d1d',
          color: '#ffffff',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <img
              src="/logo-ticketchile.png"
              alt="Ticketchile"
              style={{
                height: 64,
                width: 'auto',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>

          <button
            type="button"
            onClick={handleGoToEventos}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: 'none',
              background: '#22c55e',
              color: '#082f49',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Ver eventos
          </button>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '24px 16px 40px',
          boxSizing: 'border-box',
        }}
      >
        {/* Hero */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)',
            gap: '32px',
            alignItems: 'center',
            marginBottom: '32px',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 'clamp(32px, 5vw, 42px)',
                fontWeight: 800,
                margin: 0,
                marginBottom: '12px',
                color: '#0f172a',
              }}
            >
              Vive experiencias{' '}
              <span
                style={{
                  backgroundImage:
                    'linear-gradient(90deg, #1d4ed8, #06b6d4)',
                  WebkitBackgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                inolvidables
              </span>
            </h1>
            <p
              style={{
                fontSize: 16,
                maxWidth: 520,
                margin: 0,
                marginBottom: 20,
                color: '#4b5563',
              }}
            >
              Encuentra y compra tickets para los mejores eventos en Chile.
              Todo en una sola plataforma, rápido y seguro.
            </p>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                marginBottom: 16,
              }}
            >
              <button
                type="button"
                onClick={handleGoToEventos}
                style={{
                  padding: '10px 18px',
                  borderRadius: 999,
                  border: 'none',
                  background:
                    'linear-gradient(90deg, #1d4ed8, #22c55e)',
                  color: '#f9fafb',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Ver eventos disponibles
              </button>

              <button
                type="button"
                onClick={handleGoToEventos}
                style={{
                  padding: '10px 18px',
                  borderRadius: 999,
                  border: '1px solid #1d4ed8',
                  background: 'rgba(255,255,255,0.8)',
                  color: '#1d4ed8',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Publicar mi evento
              </button>
            </div>

            <p
              style={{
                fontSize: 13,
                color: '#6b7280',
                maxWidth: 420,
                margin: 0,
              }}
            >
              Validación con QR en puerta, envío automático de tickets y
              control de acceso en tiempo real.
            </p>
          </div>

          {/* Tarjeta destacada (primer evento si existe) */}
          <div
            style={{
              borderRadius: 24,
              padding: 20,
              background: 'rgba(15,23,42,0.96)',
              color: '#e5e7eb',
              boxShadow: '0 20px 60px rgba(15,23,42,0.45)',
              minHeight: 220,
            }}
          >
            {featured.length > 0 ? (
              <>
                <h2
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    margin: 0,
                    marginBottom: 8,
                  }}
                >
                  {featured[0].title}
                </h2>
                <p
                  style={{
                    fontSize: 13,
                    color: '#9ca3af',
                    margin: 0,
                    marginBottom: 10,
                  }}
                >
                  {featured[0].description}
                </p>

                <p style={{ fontSize: 13, margin: 0 }}>
                  <strong>Fecha:</strong>{' '}
                  {formatDateTime(featured[0].startDateTime)}
                </p>
                <p style={{ fontSize: 13, margin: '4px 0 0' }}>
                  <strong>Lugar:</strong> {featured[0].venueName} ·{' '}
                  {featured[0].venueAddress}
                </p>
                <p style={{ fontSize: 13, margin: '4px 0 0' }}>
                  <strong>Organiza:</strong>{' '}
                  {featured[0].organizer?.name ?? 'Organizador'}
                </p>

                <div
                  style={{
                    marginTop: 14,
                    padding: '10px 12px',
                    borderRadius: 16,
                    border: '1px dashed rgba(148,163,184,0.6)',
                    fontSize: 12,
                    color: '#cbd5f5',
                  }}
                >
                  Tus asistentes reciben un QR único en su correo. Tú lo
                  escaneas en la puerta y listo.
                </div>
              </>
            ) : (
              <p style={{ fontSize: 14 }}>
                Pronto verás aquí los eventos más destacados publicados en
                Ticketchile.
              </p>
            )}
          </div>
        </section>

        {/* Buscador */}
        <section
          style={{
            marginBottom: 24,
          }}
        >
          <div
            style={{
              maxWidth: 480,
              position: 'relative',
            }}
          >
            <input
              type="text"
              placeholder="Buscar por nombre, lugar o ciudad..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                paddingLeft: 36,
                borderRadius: 999,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                outline: 'none',
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 14,
                color: '#94a3b8',
              }}
            >
              🔍
            </span>
          </div>
        </section>

        {/* Listado de eventos */}
        {loading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '40px 0',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '999px',
                border: '3px solid #bfdbfe',
                borderTopColor: '#1d4ed8',
                animation: 'spin 0.75s linear infinite',
              }}
            />
          </div>
        ) : (
          <>
            {featured.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 16,
                  }}
                >
                  <SparklesIcon size={22} />
                  <h3
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      margin: 0,
                    }}
                  >
                    Eventos destacados
                  </h3>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: 16,
                  }}
                >
                  {featured.map((event) => (
                    <LandingEventCard key={event.id} event={event} />
                  ))}
                </div>
              </section>
            )}

            {(regular.length > 0 || featured.length === 0) && (
              <section>
                <h3
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    marginBottom: 16,
                  }}
                >
                  {featured.length > 0
                    ? 'Más eventos'
                    : 'Todos los eventos'}
                </h3>

                {regular.length === 0 && featured.length === 0 ? (
                  <p style={{ color: '#6b7280' }}>
                    No se encontraron eventos que coincidan con tu búsqueda.
                  </p>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(260px, 1fr))',
                      gap: 16,
                    }}
                  >
                    {(regular.length > 0 ? regular : featured).map(
                      (event) => (
                        <LandingEventCard key={event.id} event={event} />
                      ),
                    )}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// Tarjeta simple para la landing (no es la misma EventCard de /eventos)
function LandingEventCard({ event }: { event: Event }) {
  return (
    <article
      style={{
        borderRadius: 16,
        padding: 16,
        background: '#ffffff',
        boxShadow: '0 12px 30px rgba(15,23,42,0.08)',
        border: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        height: '100%',
      }}
    >
      <h4
        style={{
          fontSize: 16,
          fontWeight: 600,
          margin: 0,
          color: '#0f172a',
        }}
      >
        {event.title}
      </h4>
      <p
        style={{
          fontSize: 13,
          color: '#6b7280',
          margin: 0,
          maxHeight: '3.2em',
          overflow: 'hidden',
        }}
      >
        {event.description}
      </p>
      <p
        style={{
          fontSize: 13,
          color: '#111827',
          margin: '4px 0 0',
        }}
      >
        <strong>Fecha:</strong> {formatDateTime(event.startDateTime)}
      </p>
      <p
        style={{
          fontSize: 13,
          color: '#111827',
          margin: '2px 0 0',
        }}
      >
        <strong>Lugar:</strong> {event.venueName} · {event.venueAddress}
      </p>
      {event.organizer?.name && (
        <p
          style={{
            fontSize: 12,
            color: '#6b7280',
            margin: '4px 0 0',
          }}
        >
          Organiza: {event.organizer.name}
        </p>
      )}
    </article>
  );
}
