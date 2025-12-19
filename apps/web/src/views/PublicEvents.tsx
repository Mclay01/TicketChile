// apps/web/src/views/PublicEvents.tsx
import { useMemo, useState, type CSSProperties } from 'react';
import { API_BASE_URL, type Event } from '../api';

type Props = {
  events: Event[];
  loading: boolean;
  error: string | null;
  onOpen: (e: Event) => void;
};

const FALLBACK_EVENT_IMAGE =
  'https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinysrgb&w=1200';

type CategoryKey = 'all' | 'sports' | 'music' | 'culture';

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'sports', label: 'Deportes' },
  { key: 'music', label: 'Música' },
  { key: 'culture', label: 'Cultura' },
];

function normalizeText(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatDateRowLabel(iso: string) {
  try {
    const d = new Date(iso);
    const weekday = d
      .toLocaleDateString('es-CL', { weekday: 'short' })
      .replace('.', '')
      .toUpperCase();
    const day = d.toLocaleDateString('es-CL', { day: '2-digit' });
    const month = d
      .toLocaleDateString('es-CL', { month: 'short' })
      .replace('.', '')
      .toUpperCase();
    const time = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    return `${weekday} | ${day} ${month} | ${time}`;
  } catch {
    return iso;
  }
}

function formatPrice(cents: number, currency: string) {
  const amount = cents / 100;
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency }).format(amount);
}

function getPriceRangeLabel(event: Event) {
  const tts = event.ticketTypes ?? [];
  if (tts.length === 0) return 'Sin tickets';

  const currency = tts[0]?.currency || 'CLP';
  const prices = tts.map((tt) => tt.priceCents ?? 0);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  const a = formatPrice(min, currency);
  const b = formatPrice(max, currency);
  return min === max ? a : `${a} – ${b}`;
}

function getEventImageUrl(event: Event) {
  const anyEvent = event as any;
  return anyEvent.imageUrl || anyEvent.coverImageUrl || anyEvent.bannerUrl || FALLBACK_EVENT_IMAGE;
}

const shimmerLight: CSSProperties = {
  backgroundImage:
    'linear-gradient(90deg, rgba(15,23,42,0.05) 0%, rgba(15,23,42,0.10) 50%, rgba(15,23,42,0.05) 100%)',
  backgroundSize: '200% 100%',
  animation: 'tc-shimmer 1.2s infinite',
};

