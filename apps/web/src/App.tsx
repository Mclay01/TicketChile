// apps/web/src/App.tsx
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import {
  fetchEvents,
  type Event,
  login,
  fetchMyTickets,
  type MyTicket,
  scanTicket,
  type CheckInResponse,
  createEvent,
  API_BASE_URL,
  createCheckoutSession,
  deleteEventApi,
} from './api';
import { NativeQrScanner } from './NativeQrScanner';
import CompraExitosaPage from './CompraExitosaPage';
import AppHeader from './components/AppHeader';

const EVENTS_CACHE_KEY = 'tiketera_events_cache_v1';
const EVENTS_CACHE_TTL_MS = 1000 * 60 * 3; // 3 min

type EventsCachePayload = { ts: number; data: Event[] };

function readEventsCache(): { data: Event[]; stale: boolean } | null {
  try {
    const raw = localStorage.getItem(EVENTS_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as EventsCachePayload;
    if (!parsed?.ts || !Array.isArray(parsed.data)) return null;

    const stale = Date.now() - parsed.ts > EVENTS_CACHE_TTL_MS;
    return { data: parsed.data, stale };
  } catch {
    return null;
  }
}


function writeEventsCache(data: Event[]) {
  try {
    // Guarda sólo campos útiles para el listado (ajusta a tu modelo real)
    const compact = data.slice(0, 150).map((e) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      startDateTime: e.startDateTime,
      venueName: e.venueName,
      venueAddress: e.venueAddress,
      ticketTypes: e.ticketTypes, // si esto pesa mucho, lo sacamos o guardamos solo lo mínimo
      // imageUrl/covers si existen en tu Event real:
      ...(e as any).imageUrl ? { imageUrl: (e as any).imageUrl } : {},
      ...(e as any).coverImageUrl ? { coverImageUrl: (e as any).coverImageUrl } : {},
      ...(e as any).bannerUrl ? { bannerUrl: (e as any).bannerUrl } : {},
    })) as unknown as Event[];

    localStorage.setItem(
      EVENTS_CACHE_KEY,
      JSON.stringify({ ts: Date.now(), data: compact }),
    );
  } catch (e) {
    // Si se llenó, borra y listo (así no queda basura acumulada)
    try { localStorage.removeItem(EVENTS_CACHE_KEY); } catch {}
  }
}

// Status interno normalizado para el check-in
type CheckInStatus = 'OK' | 'ALREADY_USED' | 'NOT_FOUND' | 'INVALID';

type View =
  | 'events'
  | 'login'
  | 'myTickets'
  | 'checkin'
  | 'organizer'
  | 'paymentSuccess';
type UserRole = 'ADMIN' | 'ORGANIZER' | 'CUSTOMER';

type PaymentStatus = 'idle' | 'success' | 'cancel' | 'error';

const PRIMARY_RED = '#7c1515';
const FALLBACK_EVENT_IMAGE =
  'https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinysrgb&w=1200';

function formatDateLabel(iso: string) {
  try {
    const d = new Date(iso);
    const weekday = d.toLocaleDateString('es-CL', { weekday: 'short' });
    const dayMonth = d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
    const time = d.toLocaleTimeString('es-CL', { hour: 'numeric', minute: '2-digit' });
    return `${weekday}, ${dayMonth} · ${time}`;
  } catch {
    return iso;
  }
}

function getEventCardImage(event: Event) {
  const src = getEventImageUrl(event) || '/event-fallback.jpg';

  // local o raro => no proxy
  if (src.startsWith('/') || src.startsWith('data:') || src.startsWith('blob:')) {
    return { src, srcSet: undefined as string | undefined, sizes: undefined as string | undefined };
  }

  // solo proxy si es http(s)
  if (!/^https?:\/\//i.test(src)) {
    return { src: '/event-fallback.jpg', srcSet: undefined, sizes: undefined };
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


function getEventImageUrl(event: Event) {
  const anyEvent = event as any;
  return (
    anyEvent.imageUrl ||
    anyEvent.coverImageUrl ||
    anyEvent.bannerUrl ||
    FALLBACK_EVENT_IMAGE
  );
}

function getMinFinalPriceLabel(event: Event) {
  const tts = event.ticketTypes ?? [];
  if (tts.length === 0) return '—';

  // OJO: asumimos misma moneda (CLP). Si mezclas monedas, ahí sí hay que decidir regla.
  const currency = tts[0]?.currency || 'CLP';

  const minFinal = Math.min(
    ...tts.map((tt) => (tt.priceCents ?? 0) + Math.round((tt.priceCents ?? 0) * COMMISSION_RATE)),
  );

  return formatPrice(minFinal, currency);
}


function formatDateTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const COMMISSION_RATE = 0.1119; // 11,19 %

function calcCommissionCents(priceCents: number) {
  // Redondeamos a centavos
  return Math.round(priceCents * COMMISSION_RATE);
}

function calcFinalPriceCents(priceCents: number) {
  return priceCents + calcCommissionCents(priceCents);
}

function formatPrice(cents: number, currency: string) {
  const amount = cents / 100;
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency,
  }).format(amount);
}


function decodeToken<T = unknown>(token: string | null): T | null {
  if (!token) return null;
  try {
    const payloadPart = token.split('.')[1];
    const decoded = JSON.parse(atob(payloadPart)) as T;
    return decoded;
  } catch {
    return null;
  }
}

function getRoleFromToken(token: string | null): UserRole | null {
  const decoded = decodeToken<{ role?: UserRole }>(token);
  return decoded?.role ?? null;
}

function getUserIdFromToken(token: string | null): string | null {
  const decoded = decodeToken<{ sub?: string }>(token);
  return decoded?.sub ?? null;
}

const FRONTEND_BASE_URL =
  typeof window !== 'undefined' ? window.location.origin : '';

/* ==================== LOGIN ==================== */

