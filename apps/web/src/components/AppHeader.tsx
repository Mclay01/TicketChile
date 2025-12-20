import React, { useEffect, useMemo, useState, type CSSProperties } from 'react';

export type View =
  | 'events'
  | 'login'
  | 'myTickets'
  | 'checkin'
  | 'organizer'
  | 'paymentSuccess';

type Props = {
  view: View;
  isLoggedIn: boolean;
  role: string | null;
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

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }

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

  const isMobile = useIsMobile(768);
  const [menuOpen, setMenuOpen] = useState(false);

  const isStaff = !!role && role !== 'CUSTOMER';

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!isMobile) setMenuOpen(false);
  }, [isMobile]);

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

  const textColor = '#111827';
  

  const headerStyle: CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    color: textColor,
    background: scrolled ? 'rgba(255,255,255,0.78)' : 'transparent',
    backdropFilter: scrolled ? 'saturate(180%) blur(12px)' : undefined,
    borderBottom: scrolled ? '1px solid rgba(15,23,42,0.08)' : '1px solid rgba(15,23,42,0)',
    boxShadow: scrolled ? '0 10px 30px rgba(15,23,42,0.10)' : 'none',
    transition: 'background 180ms ease, box-shadow 180ms ease, border-color 180ms ease, backdrop-filter 180ms ease',
  };

  const pill = (active: boolean): CSSProperties => ({
    padding: '10px 16px',
    borderRadius: 999,
    border: active ? 'none' : scrolled ? '1px solid rgba(15,23,42,0.14)' : '1px solid rgba(15,23,42,0.16)',
    background: active ? 'linear-gradient(90deg,#f97316,#fb923c,#b91c1c)' : 'transparent',
    color: active ? '#ffffff' : textColor,
    cursor: 'pointer',
    fontWeight: 900,
    fontSize: 14,
    boxShadow: active ? '0 10px 24px rgba(185,28,28,0.25)' : 'none',
    whiteSpace: 'nowrap',
  });

  const menuItem = (active: boolean): CSSProperties => ({
    width: '100%',
    textAlign: 'left',
    padding: '12px 12px',
    borderRadius: 12,
    border: '1px solid #e5e7eb',
    background: active ? '#111827' : '#ffffff',
    color: active ? '#ffffff' : '#111827',
    cursor: 'pointer',
    fontWeight: 900,
  });

  const menuDanger: CSSProperties = {
    width: '100%',
    padding: '12px 12px',
    borderRadius: 12,
    border: '1px solid #fecaca',
    background: '#b91c1c',
    color: '#ffffff',
    cursor: 'pointer',
    fontWeight: 900,
  };

  const items = useMemo(
    () => [
      { key: 'events', label: 'Eventos', show: true, active: view === 'events', onClick: onGoEvents },
      { key: 'organizer', label: 'Organizador', show: isStaff, active: view === 'organizer', onClick: onGoOrganizer },
      { key: 'myTickets', label: 'Mis tickets', show: isLoggedIn, active: view === 'myTickets', onClick: onGoMyTickets },
      { key: 'checkin', label: 'Check-in', show: isStaff, active: view === 'checkin', onClick: onGoCheckin },
    ],
    [view, isLoggedIn, isStaff, onGoEvents, onGoOrganizer, onGoMyTickets, onGoCheckin],
  );
  
  const logoH = scrolled ? (isMobile ? 40 : 44) : (isMobile ? 52 : 62);
  
  return (
    <header style={headerStyle}>
      <div
        style={{
          padding: scrolled ? '10px 16px' : '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        {/* Logo (click = ir a eventos) */}
        <div
          onClick={onGoEvents}
          style={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            flexShrink: 0,          // 👈 no lo aplastes
            minWidth: 220,          // 👈 evita que quede mini por wrap
          }}
        >
          <img
            src="/LogoFondeBlanco.svg"
            alt="TicketChile"
            style={{
              height: logoH,
              width: 'auto',
              display: 'block',
              objectFit: 'contain',
              objectPosition: 'left center',
              // si arriba el fondo es blanco, esto ayuda a que destaque un poquito
              filter: scrolled ? 'none' : 'drop-shadow(0 6px 16px rgba(0,0,0,0.10))',
            }}
          />
        </div>

        {/* Desktop */}
        {!isMobile && (
          <nav style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {items.filter((x) => x.show).map((x) => (
              <button key={x.key} onClick={x.onClick} style={pill(x.active)}>
                {x.label}
              </button>
            ))}

            {isLoggedIn ? (
              <button onClick={onLogout} style={pill(false)}>
                Cerrar sesión
              </button>
            ) : (
              <button onClick={onGoLogin} style={pill(view === 'login')}>
                Iniciar sesión
              </button>
            )}
          </nav>
        )}

        {/* Mobile */}
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
              border: scrolled ? '1px solid rgba(15,23,42,0.14)' : '1px solid rgba(15,23,42,0.16)',
              background: 'transparent',
              color: textColor,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }} aria-hidden="true">
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>
        )}
      </div>

      {/* Drawer mobile */}
      {isMobile && menuOpen && (
        <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.35)' }}>
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
