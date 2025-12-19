import React, { useEffect, useMemo, useState } from 'react';

export type View =
  | 'events'
  | 'login'
  | 'myTickets'
  | 'checkin'
  | 'organizer'
  | 'paymentSuccess';
type UserRole = 'ADMIN' | 'ORGANIZER' | 'CUSTOMER';
type Props = {
  view: View;
  isLoggedIn: boolean;
  role: UserRole | null;
  onGoEvents: () => void;
  onGoLogin: () => void;
  onGoMyTickets: () => void;
  onGoOrganizer: () => void;
  onGoCheckin: () => void;
  onLogout: () => void;
};

function useIsMobile(maxWidth = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setIsMobile(mq.matches);

    update();

    // Moderno
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }

    // Fallback viejo
    // eslint-disable-next-line deprecation/deprecation
    mq.addListener(update);
    // eslint-disable-next-line deprecation/deprecation
    return () => mq.removeListener(update);
  }, [maxWidth]);

  return isMobile;
}

export default function AppHeader(props: Props) {
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
  const isStaff = !!role && role !== 'CUSTOMER';
  const isMobile = useIsMobile(768);
  const [menuOpen, setMenuOpen] = useState(false);

  // si pasa a desktop, cerramos menú
  useEffect(() => {
    if (!isMobile) setMenuOpen(false);
  }, [isMobile]);

  // bloquear scroll al abrir drawer
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!menuOpen) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const pill = (active: boolean): React.CSSProperties => ({
    padding: '10px 14px',
    borderRadius: 999,
    border: active ? 'none' : '1px solid rgba(255,255,255,0.35)',
    background: active ? 'linear-gradient(90deg,#fb923c,#f97316,#b91c1c)' : 'transparent',
    color: '#fff',
    fontWeight: 800,
    cursor: 'pointer',
    fontSize: 13,
  });

  const menuItem = (active: boolean): React.CSSProperties => ({
    width: '100%',
    textAlign: 'left',
    padding: '12px 12px',
    borderRadius: 12,
    border: '1px solid #e5e7eb',
    background: active ? '#111827' : '#ffffff',
    color: active ? '#ffffff' : '#111827',
    cursor: 'pointer',
    fontWeight: 800,
  });

  const menuDanger: React.CSSProperties = {
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid #fecdd3',
    background: '#fff1f2',
    color: '#9f1239',
    fontWeight: 800,
    cursor: 'pointer',
    textAlign: 'left',
  };

  const items = useMemo(
    () => [
      {
        key: 'events',
        label: 'Eventos',
        show: true,
        active: view === 'events',
        onClick: onGoEvents,
      },
      {
        key: 'organizer',
        label: 'Organizador',
        show: isStaff,
        active: view === 'organizer',
        onClick: onGoOrganizer,
      },
      {
        key: 'myTickets',
        label: 'Mis tickets',
        show: isLoggedIn,
        active: view === 'myTickets',
        onClick: onGoMyTickets,
      },
      {
        key: 'checkin',
        label: 'Check-in',
        show: isStaff,
        active: view === 'checkin',
        onClick: onGoCheckin,
      },
    ],
    [view, isLoggedIn, isStaff, onGoEvents, onGoOrganizer, onGoMyTickets, onGoCheckin],
  );

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
          <img
            src="/logo-ticketchile.png"
            alt="TicketChile"
            style={{ height: 34, objectFit: 'contain' }}
          />
          <span style={{ fontSize: 12, opacity: 0.85 }}>
            Tu entrada mas rapida al evento.
          </span>
        </div>

        {/* Desktop */}
        {!isMobile && (
          <nav
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            <button onClick={onGoEvents} style={pill(view === 'events')}>
              Eventos
            </button>

            {isStaff && (
              <button onClick={onGoOrganizer} style={pill(view === 'organizer')}>
                Organizador
              </button>
            )}

            {isLoggedIn && (
              <button onClick={onGoMyTickets} style={pill(view === 'myTickets')}>
                Mis tickets
              </button>
            )}

            {isStaff && (
              <button onClick={onGoCheckin} style={pill(view === 'checkin')}>
                Check-in
              </button>
            )}

            {isLoggedIn ? (
              <button
                onClick={onLogout}
                style={{ ...pill(false), border: '1px solid rgba(255,255,255,0.55)' }}
              >
                Cerrar sesión
              </button>
            ) : (
              <button
                onClick={onGoLogin}
                style={{ ...pill(false), border: '1px solid rgba(255,255,255,0.55)' }}
              >
                Iniciar sesión
              </button>
            )}
          </nav>
        )}

        {/* Mobile kebab */}
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
              flexShrink: 0,
              position: 'relative',
              lineHeight: 0, // 🔧 evita “corridos” por baseline
            }}
          >
            {/* 🔧 centrado garantizado */}
            <span
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
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
            </span>
          </button>
        )}
      </div>

      {/* Drawer mobile */}
      {isMobile && menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.35)',
          }}
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 4,
              }}
            >
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
