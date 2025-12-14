// apps/web/src/LandingPage.tsx
import React, { useMemo, useState } from 'react';

type CategoryKey =
  | 'Todos'
  | 'Música'
  | 'Deportes'
  | 'Teatro'
  | 'Festivales'
  | 'Conferencias';

type LandingEvent = {
  id: string;
  title: string;
  category: Exclude<CategoryKey, 'Todos'>;
  featured?: boolean;
  dateLabel: string;
  location: string;
  ticketsLabel: string;
  minPriceLabel: string;
  imageUrl: string;
};

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: 'Todos', label: 'Todos' },
  { key: 'Música', label: 'Música' },
  { key: 'Deportes', label: 'Deportes' },
  { key: 'Teatro', label: 'Teatro' },
  { key: 'Festivales', label: 'Festivales' },
  { key: 'Conferencias', label: 'Conferencias' },
];

// 👉 Eventos solo para la landing (no toca tu API real)
const LANDING_EVENTS: LandingEvent[] = [
  {
    id: 'velada-boxeo-san-joaquin',
    title: 'Velada de Boxeo San Joaquín',
    category: 'Deportes',
    featured: true,
    dateLabel: 'vie, 19 dic · 19:00',
    location: 'Casa de la Juventud · San Joaquín',
    ticketsLabel: '1000 tickets disponibles',
    minPriceLabel: '$8.000',
    // usa cualquier foto tipo boxeo; aquí dejo la de ejemplo de Bolt
    imageUrl:
      'https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
  {
    id: 'festival-rock-2025',
    title: 'Festival de Rock 2025',
    category: 'Música',
    featured: true,
    dateLabel: 'lun, 12 ene · 20:00',
    location: 'Movistar Arena · Santiago',
    ticketsLabel: '500 tickets disponibles',
    minPriceLabel: '$45.000',
    imageUrl:
      'https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
  {
    id: 'lollapalooza-chile-2025',
    title: 'Lollapalooza Chile 2025',
    category: 'Festivales',
    featured: true,
    dateLabel: 'mié, 11 feb · 12:00',
    location: "Parque O'Higgins · Santiago",
    ticketsLabel: '10000 tickets disponibles',
    minPriceLabel: '$120.000',
    imageUrl:
      'https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinsyrgb&w=800',
  },
  {
    id: 'standup-comedy-night',
    title: 'Stand Up Comedy Night',
    category: 'Teatro',
    dateLabel: 'sáb, 20 dic · 21:00',
    location: 'Teatro Caupolicán · Santiago',
    ticketsLabel: '300 tickets disponibles',
    minPriceLabel: '$18.000',
    imageUrl:
      'https://images.pexels.com/photos/1116073/pexels-photo-1116073.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
  {
    id: 'tech-summit-2025',
    title: 'Tech Summit 2025',
    category: 'Conferencias',
    dateLabel: 'mar, 27 ene · 09:00',
    location: 'Centro de Eventos CasaPiedra · Santiago',
    ticketsLabel: '800 tickets disponibles',
    minPriceLabel: '$35.000',
    imageUrl:
      'https://images.pexels.com/photos/1181562/pexels-photo-1181562.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
  {
    id: 'concierto-sinfonico-ano-nuevo',
    title: 'Concierto Sinfónico de Año Nuevo',
    category: 'Música',
    dateLabel: 'vie, 13 mar · 19:30',
    location: 'Teatro Municipal · Santiago',
    ticketsLabel: '400 tickets disponibles',
    minPriceLabel: '$28.000',
    imageUrl:
      'https://images.pexels.com/photos/1116073/pexels-photo-1116073.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
];

const PRIMARY_RED = '#7c1515';
const PRIMARY_ORANGE = '#f97316';

const LandingPage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryKey>('Todos');
  const [searchQuery, setSearchQuery] = useState('');

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

  const featuredEvents = filteredEvents.filter((e) => e.featured);
  const regularEvents = filteredEvents.filter((e) => !e.featured);

  const handleGoToEvents = () => {
    if (typeof window === 'undefined') return;
    window.location.href = '/eventos';
  };

  const handleGoToOrganizer = () => {
    if (typeof window === 'undefined') return;
    window.location.href = '/eventos?login=1';
  };

  const handleEventClick = () => {
    // No tocamos la lógica de pagos: simplemente llevamos a /eventos
    handleGoToEvents();
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
            style={{ height: 42, width: 'auto', display: 'block' }}
          />
        </div>

        <nav style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={handleGoToEvents}
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
            onClick={handleGoToOrganizer}
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

      {/* CONTENIDO PRINCIPAL */}
      <main
        style={{
          flex: 1,
          padding: '32px 16px 56px',
          maxWidth: 1200,
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        {/* HERO */}
        <section
          style={{
            textAlign: 'center',
            marginBottom: 32,
            padding: '0 8px',
          }}
        >
          <h1
            style={{
              fontSize: 'clamp(2.4rem, 4vw, 3.2rem)',
              fontWeight: 800,
              lineHeight: 1.15,
              marginBottom: 12,
              color: '#111827',
            }}
          >
            Vive experiencias{' '}
            <span
              style={{
                backgroundImage:
                  'linear-gradient(90deg,#f97316,#fb923c,#dc2626)',
                WebkitBackgroundClip: 'text',
                color: 'transparent',
              }}
            >
              inolvidables
            </span>
          </h1>
          <p
            style={{
              maxWidth: 720,
              margin: '0 auto',
              fontSize: 16,
              color: '#4b5563',
            }}
          >
            Encuentra y compra tickets para los mejores eventos en Chile. Vende
            tus entradas y controla el acceso con códigos QR en tiempo real.
          </p>
        </section>

        {/* CTA PRINCIPALES */}
        <section
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 16,
            marginBottom: 28,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={handleGoToEvents}
            style={{
              padding: '14px 28px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 15,
              backgroundImage:
                'radial-gradient(circle at 0 0,#fed7aa,#f97316 45%,#b91c1c)',
              color: '#ffffff',
              boxShadow: '0 18px 40px rgba(185,28,28,0.5)',
              minWidth: 220,
            }}
          >
            Ver eventos disponibles
          </button>

          <button
            type="button"
            onClick={handleGoToOrganizer}
            style={{
              padding: '14px 28px',
              borderRadius: 999,
              border: '1px solid #fecaca',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 15,
              backgroundColor: '#ffffff',
              color: '#b91c1c',
              boxShadow: '0 10px 25px rgba(248,113,113,0.35)',
              minWidth: 200,
            }}
          >
            Publicar mi evento
          </button>
        </section>

        {/* BENEFICIOS */}
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

        {/* 🔍 BUSCADOR + CATEGORÍAS (ABAJO DE LOS BENEFICIOS) */}
        <section style={{ marginBottom: 40 }}>
          {/* Buscador */}
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
              onClick={() => {
                /* filtro ya es en vivo */
              }}
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

          {/* Categorías */}
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

        {/* LISTADO DE EVENTOS (DESTACADOS + MÁS EVENTOS) */}
        {filteredEvents.length > 0 ? (
          <>
            {featuredEvents.length > 0 && (
              <section style={{ marginBottom: 28 }}>
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
                    Eventos destacados
                  </h2>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: 18,
                  }}
                >
                  {featuredEvents.map((event) => (
                    <LandingEventCard
                      key={event.id}
                      event={event}
                      onClick={handleEventClick}
                    />
                  ))}
                </div>
              </section>
            )}

            {regularEvents.length > 0 && (
              <section>
                <h2
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    marginBottom: 16,
                    color: '#111827',
                  }}
                >
                  {featuredEvents.length ? 'Más eventos' : 'Todos los eventos'}
                </h2>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: 18,
                  }}
                >
                  {regularEvents.map((event) => (
                    <LandingEventCard
                      key={event.id}
                      event={event}
                      onClick={handleEventClick}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
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
    </div>
  );
};

type CardProps = {
  event: LandingEvent;
  onClick: () => void;
};

const LandingEventCard: React.FC<CardProps> = ({ event, onClick }) => {
  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 18,
        overflow: 'hidden',
        boxShadow: '0 14px 30px rgba(15,23,42,0.18)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform =
          'translateY(-4px)';
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          '0 18px 40px rgba(15,23,42,0.25)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          '0 14px 30px rgba(15,23,42,0.18)';
      }}
    >
      <div
        style={{
          position: 'relative',
          height: 190,
          overflow: 'hidden',
        }}
      >
        <img
          src={event.imageUrl}
          alt={event.title}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />

        {event.featured && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              padding: '4px 10px',
              borderRadius: 999,
              backgroundImage:
                'linear-gradient(90deg,#f97316,#fb923c,#f97316)',
              color: '#ffffff',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            Destacado
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '8px 12px',
            background:
              'linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0.1))',
            color: '#f9fafb',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {event.category}
        </div>
      </div>

      <div
        style={{
          padding: '14px 16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flex: 1,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: '#111827',
          }}
        >
          {event.title}
        </h3>

        <div
          style={{
            fontSize: 13,
            color: '#4b5563',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div>{event.dateLabel}</div>
          <div>{event.location}</div>
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
            <div
              style={{
                fontSize: 11,
                color: '#9ca3af',
                marginBottom: 2,
              }}
            >
              Desde
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: '#b91c1c',
              }}
            >
              {event.minPriceLabel}
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              backgroundImage:
                'linear-gradient(90deg,#f97316,#fb923c,#b91c1c)',
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
