// apps/web/src/App.tsx
import { useEffect, useState, type FormEvent } from 'react';
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


function formatDateTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const COMMISSION_RATE = 0.1119; // 11,19%

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
            background: loading ? '#4b5563' : '#22c55e',
            color: '#020617',
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
  userId: string | null; // 👈 nuevo prop
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

    const selectedTicketType = event.ticketTypes.find(
      (tt) => tt.id === ticketTypeId,
    );
    if (!selectedTicketType) {
      setError('Tipo de entrada inválido');
      return;
    }

    // 💰 Precio base (sin comisión)
    const basePriceCents = selectedTicketType.priceCents;
    const baseTotalCents = basePriceCents * quantity;

    // 🧾 Comisión 11,19%
    const commissionPerTicketCents = Math.round(basePriceCents * COMMISSION_RATE);
    const commissionTotalCents = commissionPerTicketCents * quantity;

    // 🔢 Monto final que se le pasa a Flow
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

        // Guardamos info solo para UX después del pago
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


        // 👇 guardamos el token de Flow para que /compra-exitosa lo pueda usar
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
      // seguridad extra + TS feliz
      setError(
        'No se pudo identificar tu sesión. Vuelve a iniciar sesión e intenta de nuevo.',
      );
      return;
    }

    try {
      setLoading(true);

      // Solo para decidir qué mensaje mostrar al volver de Flow
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

      // 👇 igual que arriba
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
          <strong>Organiza:</strong> {event.organizer.name}
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
      {event.ticketTypes.map((tt) => (
        <div
          key={tt.id}
          style={{
            fontSize: '13px',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{tt.name}</span>
            {(() => {
              const base = tt.priceCents;
              const fee = calcCommissionCents(base);
              const finalPrice = base + fee;
              return (
                <span>{formatPrice(finalPrice, tt.currency)}</span>
              );
            })()}
          </div>

          {(() => {
            const base = tt.priceCents;
            const fee = calcCommissionCents(base);
            return (
              <span
                style={{
                  fontSize: '11px',
                  opacity: 0.8,
                }}
              >
                Comisión: {formatPrice(fee, tt.currency)}
              </span>
            );
          })()}
        </div>
      ))}
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
  const [events, setEvents] = useState<Event[]>([]);

  const handleEventDeleted = (eventId: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  };

  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const [view, setView] = useState<View>('events');

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);

  const [token, setToken] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : localStorage.getItem('tiketera_token'),
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

  async function refreshEvents() {
    try {
      setEventsLoading(true);
      setEventsError(null);
      const data = await fetchEvents();
      setEvents(data);
    } catch (err) {
      console.error(err);
      setEventsError('No se pudieron cargar los eventos');
    } finally {
      setEventsLoading(false);
    }
  }

  // 🔁 Ruta especial: /compra-exitosa → página dedicada de confirmación
  if (
    typeof window !== 'undefined' &&
    window.location.pathname === '/compra-exitosa'
  ) {
    return <CompraExitosaPage />;
  }

  // Cargar eventos al inicio
  useEffect(() => {
    void refreshEvents();
  }, []);

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
          if (firstTicketsLoad) {
            setFirstTicketsLoad(false);
          }
        }
      }
    }

    void loadTickets(true);

    intervalId = window.setInterval(() => {
      void loadTickets(false);
    }, 5000);

    return () => {
      canceled = true;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, token]);

  // Manejo de ?payment=cancel / ?payment=success cuando Flow devuelve al home
  // (para este flujo actual solo usamos "cancel", porque el success va a /compra-exitosa)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');

    if (!payment) return;

    const pathname = window.location.pathname;
    const isSuccessPage = pathname === '/compra-exitosa';

    // Cancelado
    if (payment === 'cancel') {
      setPaymentStatus('cancel');
      setPaymentMessage('El pago fue cancelado o no se completó.');

      // aquí sí podemos limpiar siempre
      localStorage.removeItem('tiketera_pending_payment');

      params.delete('payment');
      const newUrl =
        pathname + (params.toString() ? `?${params.toString()}` : '');
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
        setPaymentMessage(
          'Pago procesado correctamente. Te enviamos los tickets por correo.',
        );
        setView('events');
      }

      // solo limpiamos acá si NO es la página de compra-exitosa
      localStorage.removeItem('tiketera_pending_payment');
    }

    // en todos los casos quitamos el ?payment= de la URL
    params.delete('payment');
    const newUrl =
      pathname + (params.toString() ? `?${params.toString()}` : '');
    window.history.replaceState({}, document.title, newUrl);
  }, [isLoggedIn]);


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
  }

  function goToMyTickets() {
    if (!isLoggedIn) {
      setView('login');
    } else {
      setView('myTickets');
    }
  }

  function goToOrganizer() {
    if (!isLoggedIn) {
      setView('login');
    } else {
      setView('organizer');
    }
  }

  const handleEventCreated = () => {
    void refreshEvents();
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#e5e7eb',
      }}
    >
      <header
        style={{
          borderBottom: '1px solid #1f2937',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 600 }}>
            <span style={{ color: '#0400ffff' }}>TICKET</span>-
            <span style={{ color: '#960000ff' }}>CHILE</span> 
          </span>
          <p style={{ fontSize: '12px', opacity: 0.7 }}>
            Tu entrada mas rapida al evento.
          </p>
        </div>

        <nav
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            fontSize: '14px',
          }}
        >
          <button
            onClick={() => setView('events')}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: 'none',
              background: view === 'events' ? '#1d4ed8' : 'transparent',
              color: '#e5e7eb',
              cursor: 'pointer',
            }}
          >
            Eventos
          </button>

          {role && role !== 'CUSTOMER' && (
            <button
              onClick={goToOrganizer}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: 'none',
                background: view === 'organizer' ? '#1d4ed8' : 'transparent',
                color: '#e5e7eb',
                cursor: 'pointer',
              }}
            >
              Organizador
            </button>
          )}

          {isLoggedIn && (
            <button
              onClick={goToMyTickets}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: 'none',
                background: view === 'myTickets' ? '#1d4ed8' : 'transparent',
                color: '#e5e7eb',
                cursor: 'pointer',
              }}
            >
              Mis tickets
            </button>
          )}

          {role && role !== 'CUSTOMER' && (
            <button
              onClick={() => setView('checkin')}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: 'none',
                background: view === 'checkin' ? '#1d4ed8' : 'transparent',
                color: '#e5e7eb',
                cursor: 'pointer',
              }}
            >
              Check-in
            </button>
          )}

          {isLoggedIn ? (
            <button
              onClick={handleLogout}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #4b5563',
                background: 'transparent',
                color: '#e5e7eb',
                cursor: 'pointer',
              }}
            >
              Cerrar sesión
            </button>
          ) : (
            <button
              onClick={() => setView('login')}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #4b5563',
                background: 'transparent',
                color: '#e5e7eb',
                cursor: 'pointer',
              }}
            >
              Iniciar sesión
            </button>
          )}
        </nav>
      </header>

      <main
        style={{
          padding: '16px',
          maxWidth: '960px',
          margin: '0 auto',
        }}
      >
        {paymentStatus !== 'idle' && paymentMessage && (
          <div
            style={{
              marginBottom: '12px',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '14px',
              border: '1px solid',
              background:
                paymentStatus === 'success'
                  ? '#022c22'
                  : paymentStatus === 'cancel'
                  ? '#451a1a'
                  : '#3f1f1f',
              borderColor:
                paymentStatus === 'success'
                  ? '#16a34a'
                  : paymentStatus === 'cancel'
                  ? '#f97316'
                  : '#f87171',
              color: '#e5e7eb',
            }}
          >
            {paymentMessage}
          </div>
        )}

        {view === 'events' && (
          <section>
            <h1
              style={{
                fontSize: '20px',
                fontWeight: 600,
                marginBottom: '12px',
              }}
            >
              Eventos
            </h1>

            {eventsLoading && <p>Cargando eventos...</p>}
            {eventsError && (
              <p style={{ color: '#f87171' }}>{eventsError}</p>
            )}

            {!eventsLoading && !eventsError && events.length === 0 && (
              <p>No hay eventos publicados todavía.</p>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr)',
                gap: '12px',
              }}
            >
              {events
                .filter((event) => event.status !== 'CANCELLED')
                .map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    isLoggedIn={isLoggedIn}
                    token={token}
                    userId={userId}
                  />
                ))}
            </div>
          </section>
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
      </main>
    </div>
  );
}

export default App;


