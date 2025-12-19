// apps/web/src/components/PublicEventCard.tsx
import { useMemo, useState, type CSSProperties } from 'react';
import type { Event } from '../api';

const COMMISSION_RATE = 0.1119;
const FALLBACK_EVENT_IMAGE = '/event-fallback.jpg';

function formatMoney(cents: number, currency: string) {
  // en CLP normalmente no quieres decimales
  const isCLP = (currency || 'CLP').toUpperCase() === 'CLP';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: currency || 'CLP',
    minimumFractionDigits: isCLP ? 0 : 2,
    maximumFractionDigits: isCLP ? 0 : 2,
  }).format((cents || 0) / 100);
}

function formatDateRowLabel(iso: string) {
  try {
    const d = new Date(iso);
    const wd = d
      .toLocaleDateString('es-CL', { weekday: 'short' })
      .replace('.', '')
      .toUpperCase();

    const day = d.toLocaleDateString('es-CL', { day: '2-digit' });
    const mon = d
      .toLocaleDateString('es-CL', { month: 'short' })
      .replace('.', '')
      .toUpperCase();

    const time = d.toLocaleTimeString('es-CL', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    return `${wd} | ${day} ${mon} | ${time}`;
  } catch {
    return iso;
  }
}

function getEventImageUrl(event: Event) {
  const anyEvent = event as any;
  return anyEvent.imageUrl || anyEvent.coverImageUrl || anyEvent.bannerUrl || FALLBACK_EVENT_IMAGE;
}

function getEventCardImage(event: Event) {
  const src = getEventImageUrl(event) || FALLBACK_EVENT_IMAGE;

  // local o raro => no proxy
  if (src.startsWith('/') || src.startsWith('data:') || src.startsWith('blob:')) {
    return { src, srcSet: undefined as string | undefined, sizes: undefined as string | undefined };
  }

  // solo proxy si es http(s)
  if (!/^https?:\/\//i.test(src)) {
    return { src: FALLBACK_EVENT_IMAGE, srcSet: undefined, sizes: undefined };
  }

  const enc = encodeURIComponent(src);
  const src480 = `/api/img?url=${enc}&w=480&q=70`;
  const src800 = `/api/img?url=${enc}&w=800&q=72`;
  const src1200 = `/api/img?url=${enc}&w=1200&q=75`;

  return {
    src: src800,
    srcSet: `${src480} 480w, ${src800} 800w, ${src1200} 1200w`,
    sizes: '(max-width: 640px) 100vw, (max-width: 1200px) 50vw, 33vw',
  };
}

function getPriceRangeLabel(event: Event) {
  const tts = event.ticketTypes ?? [];
  if (!tts.length) return '—';

  const currency = tts[0]?.currency || 'CLP';

  const finals = tts.map((tt) => {
    const base = tt.priceCents ?? 0;
    const fee = Math.round(base * COMMISSION_RATE);
    return base + fee;
  });

  const min = Math.min(...finals);
  const max = Math.max(...finals);

  if (min === max) return formatMoney(min, currency);
  return `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`;
}

export function PublicEventCard(props: { event: Event; onOpen: (e: Event) => void }) {
  const { event, onOpen } = props;

  const [hovered, setHovered] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const dateRow = useMemo(() => formatDateRowLabel(event.startDateTime), [event.startDateTime]);
  const priceRow = useMemo(() => getPriceRangeLabel(event), [event]);

  const img = useMemo(() => getEventCardImage(event), [event]);
  const fallbackUrl = FALLBACK_EVENT_IMAGE;

  const finalSrc = imgError ? fallbackUrl : img.src;
  const finalSrcSet = imgError ? undefined : img.srcSet;
  const finalSizes = imgError ? undefined : img.sizes;

  const shimmer: CSSProperties = {
    backgroundImage:
      'linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 100%)',
    backgroundSize: '200% 100%',
    animation: 'tc-shimmer 1.2s infinite',
  };

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
      <style>{`
        @keyframes tc-shimmer {
          0% { background-position: 0% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      <div
        style={{
          position: 'relative',
          borderRadius: 18,
          overflow: 'hidden',
          aspectRatio: '16 / 10',
          background: '#0b1220',
          boxShadow: '0 14px 30px rgba(0,0,0,0.35)',
        }}
      >
        {!imgLoaded && <div style={{ position: 'absolute', inset: 0, ...shimmer }} />}

        <div style={{ height: 190, ...shimmer }} />
        <div style={{ height: 18, width: '70%', borderRadius: 8, marginBottom: 10, ...shimmer }} />


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
          height={750}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            opacity: imgLoaded ? 1 : 0,
            transition: 'opacity 0.25s ease',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 2px' }}>
        <h3
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 900,
            color: '#f8fafc',
            lineHeight: 1.15,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {event.title}
        </h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M7 2v2M17 2v2M3.5 9h17M6 5h12a2.5 2.5 0 0 1 2.5 2.5v12A2.5 2.5 0 0 1 18 22H6A2.5 2.5 0 0 1 3.5 19.5v-12A2.5 2.5 0 0 1 6 5Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span>{dateRow}</span>
        </div>

        {/* rojo (reemplaza el verde) */}
        <div style={{ color: '#ef4444', fontWeight: 900, fontSize: 14 }}>{priceRow}</div>

        <div style={{ color: '#94a3b8', fontSize: 13 }}>
          {event.venueName} · {event.venueAddress}
        </div>
      </div>
    </div>
  );
}