function SkeletonGrid({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            border: '1px solid #eef2f7',
            boxShadow: '0 14px 30px rgba(15,23,42,0.08)',
            background: '#ffffff',
          }}
        >
          <div style={{ aspectRatio: '16 / 10' }}>
            <div style={{ width: '100%', height: '100%', ...shimmerLight }} />
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ height: 16, borderRadius: 10, ...shimmerLight, marginBottom: 10 }} />
            <div style={{ height: 12, borderRadius: 10, ...shimmerLight, width: '75%', marginBottom: 8 }} />
            <div style={{ height: 12, borderRadius: 10, ...shimmerLight, width: '55%' }} />
          </div>
        </div>
      ))}
      <style>{`
        @keyframes tc-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </>
  );
}

function PublicEventCard({ event, onOpen }: { event: Event; onOpen: (e: Event) => void }) {
  const [hovered, setHovered] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const dateRow = useMemo(
    () => formatDateRowLabel(((event as any).startDateTime ?? (event as any).startDate) as string),
    [event],
  );
  const priceRow = useMemo(() => getPriceRangeLabel(event), [event]);

  const imgSrc = useMemo(() => getEventImageUrl(event), [event]);
  const finalSrc = imgError ? FALLBACK_EVENT_IMAGE : imgSrc;

  return (
    <div
      onClick={() => onOpen(event)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        userSelect: 'none',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 0.15s ease',
      }}
    >
      <div
        style={{
          position: 'relative',
          borderRadius: 18,
          overflow: 'hidden',
          aspectRatio: '16 / 10',
          background: '#111827',
          boxShadow: '0 14px 30px rgba(15,23,42,0.18)',
          border: '1px solid #eef2f7',
        }}
      >
        {!imgLoaded && <div style={{ position: 'absolute', inset: 0, ...shimmerLight }} />}

        <img
          src={finalSrc}
          alt={event.title}
          loading="lazy"
          decoding="async"
          onLoad={() => setImgLoaded(true)}
          onError={() => {
            setImgError(true);
            setImgLoaded(true);
          }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            opacity: imgLoaded ? 1 : 0,
            transition: 'opacity 0.25s ease',
          }}
        />

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
            fontWeight: 700,
          }}
        >
          {dateRow}
        </div>
      </div>

      <div
        style={{
          borderRadius: 18,
          border: '1px solid #eef2f7',
          background: '#ffffff',
          boxShadow: '0 14px 30px rgba(15,23,42,0.08)',
          padding: '14px 16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flex: 1,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#111827' }}>{event.title}</h3>

        <div style={{ fontSize: 13, color: '#4b5563', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div>{event.venueName}</div>
          {event.venueAddress ? <div>{event.venueAddress}</div> : null}
          <div>{priceRow}</div>
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
            <div style={{ fontSize: 20, fontWeight: 900, color: '#b91c1c' }}>
              {(() => {
                const tts = event.ticketTypes ?? [];
                if (tts.length === 0) return '—';
                const currency = tts[0]?.currency || 'CLP';
                const min = Math.min(...tts.map((tt) => tt.priceCents ?? 0));
                return formatPrice(min, currency);
              })()}
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(event);
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 800,
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
}

function guessCategory(event: Event): CategoryKey {
  const anyEvent = event as any;
  const raw = String(anyEvent.category ?? anyEvent.type ?? '').toLowerCase();
  const title = normalizeText(event.title);

  if (raw.includes('sport') || title.includes('futbol') || title.includes('basket') || title.includes('tenis')) return 'sports';
  if (raw.includes('music') || title.includes('dj') || title.includes('concierto') || title.includes('banda')) return 'music';
  if (raw.includes('culture') || title.includes('teatro') || title.includes('expo') || title.includes('cultura')) return 'culture';
  return 'all';
}

export default function PublicEvents({ events, loading, error, onOpen }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('all');

  const filtered = useMemo(() => {
    const q = normalizeText(searchQuery);
    return (events ?? []).filter((e) => {
      const matchesQuery =
        !q ||
        normalizeText(e.title).includes(q) ||
        normalizeText(e.venueName ?? '').includes(q) ||
        normalizeText(e.venueAddress ?? '').includes(q);

      const matchesCat =
        selectedCategory === 'all' ? true : guessCategory(e) === selectedCategory;

      return matchesQuery && matchesCat;
    });
  }, [events, searchQuery, selectedCategory]);

  return (
    <div>
      {/* “Landing content” arriba */}
      <section
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <img
            src="/logo-ticketchile.png"
            alt="TicketChile"
            style={{ height: 34, objectFit: 'contain' }}
          />
          <span style={{ fontSize: 12, opacity: 0.85 }}>Tu entrada más rápida al evento.</span>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por evento o lugar..."
            style={{
              height: 40,
              borderRadius: 999,
              border: '1px solid #e5e7eb',
              padding: '0 14px',
              outline: 'none',
              minWidth: 260,
              fontSize: 14,
            }}
          />

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CATEGORIES.map((c) => {
              const active = selectedCategory === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setSelectedCategory(c.key)}
                  style={{
                    height: 40,
                    padding: '0 14px',
                    borderRadius: 999,
                    border: active ? '1px solid rgba(185,28,28,0.30)' : '1px solid #e5e7eb',
                    background: active
                      ? 'linear-gradient(90deg,#f97316,#fb923c,#b91c1c)'
                      : '#ffffff',
                    color: active ? '#ffffff' : '#111827',
                    fontWeight: 900,
                    cursor: 'pointer',
                    boxShadow: active ? '0 10px 24px rgba(185,28,28,0.25)' : 'none',
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 14,
            border: '1px solid #fecaca',
            background: '#fff1f2',
            color: '#9f1239',
            fontWeight: 700,
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          <SkeletonGrid count={9} />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          {filtered.map((e) => (
            <PublicEventCard key={e.id} event={e} onOpen={onOpen} />
          ))}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{ marginTop: 16, color: '#6b7280', fontWeight: 700 }}>
          No encontré eventos con ese filtro. (Sí, la app te está juzgando en silencio 😄)
        </div>
      )}
    </div>
  );
}