function LoginForm(props: { onSuccess: (token: string) => void }) {
  const { onSuccess } = props;
  const [email, setEmail] = useState('');       // 👈 antes: 'juan@example.com'
  const [password, setPassword] = useState(''); // 👈 antes: 'superseguro123'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const token = await login(email, password);
      onSuccess(token);
    } catch (err) {
      console.error(err);
      setError('Email o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      style={{
        marginTop: '24px',
        maxWidth: '360px',
      }}
    >
      <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
        Iniciar sesión organizador
      </h2>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        <label style={{ fontSize: '14px' }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="organizador@tudominio.cl"
            style={{
              width: '100%',
              marginTop: '4px',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #4b5563',
              background: '#020617',
              color: '#e5e7eb',
            }}
          />
        </label>

        <label style={{ fontSize: '14px' }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{
              width: '100%',
              marginTop: '4px',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #4b5563',
              background: '#020617',
              color: '#e5e7eb',
            }}
          />
        </label>

        {error && (
          <p style={{ color: '#f87171', fontSize: '13px' }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: '8px',
            padding: '8px 12px',
            borderRadius: '6px',
            border: 'none',
            background: loading ? '#4b5563' : 'linear-gradient(90deg,#f97316,#fb923c,#b91c1c)',
            color: '#ffffff',
            boxShadow: loading ? 'none' : '0 10px 24px rgba(185,28,28,0.35)',
            fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Ingresando...' : 'Entrar'}
        </button>
      </form>
    </section>
  );
}


/* ==================== MIS TICKETS (CON QR) ==================== */

function MyTicketsSection(props: {
  tickets: MyTicket[];
  loading: boolean;
  error: string | null;
  isLoggedIn: boolean;
  onRequireLogin: () => void;
}) {
  const { tickets, loading, error, isLoggedIn, onRequireLogin } = props;

  if (!isLoggedIn) {
    return (
      <section style={{ marginTop: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
          Mis tickets
        </h2>
        <p style={{ fontSize: '14px' }}>
          Debes iniciar sesión para ver tus tickets.{' '}
          <button
            onClick={onRequireLogin}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#38bdf8',
              textDecoration: 'underline',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Iniciar sesión
          </button>
        </p>
      </section>
    );
  }

  return (
    <section style={{ marginTop: '24px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
        Mis tickets
      </h2>

      {loading && tickets.length === 0 && <p>Cargando tickets...</p>}
      {error && <p style={{ color: '#f87171' }}>{error}</p>}

      {!loading && !error && tickets.length === 0 && (
        <p style={{ fontSize: '14px' }}>
          Todavía no tienes tickets comprados con esta cuenta.
        </p>
      )}

      <div
        style={{
          marginTop: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {tickets
          .slice()
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          .map((t) => {
            const qrSize = 120;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(
              t.code,
            )}`;

            return (
              <article
                key={t.id}
                style={{
                  borderRadius: '10px',
                  background: '#020617',
                  padding: '12px 14px',
                  border: '1px solid #1f2937',
                  fontSize: '13px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'stretch',
                  }}
                >
                  {/* Info del ticket */}
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '4px',
                      }}
                    >
                      <strong>{t.order.event.title}</strong>
                      <span
                        style={{
                          fontWeight: 600,
                          color:
                            t.status === 'VALID'
                              ? '#22c55e'
                              : t.status === 'USED'
                              ? '#eab308'
                              : '#f87171',
                        }}
                      >
                        {t.status === 'VALID'
                          ? 'Válido'
                          : t.status === 'USED'
                          ? 'Usado'
                          : 'Cancelado'}
                      </span>
                    </div>

                    <div style={{ opacity: 0.9 }}>
                      <div>
                        <strong>Fecha:</strong>{' '}
                        {formatDateTime(t.order.event.startDateTime)}
                      </div>
                      <div>
                        <strong>Lugar:</strong> {t.order.event.venueName} ·{' '}
                        {t.order.event.venueAddress}
                      </div>
                      <div>
                        <strong>Entrada:</strong> {t.ticketType.name} ·{' '}
                        {formatPrice(
                          t.ticketType.priceCents,
                          t.ticketType.currency,
                        )}
                      </div>
                      <div>
                        <strong>Código:</strong> {t.code}
                      </div>
                    </div>
                  </div>

                  {/* QR */}
                  <div
                    style={{
                      width: `${qrSize}px`,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                  >
                    <img
                      src={qrUrl}
                      alt={`QR ticket ${t.code}`}
                      style={{
                        width: '100%',
                        height: 'auto',
                        borderRadius: '8px',
                        background: '#020617',
                        padding: '4px',
                        border: '1px dashed #1f2937',
                      }}
                    />
                    <span style={{ fontSize: '11px', opacity: 0.7 }}>
                      Escanea este QR en el acceso
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
      </div>
    </section>
  );
}

/* ==================== EVENT CARD (COMPRA) ==================== */

interface EventCardProps {
  event: Event;
  isLoggedIn: boolean;
  token: string | null;
  userId: string | null;
}

function storeFlowTokenFromCheckoutUrl(checkoutUrl: string) {
  if (typeof window === 'undefined') return;

  try {
    const url = new URL(checkoutUrl);
    const token = url.searchParams.get('token');
    if (token) {
      localStorage.setItem('tiketera_last_flow_token', token);
    }
  } catch (err) {
    console.error('No se pudo leer el token de Flow desde checkoutUrl', err);
  }
}

function EventCard({ event, isLoggedIn, token, userId }: EventCardProps) {
  const [ticketTypeId, setTicketTypeId] = useState(
    event.ticketTypes[0]?.id ?? '',
  );
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Comprador público (sin login)
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');

  // --- cálculo de comisión solo para mostrar y para el monto final ---
  const selectedTicketType =
    event.ticketTypes.find((tt) => tt.id === ticketTypeId) ??
    event.ticketTypes[0];

  const basePriceCents = selectedTicketType?.priceCents ?? 0;
  const commissionPerTicketCents = Math.round(
    basePriceCents * COMMISSION_RATE,
  );
  const displayFinalPriceCents = basePriceCents + commissionPerTicketCents;

  async function handleBuyClick() {
    setError(null);
    setSuccess(null);

    if (!ticketTypeId) {
      setError('Selecciona un tipo de entrada');
      return;
    }
    if (quantity < 1) {
      setError('La cantidad debe ser al menos 1');
      return;
    }

    if (!selectedTicketType) {
      setError('Tipo de entrada inválido');
      return;
    }

    // --- montos con comisión ---
    const baseTotalCents = basePriceCents * quantity;
    const commissionTotalCents = commissionPerTicketCents * quantity;
    const totalAmountCents = baseTotalCents + commissionTotalCents;
    const currency = selectedTicketType.currency || 'CLP';

    const successUrl = `${FRONTEND_BASE_URL}/compra-exitosa`;
    const cancelUrl = `${FRONTEND_BASE_URL}?payment=cancel`;

    // 🟢 COMPRA PÚBLICA (sin login)
    if (!isLoggedIn || !token) {
      if (!buyerEmail || !buyerName) {
        setError('Ingresa tu nombre y correo para enviar los tickets');
        return;
      }

      try {
        setLoading(true);

        localStorage.setItem(
          'tiketera_pending_payment',
          JSON.stringify({
            mode: 'PUBLIC',
            eventId: event.id,
            ticketTypeId,
            quantity,
            buyerName,
            buyerEmail,
          }),
        );

        const checkoutUrl = await createCheckoutSession({
          amountCents: totalAmountCents,
          currency,
          successUrl,
          cancelUrl,
          metadata: {
            mode: 'PUBLIC',
            eventId: event.id,
            ticketTypeId,
            quantity: String(quantity),
            buyerName,
            buyerEmail,
          },
        });

        storeFlowTokenFromCheckoutUrl(checkoutUrl);
        window.location.href = checkoutUrl;
      } catch (err) {
        console.error('Public purchase payment error', err);
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'No se pudo iniciar el pago.',
        );
        localStorage.removeItem('tiketera_pending_payment');
      } finally {
        setLoading(false);
      }

      return;
    }

    // 🔵 COMPRA CON LOGIN (usuario autenticado)
    if (!userId) {
      setError(
        'No se pudo identificar tu sesión. Vuelve a iniciar sesión e intenta de nuevo.',
      );
      return;
    }

    try {
      setLoading(true);

      localStorage.setItem(
        'tiketera_pending_payment',
        JSON.stringify({
          mode: 'PRIVATE',
          eventId: event.id,
          ticketTypeId,
          quantity,
        }),
      );

      const checkoutUrl = await createCheckoutSession({
        amountCents: totalAmountCents,
        currency,
        successUrl,
        cancelUrl,
        metadata: {
          mode: 'PRIVATE',
          eventId: event.id,
          ticketTypeId,
          quantity: String(quantity),
          buyerUserId: userId,
        },
      });

      storeFlowTokenFromCheckoutUrl(checkoutUrl);
      window.location.href = checkoutUrl;
    } catch (err) {
      console.error('Private purchase payment error', err);
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'No se pudo iniciar el pago.',
      );
      localStorage.removeItem('tiketera_pending_payment');
    } finally {
      setLoading(false);
    }
  }

  return (
    <article
      style={{
        borderRadius: '12px',
        background: '#111827',
        padding: '16px',
        border: '1px solid #1f2937',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <h2 style={{ fontSize: '18px', fontWeight: 600 }}>{event.title}</h2>

      <p
        style={{
          fontSize: '14px',
          opacity: 0.9,
          maxHeight: '3.2em',
          overflow: 'hidden',
        }}
      >
        {event.description}
      </p>

      <div style={{ fontSize: '13px', opacity: 0.85 }}>
        <div>
          <strong>Fecha:</strong> {formatDateTime(event.startDateTime)}
        </div>
        <div>
          <strong>Lugar:</strong> {event.venueName} · {event.venueAddress}
        </div>
        <div>
          <strong>Organiza:</strong> {"PRODUCTORA"}
        </div>
      </div>

      {event.ticketTypes.length > 0 && (
        <>
          <div
            style={{
              marginTop: '8px',
              paddingTop: '8px',
              borderTop: '1px solid #1f2937',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <strong style={{ fontSize: '13px' }}>Entradas:</strong>
            {event.ticketTypes.map((tt) => {
              const isSelected = tt.id === ticketTypeId;

              const baseCents = tt.priceCents ?? 0;
              const commissionCents = Math.round(baseCents * COMMISSION_RATE);
              const finalCents = baseCents + commissionCents;

              return (
                <div
                  key={tt.id}
                  style={{
                    fontSize: '13px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 8,
                  }}
                >
                  <span>{tt.name}</span>

                  <div
                    style={{
                      textAlign: 'right',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    {/* Precio base */}
                    <span>{formatPrice(tt.priceCents, tt.currency)}</span>

                    {/* Solo mostramos comisión + total para el tipo seleccionado */}
                    {isSelected && (
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#9ca3af',
                        }}
                      >
                        Comisión: {formatPrice(commissionCents, tt.currency || 'CLP')} ·
                        Total: {formatPrice(finalCents, tt.currency || 'CLP')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: '8px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            {/* Inputs para comprador público */}
            {!isLoggedIn && (
              <>
                <input
                  placeholder="Tu nombre"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: '1px solid #4b5563',
                    background: '#020617',
                    color: '#e5e7eb',
                    fontSize: '13px',
                  }}
                />
                <input
                  placeholder="Tu correo"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: '1px solid #4b5563',
                    background: '#020617',
                    color: '#e5e7eb',
                    fontSize: '13px',
                  }}
                />
              </>
            )}

            <select
              value={ticketTypeId}
              onChange={(e) => setTicketTypeId(e.target.value)}
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid #4b5563',
                background: '#020617',
                color: '#e5e7eb',
                fontSize: '13px',
              }}
            >
              {event.ticketTypes.map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {tt.name}
                </option>
              ))}
            </select>

            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) =>
                setQuantity(Math.max(1, Number(e.target.value) || 1))
              }
              style={{
                width: '70px',
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid #4b5563',
                background: '#020617',
                color: '#e5e7eb',
                fontSize: '13px',
              }}
            />

            <button
              type="button"
              onClick={handleBuyClick}
              disabled={loading}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: loading ? '#4b5563' : '#22c55e',
                color: '#020617',
                fontWeight: 600,
                cursor: loading ? 'default' : 'pointer',
              }}
            >
              {loading ? 'Comprando...' : 'Comprar'}
            </button>
          </div>

          {(error || success) && (
            <p
              style={{
                fontSize: '12px',
                marginTop: '4px',
                color: error ? '#f87171' : '#22c55e',
              }}
            >
              {error ?? success}
            </p>
          )}
        </>
      )}
    </article>
  );
}




/* ==================== CHECK-IN ==================== */

function CheckInPanel(props: {
  token: string | null;
  role: UserRole | null;
  onRequireLogin: () => void;
}) {
  const { token, role, onRequireLogin } = props;
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckInResponse | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  // Tarjeta flotante
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Evitar doble check-in por misma lectura del QR
  const [lastScanInfo, setLastScanInfo] = useState<{
    code: string;
    time: number;
  } | null>(null);

  const canCheckIn = !!token && role && role !== 'CUSTOMER';

  // Normaliza el status que venga del backend a nuestro union interno
  function normalizeStatus(raw: any): CheckInStatus {
    if (!raw || typeof raw !== 'string') return 'INVALID';

    const s = raw.toUpperCase();

    if (s === 'VALID' || s === 'OK') return 'OK';
    if (s === 'USED' || s === 'ALREADY_USED') return 'ALREADY_USED';
    if (s === 'NOT_FOUND') return 'NOT_FOUND';

    return 'INVALID';
  }

  async function scanCode(rawCode: string) {
    if (loading) return;

    if (!token) {
      onRequireLogin();
      return;
    }

    if (!canCheckIn) {
      setError('No tienes permisos para realizar check-in.');
      return;
    }

    const trimmed = rawCode.trim();
    if (!trimmed) {
      setError('Ingresa un código de ticket.');
      return;
    }

    // Evitar disparar múltiples veces el mismo código en 2 segundos
    const now = Date.now();
    if (
      lastScanInfo &&
      lastScanInfo.code === trimmed &&
      now - lastScanInfo.time < 2000
    ) {
      return;
    }
    setLastScanInfo({ code: trimmed, time: now });

    try {
      setLoading(true);
      setError(null);
      setResult(null);
      setToast(null);

      const rawRes = await scanTicket(token ?? '', trimmed);

      const normalizedStatus = normalizeStatus((rawRes as any).status);
      const res: CheckInResponse = {
        ...rawRes,
        status: normalizedStatus,
      };

      setResult(res);

      if (res.status === 'OK') {
        setToast({ type: 'success', message: 'Verificado' });
      } else if (res.status === 'ALREADY_USED') {
        setToast({ type: 'error', message: 'No válido (ya escaneado)' });
      } else if (res.status === 'NOT_FOUND' || res.status === 'INVALID') {
        setToast({ type: 'error', message: 'No válido' });
      }

      if (res.status) {
        window.setTimeout(() => setToast(null), 2500);
      }
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.message === 'UNAUTHORIZED') {
        setError('Sesión expirada. Vuelve a iniciar sesión.');
        onRequireLogin();
      } else if (err instanceof Error && err.message === 'FORBIDDEN') {
        setError('No tienes permisos para realizar check-in.');
      } else {
        setError('Error al escanear el ticket.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleScan(e: FormEvent) {
    e.preventDefault();
    await scanCode(code);
  }

  function statusColor(status: CheckInResponse['status']) {
    const s = normalizeStatus(status);
    switch (s) {
      case 'OK':
        return '#22c55e';
      case 'ALREADY_USED':
        return '#eab308';
      default:
        return '#f87171';
    }
  }

  if (!token) {
    return (
      <section style={{ marginTop: '24px', maxWidth: '520px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
          Check-in
        </h2>
        <p style={{ fontSize: '14px' }}>
          Debes iniciar sesión como organizador para escanear tickets.{' '}
          <button
            onClick={onRequireLogin}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#38bdf8',
              textDecoration: 'underline',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Iniciar sesión
          </button>
        </p>
      </section>
    );
  }

  if (role === 'CUSTOMER' || !role) {
    return (
      <section style={{ marginTop: '24px', maxWidth: '520px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
          Check-in
        </h2>
        <p style={{ fontSize: '14px' }}>
          Esta sección es solo para organizadores o administradores.
        </p>
      </section>
    );
  }

  return (
    <section
      style={{ marginTop: '24px', maxWidth: '520px', position: 'relative' }}
    >
      <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
        Check-in
      </h2>

      <form
        onSubmit={handleScan}
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '12px',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Pega el código del ticket"
          style={{
            flex: 1,
            minWidth: '220px',
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid #4b5563',
            background: '#020617',
            color: '#e5e7eb',
            fontSize: '13px',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: 'none',
            background: loading ? '#4b5563' : '#22c55e',
            color: '#020617',
            fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Verificando...' : 'Escanear'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setScannerError(null);
          setScannerActive((prev) => !prev);
        }}
        style={{
          padding: '6px 10px',
          borderRadius: '6px',
          border: '1px solid #4b5563',
          background: scannerActive ? '#1d4ed8' : 'transparent',
          color: '#e5e7eb',
          fontSize: '13px',
          cursor: 'pointer',
          marginBottom: '8px',
        }}
      >
        {scannerActive ? 'Detener cámara' : 'Escanear con cámara'}
      </button>

      {scannerActive && (
        <div style={{ marginTop: '4px', marginBottom: '12px' }}>
          <p
            style={{
              fontSize: '12px',
              marginBottom: '4px',
              opacity: 0.8,
            }}
          >
            Apunta la cámara al QR del ticket.
          </p>

          <NativeQrScanner
            onResult={(text) => {
              setCode(text);
              void scanCode(text);
            }}
            onError={(err) => {
              console.error('Error QR (BarcodeDetector):', err);
              let message = 'No se pudo acceder a la cámara.';

              if (err instanceof Error) {
                if (err.name === 'NotAllowedError') {
                  message = 'Permiso de cámara denegado en el navegador.';
                } else if (err.name === 'NotFoundError') {
                  message = 'No se encontró ninguna cámara en el dispositivo.';
                } else if (
                  err.message.includes('BarcodeDetector') ||
                  err.message.includes('no soportado')
                ) {
                  message =
                    'Este navegador no soporta la API nativa de QR (BarcodeDetector). Prueba con otro navegador o dispositivo.';
                }
              }

              setScannerError(message);
            }}
          />

          {scannerError && (
            <p
              style={{
                fontSize: '12px',
                color: '#f87171',
                marginTop: '4px',
              }}
            >
              {scannerError}
            </p>
          )}
        </div>
      )}

      {error && (
        <p style={{ fontSize: '13px', color: '#f87171', marginBottom: '8px' }}>
          {error}
        </p>
      )}

      {result && (
        <div
          style={{
            marginTop: '8px',
            borderRadius: '10px',
            background: '#020617',
            padding: '12px 14px',
            border: '1px solid #1f2937',
            fontSize: '13px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <strong>Resultado</strong>
            <span style={{ color: statusColor(result.status), fontWeight: 600 }}>
              {normalizeStatus(result.status) === 'OK'
                ? 'Válido'
                : normalizeStatus(result.status) === 'ALREADY_USED'
                ? 'Ya usado'
                : normalizeStatus(result.status) === 'NOT_FOUND'
                ? 'No encontrado'
                : 'Inválido'}
            </span>
          </div>

          {result.ticket ? (
            <div style={{ opacity: 0.9 }}>
              <div>
                <strong>Evento:</strong> {result.ticket.order.event.title}
              </div>
              <div>
                <strong>Fecha:</strong>{' '}
                {formatDateTime(result.ticket.order.event.startDateTime)}
              </div>
              <div>
                <strong>Lugar:</strong>{' '}
                {result.ticket.order.event.venueName} ·{' '}
                {result.ticket.order.event.venueAddress}
              </div>
              <div>
                <strong>Entrada:</strong> {result.ticket.ticketType.name} ·{' '}
                {formatPrice(
                  result.ticket.ticketType.priceCents,
                  result.ticket.ticketType.currency,
                )}
              </div>
              <div>
                <strong>Asistente:</strong> {result.ticket.attendeeName} (
                {result.ticket.attendeeEmail})
              </div>
              <div>
                <strong>Código:</strong> {result.ticket.code}
              </div>
              {result.ticket.status === 'USED' && result.ticket.usedAt && (
                <div>
                  <strong>Usado en:</strong>{' '}
                  {formatDateTime(result.ticket.usedAt)}
                </div>
              )}
            </div>
          ) : (
            <p style={{ marginTop: '4px' }}>
              No se encontró información del ticket.
            </p>
          )}
        </div>
      )}

      {/* TOAST FLOTANTE VERDE/ROJO */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            background: toast.type === 'success' ? '#16a34a' : '#dc2626',
            color: '#ecfdf5',
            padding: '10px 14px',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
            zIndex: 9999,
            fontSize: 13,
          }}
        >
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: '999px',
              border: '2px solid rgba(255,255,255,0.7)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              background:
                toast.type === 'success' ? '#22c55e' : '#b91c1c',
            }}
          >
            {toast.type === 'success' ? '✓' : '✕'}
          </span>
          <span>{toast.message}</span>
        </div>
      )}
    </section>
  );
}

/* ==================== PANEL ORGANIZADOR ==================== */

type TicketForm = {
  name: string;
  description: string;
  price: string;
  capacity: string;
  currency: string;
};

function OrganizerPanel(props: {
  token: string | null;
  role: UserRole | null;
  userId: string | null;
  events: Event[];
  eventsLoading: boolean;
  eventsError: string | null;
  onRequireLogin: () => void;
  onEventCreated: () => void;
  onEventDeleted: (eventId: string) => void;
}) {
  const {
    token,
    role,
    userId,
    events,
    eventsLoading,
    eventsError,
    onRequireLogin,
    onEventCreated,
    onEventDeleted,
  } = props;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [totalCapacity, setTotalCapacity] = useState('');
  const [ticketTypes, setTicketTypes] = useState<TicketForm[]>([
    {
      name: 'General',
      description: '',
      price: '1500',
      capacity: '100',
      currency: 'CLP',
    },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleDeleteEventClick(eventId: string) {
    if (!token) {
      onRequireLogin();
      return;
    }

    const ok = window.confirm(
      '¿Seguro que quieres eliminar este evento? Solo se puede eliminar si no tiene tickets vendidos.',
    );
    if (!ok) return;

    try {
      setError(null);
      setSuccess(null);

      await deleteEventApi(token ?? '', eventId);

      onEventDeleted(eventId);

      setSuccess('Evento eliminado / archivado correctamente.');
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.message === 'UNAUTHORIZED') {
        setError('Sesión expirada. Vuelve a iniciar sesión.');
        onRequireLogin();
      } else if (err instanceof Error && err.message === 'FORBIDDEN') {
        setError('No tienes permisos para eliminar este evento.');
      } else if (err instanceof Error) {
        setError(err.message || 'No se pudo eliminar el evento.');
      } else {
        setError('No se pudo eliminar el evento.');
      }
    }
  }

  if (!token) {
    return (
      <section style={{ marginTop: '24px', maxWidth: '640px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
          Panel de organizador
        </h2>
        <p style={{ fontSize: '14px' }}>
          Debes iniciar sesión como organizador para crear eventos.{' '}
          <button
            onClick={onRequireLogin}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#38bdf8',
              textDecoration: 'underline',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Iniciar sesión
          </button>
        </p>
      </section>
    );
  }

  if (role === 'CUSTOMER' || !role) {
    return (
      <section style={{ marginTop: '24px', maxWidth: '640px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
          Panel de organizador
        </h2>
        <p style={{ fontSize: '14px' }}>
          Esta sección es solo para organizadores o administradores.
        </p>
      </section>
    );
  }

  function handleTicketChange(
    index: number,
    field: keyof TicketForm,
    value: string,
  ) {
    setTicketTypes((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    );
  }

  function handleAddTicket() {
    setTicketTypes((prev) => [
      ...prev,
      {
        name: '',
        description: '',
        price: '',
        capacity: '',
        currency: 'CLP',
      },
    ]);
  }

  function handleRemoveTicket(index: number) {
    setTicketTypes((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();

    if (!token) {
      onRequireLogin();
      return;
    }

    setError(null);
    setSuccess(null);

    if (!title.trim()) {
      setError('El título es obligatorio.');
      return;
    }
    if (!venueName.trim() || !venueAddress.trim()) {
      setError('El lugar y la dirección son obligatorios.');
      return;
    }
    if (!date || !startTime || !endTime) {
      setError('Fecha y horario son obligatorios.');
      return;
    }

    const totalCapacityNum = Number(totalCapacity);
    if (!Number.isFinite(totalCapacityNum) || totalCapacityNum <= 0) {
      setError('Capacidad total inválida.');
      return;
    }

    const validTickets = ticketTypes.filter(
      (t) =>
        t.name.trim() &&
        t.price.trim() &&
        t.capacity.trim() &&
        Number(t.capacity) > 0,
    );

    if (validTickets.length === 0) {
      setError('Agrega al menos un tipo de ticket con precio y capacidad.');
      return;
    }

    const ticketInputs = validTickets.map((t) => {
      const priceNumber = Number(t.price);
      const capacityNumber = Number(t.capacity);
      return {
        name: t.name.trim(),
        description: t.description.trim() || undefined,
        priceCents: Math.round(priceNumber * 100),
        currency: t.currency || 'CLP',
        capacity: capacityNumber,
      };
    });

    const sumCapacity = ticketInputs.reduce((sum, t) => sum + t.capacity, 0);
    if (sumCapacity > totalCapacityNum) {
      setError(
        'La suma de las capacidades de los tickets no puede ser mayor que la capacidad total.',
      );
      return;
    }

    const start = new Date(`${date}T${startTime}:00`);
    const end = new Date(`${date}T${endTime}:00`);

    if (end <= start) {
      setError('La hora de término debe ser después de la de inicio.');
      return;
    }

    try {
      setLoading(true);

      await createEvent(token ?? '', {
        title: title.trim(),
        description: description.trim(),
        venueName: venueName.trim(),
        venueAddress: venueAddress.trim(),
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
        totalCapacity: totalCapacityNum,
        ticketTypes: ticketInputs,
      });

      setSuccess('Evento creado correctamente.');
      setTitle('');
      setDescription('');
      setVenueName('');
      setVenueAddress('');
      setDate('');
      setStartTime('');
      setEndTime('');
      setTotalCapacity('');
      setTicketTypes([
        {
          name: 'General',
          description: '',
          price: '1500',
          capacity: '100',
          currency: 'CLP',
        },
      ]);

      onEventCreated();
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.message === 'UNAUTHORIZED') {
        setError('Sesión expirada. Vuelve a iniciar sesión.');
        onRequireLogin();
      } else if (err instanceof Error && err.message === 'FORBIDDEN') {
        setError('No tienes permisos para crear eventos.');
      } else {
        setError('No se pudo crear el evento.');
      }
    } finally {
      setLoading(false);
    }
  }

  const myEvents = (userId
    ? events.filter(
        (e) =>
          (e.organizerId === userId || e.organizer?.id === userId) &&
          e.status !== 'CANCELLED',
      )
    : []
  )
    .slice()
    .sort(
      (a, b) =>
        new Date(a.startDateTime).getTime() -
        new Date(b.startDateTime).getTime(),
    );

  return (
    <section style={{ marginTop: '24px', maxWidth: '720px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
        Panel de organizador
      </h2>

      <form
        onSubmit={handleCreate}
        style={{
          borderRadius: '12px',
          background: '#111827',
          padding: '16px',
          border: '1px solid #1f2937',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginBottom: '24px',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Crear evento</h3>

        <label style={{ fontSize: '13px' }}>
          Título
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              width: '100%',
              marginTop: '4px',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #4b5563',
              background: '#020617',
              color: '#e5e7eb',
            }}
          />
        </label>

        <label style={{ fontSize: '13px' }}>
          Descripción
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              marginTop: '4px',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #4b5563',
              background: '#020617',
              color: '#e5e7eb',
              resize: 'vertical',
            }}
          />
        </label>

        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <label style={{ fontSize: '13px', flex: 1, minWidth: '160px' }}>
            Lugar (nombre)
            <input
              type="text"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              style={{
                width: '100%',
                marginTop: '4px',
                padding: '8px',
                borderRadius: '6px',
                border: '1px solid #4b5563',
                background: '#020617',
                color: '#e5e7eb',
              }}
            />
          </label>

          <label style={{ fontSize: '13px', flex: 1, minWidth: '200px' }}>
            Dirección
            <input
              type="text"
              value={venueAddress}
              onChange={(e) => setVenueAddress(e.target.value)}
              style={{
                width: '100%',
                marginTop: '4px',
                padding: '8px',
                borderRadius: '6px',
                border: '1px solid #4b5563',
                background: '#020617',
                color: '#e5e7eb',
              }}
            />
          </label>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <label style={{ fontSize: '13px' }}>
            Fecha
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                marginTop: '4px',
                padding: '8px',
                borderRadius: '6px',
                border: '1px solid #4b5563',
                background: '#020617',
                color: '#e5e7eb',
              }}
            />
          </label>

          <label style={{ fontSize: '13px' }}>
            Hora inicio
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={{
                marginTop: '4px',
                padding: '8px',
                borderRadius: '6px',
                border: '1px solid #4b5563',
                background: '#020617',
                color: '#e5e7eb',
              }}
            />
          </label>

          <label style={{ fontSize: '13px' }}>
            Hora término
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              style={{
                marginTop: '4px',
                padding: '8px',
                borderRadius: '6px',
                border: '1px solid #4b5563',
                background: '#020617',
                color: '#e5e7eb',
              }}
            />
          </label>

          <label style={{ fontSize: '13px' }}>
            Capacidad total
            <input
              type="number"
              min={1}
              value={totalCapacity}
              onChange={(e) => setTotalCapacity(e.target.value)}
              style={{
                marginTop: '4px',
                padding: '8px',
                borderRadius: '6px',
                border: '1px solid #4b5563',
                background: '#020617',
                color: '#e5e7eb',
              }}
            />
          </label>
        </div>

        <div
          style={{
            marginTop: '8px',
            borderTop: '1px solid #1f2937',
            paddingTop: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <strong style={{ fontSize: '13px' }}>Tipos de ticket</strong>

          {ticketTypes.map((t, index) => (
            <div
              key={index}
              style={{
                borderRadius: '8px',
                border: '1px solid #1f2937',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                background: '#020617',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <label style={{ fontSize: '13px', flex: 1 }}>
                  Nombre
                  <input
                    type="text"
                    value={t.name}
                    onChange={(e) =>
                      handleTicketChange(index, 'name', e.target.value)
                    }
                    style={{
                      width: '100%',
                      marginTop: '4px',
                      padding: '6px',
                      borderRadius: '6px',
                      border: '1px solid #4b5563',
                      background: '#020617',
                      color: '#e5e7eb',
                      fontSize: '13px',
                    }}
                  />
                </label>

                <label style={{ fontSize: '13px', width: '120px' }}>
                  Precio ({t.currency})
                  <input
                    type="number"
                    min={0}
                    value={t.price}
                    onChange={(e) =>
                      handleTicketChange(index, 'price', e.target.value)
                    }
                    style={{
                      width: '100%',
                      marginTop: '4px',
                      padding: '6px',
                      borderRadius: '6px',
                      border: '1px solid #4b5563',
                      background: '#020617',
                      color: '#e5e7eb',
                      fontSize: '13px',
                    }}
                  />
                </label>

                <label style={{ fontSize: '13px', width: '110px' }}>
                  Capacidad
                  <input
                    type="number"
                    min={0}
                    value={t.capacity}
                    onChange={(e) =>
                      handleTicketChange(index, 'capacity', e.target.value)
                    }
                    style={{
                      width: '100%',
                      marginTop: '4px',
                      padding: '6px',
                      borderRadius: '6px',
                      border: '1px solid #4b5563',
                      background: '#020617',
                      color: '#e5e7eb',
                      fontSize: '13px',
                    }}
                  />
                </label>
              </div>

              <label style={{ fontSize: '13px' }}>
                Descripción (opcional)
                <input
                  type="text"
                  value={t.description}
                  onChange={(e) =>
                    handleTicketChange(index, 'description', e.target.value)
                  }
                  style={{
                    width: '100%',
                    marginTop: '4px',
                    padding: '6px',
                    borderRadius: '6px',
                    border: '1px solid #4b5563',
                    background: '#020617',
                    color: '#e5e7eb',
                    fontSize: '13px',
                  }}
                />
              </label>

              {ticketTypes.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveTicket(index)}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#b91c1c',
                    color: '#e5e7eb',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Eliminar tipo
                </button>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={handleAddTicket}
            style={{
              alignSelf: 'flex-start',
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #4b5563',
              background: 'transparent',
              color: '#e5e7eb',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            + Agregar tipo de ticket
          </button>
        </div>

        {error && (
          <p style={{ fontSize: '13px', color: '#f87171' }}>{error}</p>
        )}
        {success && (
          <p style={{ fontSize: '13px', color: '#22c55e' }}>{success}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: '8px',
            alignSelf: 'flex-start',
            padding: '8px 12px',
            borderRadius: '6px',
            border: 'none',
            background: loading ? '#4b5563' : '#22c55e',
            color: '#020617',
            fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Creando...' : 'Crear evento'}
        </button>
      </form>

      <div>
        <h3
          style={{
            fontSize: '16px',
            fontWeight: 600,
            marginBottom: '8px',
          }}
        >
          Mis eventos
        </h3>

        {eventsLoading && <p>Cargando eventos...</p>}
        {eventsError && (
          <p style={{ color: '#f87171', fontSize: '13px' }}>{eventsError}</p>
        )}

        {!eventsLoading && !eventsError && myEvents.length === 0 && (
          <p style={{ fontSize: '14px' }}>
            Todavía no has creado eventos con esta cuenta.
          </p>
        )}

        <div
          style={{
            marginTop: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {myEvents.map((event) => (
            <article
              key={event.id}
              style={{
                borderRadius: '10px',
                background: '#020617',
                padding: '12px 14px',
                border: '1px solid #1f2937',
                fontSize: '13px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '4px',
                }}
              >
                <div>
                  <strong>{event.title}</strong>{' '}
                  <span
                    style={{
                      fontWeight: 600,
                      marginLeft: 8,
                      color:
                        event.status === 'CANCELLED'
                          ? '#f87171'
                          : event.status === 'DRAFT'
                          ? '#eab308'
                          : '#22c55e',
                    }}
                  >
                    {event.status ?? 'PUBLISHED'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteEventClick(event.id)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #7f1d1d',
                    background: '#991b1b',
                    color: '#fee2e2',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Eliminar
                </button>
              </div>

              <div style={{ opacity: 0.9 }}>
                <div>
                  <strong>Fecha:</strong> {formatDateTime(event.startDateTime)}
                </div>
                <div>
                  <strong>Lugar:</strong> {event.venueName} ·{' '}
                  {event.venueAddress}
                </div>
                {event.totalCapacity != null && (
                  <div>
                    <strong>Capacidad total:</strong> {event.totalCapacity}
                  </div>
                )}
                <div>
                  <strong>Tipos de ticket:</strong> {event.ticketTypes.length}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

type PendingPayment =
  | {
      mode: 'PUBLIC';
      eventId: string;
      ticketTypeId: string;
      quantity: number;
      buyerName: string;
      buyerEmail: string;
    }
  | {
      mode: 'PRIVATE';
      eventId: string;
      ticketTypeId: string;
      quantity: number;
    }
  | null;

function PaymentSuccessView(props: {
  onGoHome: () => void;
  onGoMyTickets: () => void;
}) {
  const { onGoHome, onGoMyTickets } = props;
  const [pending, setPending] = useState<PendingPayment>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('tiketera_pending_payment');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setPending(parsed);
      // limpiar para que no quede pegado
      localStorage.removeItem('tiketera_pending_payment');
    } catch (e) {
      console.error('Error leyendo tiketera_pending_payment', e);
    }
  }, []);

  const isPublic = pending?.mode === 'PUBLIC';

  function handleGoHome() {
    onGoHome();
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, document.title, '/');
    }
  }

  function handleGoMyTickets() {
    onGoMyTickets();
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, document.title, '/');
    }
  }

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          background: '#020617',
          borderRadius: 16,
          border: '1px solid #1f2937',
          padding: 24,
          boxShadow: '0 18px 45px rgba(0,0,0,0.6)',
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          ✅ ¡Pago recibido!
        </h1>

        <p style={{ fontSize: 14, opacity: 0.9, marginBottom: 16 }}>
          Tu compra fue procesada correctamente.
        </p>

        {pending ? (
          <div
            style={{
              borderRadius: 12,
              border: '1px solid #1f2937',
              padding: 16,
              marginBottom: 16,
              background:
                'radial-gradient(circle at top, rgba(34,197,94,0.1), transparent)',
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Resumen de compra
            </h2>
            <p style={{ fontSize: 14, marginBottom: 4 }}>
              <strong>Cantidad:</strong> {pending.quantity} entrada
              {pending.quantity > 1 ? 's' : ''}
            </p>
            {isPublic && (
              <>
                <p style={{ fontSize: 14, marginBottom: 4 }}>
                  <strong>Nombre:</strong>{' '}
                  {(pending as any).buyerName || 'Cliente'}
                </p>
                <p style={{ fontSize: 14, marginBottom: 4 }}>
                  <strong>Correo:</strong>{' '}
                  {(pending as any).buyerEmail || '—'}
                </p>
              </>
            )}
            <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
              * Los datos exactos del evento vienen del backend, pero tu pago ya
              quedó asociado a la orden.
            </p>
          </div>
        ) : (
          <p style={{ fontSize: 13, opacity: 0.75, marginBottom: 16 }}>
            No encontramos los datos de la compra reciente. Puede que esta
            página haya sido recargada o abierta directamente.
          </p>
        )}

        <div style={{ marginBottom: 16, fontSize: 13, opacity: 0.85 }}>
          <p style={{ marginBottom: 6 }}>
            📧 Tus tickets se enviarán al correo que indicaste durante la
            compra.
          </p>
          <p style={{ marginBottom: 6 }}>
            Si no los ves en unos minutos, revisa la carpeta de{' '}
            <strong>Spam</strong> o <strong>Promociones</strong>.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: 8,
          }}
        >
          <button
            type="button"
            onClick={handleGoHome}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: '1px solid #374151',
              fontSize: 13,
              background: 'transparent',
              color: '#e5e7eb',
              cursor: 'pointer',
            }}
          >
            ← Volver al inicio
          </button>

          <button
            type="button"
            onClick={handleGoMyTickets}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: 'none',
              background: '#22c55e',
              fontSize: 13,
              fontWeight: 600,
              color: '#020617',
              cursor: 'pointer',
            }}
          >
            Ver mis tickets (si tienes cuenta)
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: '1px solid #4b5563',
              background: 'transparent',
              fontSize: 13,
              color: '#e5e7eb',
              cursor: 'pointer',
            }}
          >
            Descargar comprobante
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==================== APP ROOT ==================== */

function App() {
  const cached = typeof window === 'undefined' ? null : readEventsCache();

  const [events, setEvents] = useState<Event[]>(cached?.data ?? []);

  const handleEventDeleted = (eventId: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  };

  const [eventsLoading, setEventsLoading] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !cached; // si hay cache (aunque sea stale), no bloquees la UI
  });

  const [eventsRefreshing, setEventsRefreshing] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const [view, setView] = useState<View>('events');

  const isMobile = useIsMobile(640);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    // si vuelves a desktop, cerramos el menú mobile
    if (!isMobile) setNavOpen(false);
  }, [isMobile]);


  // Evento destacado según ?evento=...
  const [highlightedEvent, setHighlightedEvent] = useState<Event | null>(null);

  // normalizador para comparar títulos ignorando tildes
  const normalizeText = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  // ✅ Canonizar /eventos?... -> /?... y manejar ?login=1
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1) Si cae a /eventos, lo dejamos en / (misma query)
    if (window.location.pathname === '/eventos') {
      const newUrl = '/' + window.location.search;
      window.history.replaceState({}, document.title, newUrl);
    }

    // 2) Manejo de ?login=1
    const params = new URLSearchParams(window.location.search);
    const shouldLogin = params.get('login');

    if (shouldLogin === '1') {
      setView('login');

      // limpiamos el query para que no quede ?login=1 pegado
      params.delete('login');
      const newUrl = '/' + (params.toString() ? `?${params.toString()}` : '');
      window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);

  const [token, setToken] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : localStorage.getItem('tiketera_token'),
  );
  const [role, setRole] = useState<UserRole | null>(() =>
    typeof window === 'undefined'
      ? null
      : getRoleFromToken(localStorage.getItem('tiketera_token')),
  );
  const [userId, setUserId] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : getUserIdFromToken(localStorage.getItem('tiketera_token')),
  );

  const [tickets, setTickets] = useState<MyTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [firstTicketsLoad, setFirstTicketsLoad] = useState(true);

  const isLoggedIn = !!token;

  async function refreshEvents(opts?: { silent?: boolean }) {
    try {
      if (opts?.silent) setEventsRefreshing(true);
      else setEventsLoading(true);

      setEventsError(null);

      const data = await fetchEvents();
      setEvents(data);

      if (typeof window !== 'undefined') {
        try {
          writeEventsCache(data); // o mejor: guarda versión “compacta”
        } catch (e) {
          console.warn('Cache lleno, salto cache write', e);
        }
      }
    } catch (err) {
      console.error(err);
      setEventsError('No se pudieron cargar los eventos');
    } finally {
      setEventsLoading(false);
      setEventsRefreshing(false);
    }
  }


  // 🔁 Ruta especial: /compra-exitosa → página dedicada de confirmación
  if (typeof window !== 'undefined' && window.location.pathname === '/compra-exitosa') {
    return <CompraExitosaPage />;
  }

  // Cargar eventos al inicio
  useEffect(() => {
    void refreshEvents({ silent: !!cached });
  }, []);

  // ✅ Cuando tenemos eventos, resolvemos ?evento=... (esto te faltaba)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const eventoParam = params.get('evento');

    if (!eventoParam) {
      setHighlightedEvent(null);
      return;
    }

    const normalizedParam = normalizeText(eventoParam);
    const match =
      events.find((e) => normalizeText(e.title) === normalizedParam) ?? null;

    setHighlightedEvent(match);
  }, [events]);

  // Cargar / refrescar "Mis tickets" cuando se entra a esa vista
  useEffect(() => {
    if (view !== 'myTickets' || !token) return;

    let canceled = false;
    let intervalId: number | undefined;

    async function loadTickets(isFirstCall: boolean) {
      try {
        if (isFirstCall && firstTicketsLoad && tickets.length === 0) {
          setTicketsLoading(true);
        }
        setTicketsError(null);

        const data = await fetchMyTickets(token ?? '');
        if (!canceled) {
          setTickets(data);
        }
      } catch (err) {
        console.error(err);
        if (!canceled) {
          setTicketsError(
            err instanceof Error && err.message === 'UNAUTHORIZED'
              ? 'Sesión expirada. Vuelve a iniciar sesión.'
              : 'No se pudieron cargar tus tickets',
          );
          if (err instanceof Error && err.message === 'UNAUTHORIZED') {
            localStorage.removeItem('tiketera_token');
            setToken(null);
            setRole(null);
            setUserId(null);
          }
        }
      } finally {
        if (!canceled) {
          setTicketsLoading(false);
          if (firstTicketsLoad) setFirstTicketsLoad(false);
        }
      }
    }

    void loadTickets(true);

    intervalId = window.setInterval(() => {
      void loadTickets(false);
    }, 5000);

    return () => {
      canceled = true;
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, token]);

  // Manejo de ?payment=cancel / ?payment=success cuando Flow devuelve
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    if (!payment) return;

    const pathname = window.location.pathname;
    const basePath = pathname === '/eventos' ? '/' : pathname;
    const isSuccessPage = basePath === '/compra-exitosa';

    // Cancelado
    if (payment === 'cancel') {
      setPaymentStatus('cancel');
      setPaymentMessage('El pago fue cancelado o no se completó.');

      localStorage.removeItem('tiketera_pending_payment');

      params.delete('payment');
      const newUrl = basePath + (params.toString() ? `?${params.toString()}` : '');
      window.history.replaceState({}, document.title, newUrl);
      return;
    }

    if (payment !== 'success') return;

    // En /compra-exitosa dejamos que la propia página muestre el resumen.
    if (!isSuccessPage) {
      let pendingMode: 'PRIVATE' | 'PUBLIC' | undefined;

      const raw = localStorage.getItem('tiketera_pending_payment');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.mode === 'PRIVATE' || parsed.mode === 'PUBLIC')) {
            pendingMode = parsed.mode;
          }
        } catch {
          // nada
        }
      }

      if (pendingMode === 'PRIVATE') {
        setPaymentStatus('success');
        setPaymentMessage(
          'Pago procesado correctamente. Tus tickets ya están disponibles en "Mis tickets".',
        );
        setView(isLoggedIn ? 'myTickets' : 'login');
      } else {
        setPaymentStatus('success');
        setPaymentMessage('Pago procesado correctamente. Te enviamos los tickets por correo.');
      }

      localStorage.removeItem('tiketera_pending_payment');
    }

    // Quitamos ?payment= de la URL
    params.delete('payment');
    const newUrl = basePath + (params.toString() ? `?${params.toString()}` : '');
    window.history.replaceState({}, document.title, newUrl);
  }, [isLoggedIn]);
  
  function openEvent(e: Event) {
    // setea URL shareable: /?evento=...
    const params = new URLSearchParams(window.location.search);
    params.set('evento', e.title);
    window.history.pushState({}, document.title, '/' + (params.toString() ? `?${params.toString()}` : ''));
    setHighlightedEvent(e);
    setView('events');
  }

  function clearHighlightedEvent() {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.delete('evento');

      // ✅ Forzamos volver a la raíz siempre
      const newUrl = '/' + (params.toString() ? `?${params.toString()}` : '');
      window.history.replaceState({}, document.title, newUrl);
    }
    setHighlightedEvent(null);
  }

  function handleLoginSuccess(newToken: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('tiketera_token', newToken);
    }
    setToken(newToken);
    setRole(getRoleFromToken(newToken));
    setUserId(getUserIdFromToken(newToken));
    setView('myTickets');
  }

  function handleLogout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('tiketera_token');
    }
    setToken(null);
    setRole(null);
    setUserId(null);
    setTickets([]);
    setView('events');
    clearHighlightedEvent();
  }

  function goToMyTickets() {
    setView(isLoggedIn ? 'myTickets' : 'login');
  }

  function goToOrganizer() {
    setView(isLoggedIn ? 'organizer' : 'login');
  }

  const handleEventCreated = () => {
    void refreshEvents();
  };

  const publicChrome = view === 'events' || view === 'login';
  const isEventsActive = view === 'events';

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#111827' }}>
      <PublicHeader
        view={view}
        isLoggedIn={isLoggedIn}
        role={role}
        onGoEvents={() => {
          clearHighlightedEvent();
          setView('events');
        }}
        onGoLogin={() => setView('login')}
        onGoMyTickets={goToMyTickets}
        onGoOrganizer={goToOrganizer}
        onGoCheckin={() => setView(isLoggedIn ? 'checkin' : 'login')}
        onLogout={handleLogout}
      />


      <div style={{ padding: '28px 16px', maxWidth: 1200, margin: '0 auto' }}>
        {view === 'events' && (
          highlightedEvent ? (
            <EventDetailView
              event={highlightedEvent}
              isLoggedIn={isLoggedIn}
              userId={userId}
              onBack={clearHighlightedEvent}
            />
          ) : (
            <PublicEventsIndex
              events={events}
              loading={eventsLoading}
              error={eventsError}
              onOpen={openEvent}
            />
          )
        )}

        {view === 'login' && <LoginForm onSuccess={handleLoginSuccess} />}

        {view === 'myTickets' && (
          <MyTicketsSection
            tickets={tickets}
            loading={ticketsLoading}
            error={ticketsError}
            isLoggedIn={isLoggedIn}
            onRequireLogin={() => setView('login')}
          />
        )}

        {view === 'checkin' && (
          <CheckInPanel
            token={token}
            role={role}
            onRequireLogin={() => setView('login')}
          />
        )}

        {view === 'organizer' && (
          <OrganizerPanel
            token={token}
            role={role}
            userId={userId}
            events={events}
            eventsLoading={eventsLoading}
            eventsError={eventsError}
            onRequireLogin={() => setView('login')}
            onEventCreated={handleEventCreated}
            onEventDeleted={handleEventDeleted}
          />
        )}
      </div>
    </div>
  );
}

/* ==================== EVENT DETAIL VIEW ==================== */

type EventDetailViewProps = {
  event: Event;
  isLoggedIn: boolean;
  userId: string | null;
  onBack?: () => void;
};

function EventDetailView({ event, isLoggedIn, userId, onBack }: EventDetailViewProps) {
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mainTicket = event.ticketTypes?.[0];
  const COMMISSION_PERCENT = 0.1119;

  const basePriceCents = mainTicket?.priceCents ?? 0;
  const commissionPerTicketCents = Math.round(basePriceCents * COMMISSION_PERCENT);
  const finalTotalCents = (basePriceCents + commissionPerTicketCents) * quantity;

  const formatMoney = (cents: number) =>
    new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: mainTicket?.currency || 'CLP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);

  const formatDateTimeLocal = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('es-CL', {
        dateStyle: 'full',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  };

  async function handleBuy() {
    if (!mainTicket) return;

    // Si no hay login, pedimos datos (mismo comportamiento que tu UI)
    if (!isLoggedIn) {
      if (!buyerName.trim() || !buyerEmail.trim()) {
        setError('Ingresa tu nombre y correo para continuar.');
        return;
      }
    }

    try {
      setError(null);
      setLoading(true);

      const successUrl = `${window.location.origin}/compra-exitosa`;

      // ✅ CLAVE: volvemos a "/" (no /eventos) y mantenemos ?evento=
      const cancelUrl = `${window.location.origin}/?evento=${encodeURIComponent(
        event.title,
      )}&payment=cancel`;

      const checkoutUrl = await createCheckoutSession({
        amountCents: finalTotalCents,
        currency: mainTicket.currency || 'CLP',
        successUrl,
        cancelUrl,
        metadata: {
          mode: isLoggedIn ? 'PRIVATE' : 'PUBLIC',
          eventId: event.id,
          ticketTypeId: mainTicket.id,
          quantity: String(quantity),
          ...(buyerName ? { buyerName } : {}),
          ...(buyerEmail ? { buyerEmail } : {}),
          ...(userId ? { buyerUserId: userId } : {}),
        },
      });

      // Mantén tu formato actual si ya lo usas en CompraExitosaPage
      localStorage.setItem(
        'tiketera_pending_payment',
        JSON.stringify({ mode: isLoggedIn ? 'PRIVATE' : 'PUBLIC' }),
      );

      window.location.href = checkoutUrl;
    } catch (e) {
      console.error(e);
      setError('No se pudo crear la sesión de pago en Flow.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ color: '#f9fafb' }}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{
            marginBottom: 16,
            padding: '6px 10px',
            borderRadius: 999,
            border: '1px solid #4b5563',
            background: 'transparent',
            color: '#e5e7eb',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          ← Volver
        </button>
      )}

      <div
        style={{
          borderRadius: 16,
          border: '1px solid #1f2937',
          background: '#111827',
          padding: 16,
        }}
      >
        <h1 style={{ margin: 0, marginBottom: 8, fontSize: 22, fontWeight: 800 }}>
          {event.title}
        </h1>

        <p style={{ marginTop: 0, opacity: 0.9 }}>{event.description}</p>

        <div style={{ fontSize: 13, opacity: 0.9 }}>
          <div>
            <strong>Fecha:</strong> {formatDateTimeLocal(event.startDateTime)}
          </div>
          <div>
            <strong>Lugar:</strong> {event.venueName} · {event.venueAddress}
          </div>
        </div>

        <div style={{ marginTop: 14, borderTop: '1px solid #1f2937', paddingTop: 14 }}>
          {!mainTicket ? (
            <p style={{ margin: 0 }}>Este evento todavía no tiene tickets disponibles.</p>
          ) : (
            <>
              {!isLoggedIn && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <input
                    placeholder="Tu nombre"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 999,
                      border: '1px solid #4b5563',
                      background: '#020617',
                      color: '#e5e7eb',
                      fontSize: 13,
                    }}
                  />
                  <input
                    placeholder="Tu correo"
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 999,
                      border: '1px solid #4b5563',
                      background: '#020617',
                      color: '#e5e7eb',
                      fontSize: 13,
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, opacity: 0.9 }}>
                  <div>
                    <strong>{mainTicket.name}</strong>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Base: {formatMoney(basePriceCents)} · Comisión: {formatMoney(commissionPerTicketCents)}
                  </div>
                </div>

                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                  style={{
                    width: 80,
                    padding: '8px 10px',
                    borderRadius: 999,
                    border: '1px solid #4b5563',
                    background: '#020617',
                    color: '#e5e7eb',
                    fontSize: 13,
                  }}
                />

                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Total</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{formatMoney(finalTotalCents)}</div>
                </div>

                <button
                  type="button"
                  onClick={handleBuy}
                  disabled={loading}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 999,
                    border: 'none',
                    background: loading ? '#4b5563' : '#22c55e',
                    color: '#020617',
                    fontWeight: 700,
                    cursor: loading ? 'default' : 'pointer',
                  }}
                >
                  {loading ? 'Redirigiendo…' : 'Comprar'}
                </button>
              </div>

              {error && <p style={{ marginTop: 10, color: '#f87171', fontSize: 13 }}>{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);

    const update = () => setIsMobile(mq.matches);
    update();

    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);

  return isMobile;
}



function PublicHeader(props: {
  view: View;
  isLoggedIn: boolean;
  role: UserRole | null;
  onGoEvents: () => void;
  onGoLogin: () => void;
  onGoMyTickets: () => void;
  onGoOrganizer: () => void;
  onGoCheckin: () => void;
  onLogout: () => void;
}) {
  const {
    view,
    isLoggedIn,
    role,
    onGoEvents,
    onGoLogin,
    onGoMyTickets,
    onGoOrganizer,
    onGoCheckin,
    onLogout,
  } = props;

  const isMobile = useIsMobile(768);
  const [menuOpen, setMenuOpen] = useState(false);

  const isStaff = !!role && role !== 'CUSTOMER';

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const pill = (active: boolean): CSSProperties => ({
    padding: '10px 18px',
    borderRadius: 999,
    border: active ? 'none' : '1px solid rgba(255,255,255,0.55)',
    background: active ? 'linear-gradient(90deg,#fb923c,#f97316,#b91c1c)' : 'transparent',
    color: '#ffffff',
    fontWeight: 800,
    fontSize: 14,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  const menuItem = (active: boolean): CSSProperties => ({
    width: '100%',
    textAlign: 'left',
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid #e5e7eb',
    background: active ? '#111827' : '#ffffff',
    color: active ? '#ffffff' : '#111827',
    fontWeight: 800,
    cursor: 'pointer',
  });

  const menuDanger: CSSProperties = {
    width: '100%',
    textAlign: 'left',
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid #fecaca',
    background: '#fff1f2',
    color: '#9f1239',
    fontWeight: 900,
    cursor: 'pointer',
  };

  const items = [
    { key: 'events', label: 'Eventos', show: true, onClick: onGoEvents, active: view === 'events' },
    { key: 'organizer', label: 'Organizador', show: isStaff, onClick: onGoOrganizer, active: view === 'organizer' },
    { key: 'myTickets', label: 'Mis tickets', show: isLoggedIn, onClick: onGoMyTickets, active: view === 'myTickets' },
    { key: 'checkin', label: 'Check-in', show: isStaff, onClick: onGoCheckin, active: view === 'checkin' },
  ];

  return (
    <header
      style={{
        background: '#7f1d1d',
        color: '#ffffff',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
      }}
    >
      <div
        style={{
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <img src="/logo-ticketchile.png" alt="TicketChile" style={{ height: 34, objectFit: 'contain' }} />
          <span style={{ fontSize: 12, opacity: 0.85 }}>Tu entrada mas rapida al evento.</span>
        </div>

        {/* Desktop: botones normales */}
        {!isMobile && (
          <nav style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={onGoEvents} style={pill(view === 'events')}>Eventos</button>

            {isStaff && (
              <button onClick={onGoOrganizer} style={pill(view === 'organizer')}>Organizador</button>
            )}

            {isLoggedIn && (
              <button onClick={onGoMyTickets} style={pill(view === 'myTickets')}>Mis tickets</button>
            )}

            {isStaff && (
              <button onClick={onGoCheckin} style={pill(view === 'checkin')}>Check-in</button>
            )}

            {isLoggedIn ? (
              <button onClick={onLogout} style={{ ...pill(false), border: '1px solid rgba(255,255,255,0.55)' }}>
                Cerrar sesión
              </button>
            ) : (
              <button onClick={onGoLogin} style={{ ...pill(false), border: '1px solid rgba(255,255,255,0.55)' }}>
                Iniciar sesión
              </button>
            )}
          </nav>
        )}

        {/* Mobile: botón ⋮ */}
        {isMobile && (
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            style={{
              width: 44,
              height: 44,
              padding: 0,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.35)',
              background: 'transparent',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {/* SVG kebab (3 puntos verticales) centrado real */}
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="currentColor"
              style={{ display: 'block' }}
              aria-hidden="true"
            >
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>

        )}
      </div>

      {/* Drawer mobile */}
      {isMobile && menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.35)' }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              height: '100%',
              width: 'min(320px, 86vw)',
              background: '#ffffff',
              boxShadow: '-12px 0 40px rgba(0,0,0,0.35)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontWeight: 900, color: '#111827' }}>Menú</div>
              <button
                onClick={() => setMenuOpen(false)}
                style={{
                  height: 36,
                  width: 36,
                  borderRadius: 10,
                  border: '1px solid #e5e7eb',
                  background: '#ffffff',
                  cursor: 'pointer',
                  fontWeight: 900,
                }}
              >
                ✕
              </button>
            </div>

            {items
              .filter((x) => x.show)
              .map((x) => (
                <button
                  key={x.key}
                  style={menuItem(x.active)}
                  onClick={() => {
                    setMenuOpen(false);
                    x.onClick();
                  }}
                >
                  {x.label}
                </button>
              ))}

            <div style={{ marginTop: 'auto' }}>
              {isLoggedIn ? (
                <button
                  style={menuDanger}
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                >
                  Cerrar sesión
                </button>
              ) : (
                <button
                  style={menuItem(view === 'login')}
                  onClick={() => {
                    setMenuOpen(false);
                    onGoLogin();
                  }}
                >
                  Iniciar sesión
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </header>
  );
}



function PublicEventCard(props: { event: Event; onOpen: (e: Event) => void }) {
  const { event, onOpen } = props;

  const [hovered, setHovered] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const dateLabel = useMemo(
    () => formatDateLabel(event.startDateTime),
    [event.startDateTime],
  );
  const minPrice = useMemo(() => getMinFinalPriceLabel(event), [event]);

  // ✅ usa proxy si aplica (y si /api/img funciona)
  const img = useMemo(() => getEventCardImage(event), [event]);

  const fallbackUrl = '/event-fallback.jpg';

  const finalSrc = imgError ? fallbackUrl : img.src;
  const finalSrcSet = imgError ? undefined : img.srcSet;
  const finalSizes = imgError ? undefined : img.sizes;

  const shimmer: React.CSSProperties = {
    backgroundImage:
      'linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)',
    backgroundSize: '200% 100%',
    animation: 'tc-shimmer 1.2s infinite',
  };

  return (
    <div
      onClick={() => onOpen(event)}
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
          {dateLabel}
        </div>
      </div>

      <div style={{ padding: '14px 16px 12px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111827' }}>
          {event.title}
        </h3>

        <div style={{ fontSize: 13, color: '#4b5563', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div>{event.venueName}</div>
          <div>{event.venueAddress}</div>
          <div>{(event.ticketTypes?.length ?? 0) > 0 ? 'Entradas disponibles' : 'Sin tickets'}</div>
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
            <div style={{ fontSize: 20, fontWeight: 800, color: '#b91c1c' }}>{minPrice}</div>
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
}


function PublicEventsIndex(props: {
  events: Event[];
  loading: boolean;
  error: string | null;
  onOpen: (e: Event) => void;
}) {
  const { events, loading, error, onOpen } = props;
  const [searchQuery, setSearchQuery] = useState('');

  const hasEvents = (events?.length ?? 0) > 0;

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (events ?? [])
      .filter((e) => e.status !== 'CANCELLED')
      .filter((e) => {
        if (!q) return true;
        return (
          e.title.toLowerCase().includes(q) ||
          e.venueName.toLowerCase().includes(q) ||
          e.venueAddress.toLowerCase().includes(q)
        );
      });
  }, [events, searchQuery]);

  // ✅ Skeleton solo cuando NO hay nada para mostrar todavía
  const showSkeleton = loading && !hasEvents;

  // ✅ “Actualizando…” solo cuando ya estamos mostrando algo (cache) y llega el refresh
  const showRefreshing = loading && hasEvents;

  const showEmptySearch =
    !loading && !error && filtered.length === 0 && searchQuery.trim() && hasEvents;

  const showEmptyNoEvents =
    !loading && !error && filtered.length === 0 && !searchQuery.trim() && !hasEvents;

  return (
    <main
      style={{
        padding: '32px 16px 56px',
        maxWidth: 1200,
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      {/* Keyframes para shimmer (sin tocar tu CSS global) */}
      <style>{`
        @keyframes tc-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      <section style={{ textAlign: 'center', marginBottom: 28, padding: '0 8px' }}>
        <h1
          style={{
            fontSize: 'clamp(2.1rem, 4vw, 3rem)',
            fontWeight: 900,
            lineHeight: 1.1,
            marginBottom: 10,
            color: '#111827',
          }}
        >
          Eventos{' '}
          <span
            style={{
              backgroundImage: 'linear-gradient(90deg,#f97316,#fb923c,#dc2626)',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
            }}
          >
            disponibles
          </span>
        </h1>
        <p style={{ maxWidth: 720, margin: '0 auto', fontSize: 16, color: '#4b5563' }}>
          Compra en segundos, entra con QR y que nadie te cuente el show.
        </p>
      </section>

      <section style={{ marginBottom: 26 }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', gap: 12, alignItems: 'center' }}>
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
              fontWeight: 700,
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

      {/* Error: si hay cache, no lo trates como “pantalla de muerte” */}
      {error && (
        <p style={{ textAlign: 'center', color: '#b91c1c', fontWeight: 600, marginBottom: 12 }}>
          {hasEvents ? 'No se pudo actualizar (mostrando datos guardados).' : error}
        </p>
      )}

      {showRefreshing && (
        <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 12, marginBottom: 12 }}>
          Actualizando eventos…
        </p>
      )}

      {showEmptySearch && (
        <p style={{ textAlign: 'center', color: '#6b7280' }}>
          No se encontraron eventos para “{searchQuery.trim()}”.
        </p>
      )}

      {showEmptyNoEvents && (
        <p style={{ textAlign: 'center', color: '#6b7280' }}>
          No hay eventos publicados todavía.
        </p>
      )}

      <section>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 18,
          }}
        >
          {showSkeleton ? (
            <SkeletonGrid count={6} />
          ) : (
            filtered.map((event) => (
              <PublicEventCard key={event.id} event={event} onOpen={onOpen} />
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function SkeletonGrid({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </>
  );
}

function SkeletonCard() {
  const shimmer: React.CSSProperties = {
    backgroundImage: 'linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)',
    backgroundSize: '200% 100%',
    animation: 'tc-shimmer 1.2s infinite',
  };

  return (
    <div
      style={{
        borderRadius: 18,
        overflow: 'hidden',
        background: '#ffffff',
        boxShadow: '0 14px 30px rgba(15,23,42,0.10)',
        border: '1px solid #eef2f7',
      }}
    >
      <div style={{ height: 190, ...shimmer }} />
      <div style={{ padding: '14px 16px 12px' }}>
        <div style={{ height: 18, width: '70%', borderRadius: 8, marginBottom: 10, ...shimmer }} />
        <div style={{ height: 12, width: '90%', borderRadius: 8, marginBottom: 8, ...shimmer }} />
        <div style={{ height: 12, width: '80%', borderRadius: 8, marginBottom: 8, ...shimmer }} />
        <div style={{ height: 12, width: '60%', borderRadius: 8, marginBottom: 14, ...shimmer }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ height: 18, width: 90, borderRadius: 999, ...shimmer }} />
          <div style={{ height: 34, width: 110, borderRadius: 999, ...shimmer }} />
        </div>
      </div>
    </div>
  );
}

export default App;



