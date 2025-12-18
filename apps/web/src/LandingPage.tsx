// apps/web/src/LandingPage.tsx
import React, { useMemo, useState } from 'react';
import { PublicEventCard } from './components/PublicEventCard';

type CategoryKey = 'Todos' | 'Deportes';

type LandingEvent = {
  id: string;
  title: string;
  category: Exclude<CategoryKey, 'Todos'>;

  // ✅ necesario para que PublicEventCard formatee fecha igual que en /events
  startDateTime: string; // ISO

  // (lo seguimos usando en el modal)
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
    startDateTime: '2025-12-19T19:00:00-03:00', // ✅ viernes 19 dic, 7pm CL
    dateLabel: 'vie, 19 dic · 7:00 p. m.',
    location: 'Casa de la Juventud · Pintor Murillo #5369 · San Joaquín',
    ticketsLabel: 'Entradas disponibles',
    minPriceLabel: '$8.895',
    imageUrl:
      'https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
];

const PRIMARY_RED = '#7c1515';

function splitLocation(location: string) {
  const parts = location.split('·').map((s) => s.trim()).filter(Boolean);
  const venueName = parts[0] ?? location;
  const venueAddress = parts.slice(1).join(' · ') || '';
  return { venueName, venueAddress };
}

function parseClpFromLabel(label: string) {
  // "$8.895" -> 8895
  const n = Number(String(label).replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * ✅ Adaptador: LandingEvent -> "Event-like" para PublicEventCard
 * (usamos `as any` para no pelear con el type exacto de Event de tu proyecto)
 */
function landingToEvent(e: LandingEvent) {
  const { venueName, venueAddress } = splitLocation(e.location);

  const pricePesos = parseClpFromLabel(e.minPriceLabel);
  const priceCents = pricePesos * 100; // tu app usa cents aunque sea CLP

  return {
    id: e.id,
    title: e.title,
    description: '',
    startDateTime: e.startDateTime,
    venueName,
    venueAddress,

    // para que getEventImageUrl encuentre la imagen
    imageUrl: e.imageUrl,

    // para que el card muestre "Desde $..." igual que en events
    ticketTypes: pricePesos
      ? [
          {
            id: `landing-${e.id}-general`,
            name: 'General',
            currency: 'CLP',
            priceCents,
          },
        ]
      : [],

    status: 'PUBLISHED',
  } as any;
}

const LandingPage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalEvent, setModalEvent] = useState<LandingEvent | null>(null);

  const filteredEvents = useMemo(() => {
    let list = LANDING_EVENTS;

    if (selectedCategory !== 'Todos') {
      list = list.filter((e) => e.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (e) => e.title.toLowerCase().includes(q) || e.location.toLowerCase().includes(q),
      );
    }

    return list;
  }, [selectedCategory, searchQuery]);

  const featuredEvents = filteredEvents;
  const regularEvents: LandingEvent[] = [];

  const goToEvents = () => {
    window.location.href = '/?view=events';
  };

  const goToOrganizer = () => {
    window.location.href = '/?login=1';
  };

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
              backgroundImage: 'linear-gradient(90deg,#f97316,#fb923c,#f97316)',
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
              border: '1px solid rgba(255,255,255,0.6)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14,
              background: 'transparent',
              color: '#ffffff',
            }}
          >
            Soy organizador
          </button>
        </nav>
      </header>

      {/* BANNER PRINCIPAL */}
      <section
        style={{
          padding: '24px 16px 8px',
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            borderRadius: 24,
            overflow: 'hidden',
            position: 'relative',
            boxShadow: '0 18px 50px rgba(0,0,0,0.18)',
            border: '1px solid #f1f5f9',
          }}
        >
          <img
            src="/banner-home.jpg"
            alt="TicketChile"
            style={{
              width: '100%',
              height: 'clamp(180px, 28vw, 320px)',
              objectFit: 'cover',
              display: 'block',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(90deg, rgba(2,6,23,0.75) 0%, rgba(2,6,23,0.25) 55%, rgba(2,6,23,0.05) 100%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 18,
              right: 18,
              bottom: 18,
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              maxWidth: 640,
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1 }}>
              Compra en segundos. Entra con QR.
            </div>
            <div style={{ fontSize: 14, opacity: 0.92 }}>
              Tu entrada más rápida al evento. Sin filas, sin drama.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={goToEvents}
                style={{
                  padding: '10px 16px',
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: 14,
                  backgroundImage: 'linear-gradient(90deg,#f97316,#fb923c,#b91c1c)',
                  color: '#fff',
                  boxShadow: '0 12px 28px rgba(185,28,28,0.45)',
                }}
              >
                Explorar eventos
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* BUSCADOR */}
      <section
        style={{
          padding: '16px 16px 0',
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Buscar eventos, lugares..."
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
              fontWeight: 800,
              fontSize: 14,
              backgroundImage: 'linear-gradient(90deg,#f97316,#fb923c,#b91c1c)',
              color: '#ffffff',
              boxShadow: '0 10px 24px rgba(185,28,28,0.45)',
            }}
          >
            Buscar
          </button>
        </div>
      </section>

      {/* CATEGORÍAS */}
      <section
        style={{
          padding: '18px 16px 0',
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setSelectedCategory(cat.key)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 999,
                  border: active ? 'none' : '1px solid #e5e7eb',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: 14,
                  background: active ? PRIMARY_RED : '#ffffff',
                  color: active ? '#ffffff' : '#111827',
                }}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* EVENTOS DESTACADOS */}
      <main
        style={{
          padding: '24px 16px 56px',
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
          flex: 1,
        }}
      >
        <section style={{ marginTop: 12 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 18,
            }}
          >
            {/* ✅ AQUÍ está el cambio: usamos PublicEventCard */}
            {featuredEvents.map((ev) => (
              <PublicEventCard
                key={ev.id}
                event={landingToEvent(ev)}
                onOpen={() => setModalEvent(ev)}
              />
            ))}
          </div>
        </section>

        {regularEvents.length > 0 && (
          <section style={{ marginTop: 34 }}>
            <h2 style={{ margin: '0 0 14px', fontSize: 20, fontWeight: 900 }}>
              Otros eventos
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 18,
              }}
            >
              {regularEvents.map((ev) => (
                <PublicEventCard
                  key={ev.id}
                  event={landingToEvent(ev)}
                  onOpen={() => setModalEvent(ev)}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* MODAL */}
      {modalEvent && (
        <div
          onClick={() => setModalEvent(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 18,
            zIndex: 999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(760px, 100%)',
              background: '#ffffff',
              borderRadius: 18,
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ position: 'relative' }}>
              <img
                src={modalEvent.imageUrl}
                alt={modalEvent.title}
                style={{ width: '100%', height: 320, objectFit: 'cover', display: 'block' }}
              />
              <button
                onClick={() => setModalEvent(null)}
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  width: 38,
                  height: 38,
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 900,
                  background: 'rgba(0,0,0,0.55)',
                  color: '#fff',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 18 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
                {modalEvent.title}
              </h2>

              <div style={{ marginTop: 10, color: '#374151', fontSize: 14, display: 'grid', gap: 6 }}>
                <div><strong>Fecha:</strong> {modalEvent.dateLabel}</div>
                <div><strong>Lugar:</strong> {modalEvent.location}</div>
                <div><strong>Tickets:</strong> {modalEvent.ticketsLabel}</div>
              </div>

              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Desde</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#b91c1c' }}>
                    {modalEvent.minPriceLabel}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => goToEventPurchase(modalEvent)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 999,
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 900,
                    fontSize: 14,
                    backgroundImage: 'linear-gradient(90deg,#f97316,#fb923c,#b91c1c)',
                    color: '#ffffff',
                    boxShadow: '0 12px 28px rgba(185,28,28,0.45)',
                  }}
                >
                  Comprar tickets
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer
        style={{
          backgroundColor: PRIMARY_RED,
          color: '#ffffff',
          padding: '18px 16px',
          textAlign: 'center',
          fontSize: 13,
          opacity: 0.95,
        }}
      >
        TicketChile © {new Date().getFullYear()} · Tu entrada más rápida al evento
      </footer>
    </div>
  );
};

export default LandingPage;
