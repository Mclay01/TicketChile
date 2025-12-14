// apps/web/src/LandingPage.tsx
import React, { useState } from 'react';
import logo from './assets/logo-ticketchile.png';

const LandingPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');

  // Ir a /eventos con parámetros opcionales
  const goToEvents = (extraParams?: Record<string, string>) => {
    const params = new URLSearchParams();

    if (searchQuery.trim()) {
      params.set('search', searchQuery.trim());
    }

    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        params.set(key, value);
      }
    }

    const queryString = params.toString();
    window.location.href = '/eventos' + (queryString ? `?${queryString}` : '');
  };

  const handleOrganizerClick = () => {
    goToEvents({ login: '1' });
  };

  const handleSearchKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Enter') {
      goToEvents();
    }
  };

  const handleCategoryClick = (category: string) => {
    goToEvents({ category });
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
      {/* NAV ROJO CON LOGO */}
      <header
        style={{
          backgroundColor: '#7f1d1d', // rojo oscuro
          color: '#f9fafb',
          padding: '10px 5vw',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <img
            src={logo}
            alt="TicketChile"
            style={{
              height: 40,
              width: 'auto',
              objectFit: 'contain',
            }}
          />
        </div>

        <nav
          style={{
            display: 'flex',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => goToEvents()}
            style={{
              padding: '8px 16px',
              borderRadius: 999,
              border: 'none',
              background:
                'linear-gradient(135deg, #dc2626 0%, #f97316 100%)',
              color: '#f9fafb',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            }}
          >
            Ver eventos
          </button>

          <button
            type="button"
            onClick={handleOrganizerClick}
            style={{
              padding: '8px 16px',
              borderRadius: 999,
              border: '1px solid rgba(248,250,252,0.6)',
              backgroundColor: 'transparent',
              color: '#f9fafb',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer',
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
          padding: '32px 5vw 40px',
          boxSizing: 'border-box',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 1120,
          }}
        >
          {/* HERO */}
          <section
            style={{
              textAlign: 'center',
              marginBottom: 32,
            }}
          >
            <h1
              style={{
                fontSize: 'clamp(32px, 5vw, 44px)',
                fontWeight: 800,
                marginBottom: 12,
                color: '#111827',
              }}
            >
              Vive experiencias{' '}
              <span
                style={{
                  background:
                    'linear-gradient(90deg, #dc2626, #f97316)',
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
                maxWidth: 640,
                margin: '0 auto 24px',
                color: '#4b5563',
              }}
            >
              Encuentra y compra tickets para los mejores eventos en Chile.
              Vende tus entradas y controla el acceso con códigos QR en tiempo real.
            </p>

            {/* BUSCADOR */}
            <div
              style={{
                maxWidth: 640,
                margin: '0 auto 24px',
                display: 'flex',
                gap: 8,
              }}
            >
              <input
                type="text"
                placeholder="Buscar eventos, artistas, lugares..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 999,
                  border: '1px solid #e5e7eb',
                  fontSize: 14,
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => goToEvents()}
                style={{
                  padding: '10px 20px',
                  borderRadius: 999,
                  border: 'none',
                  background:
                    'linear-gradient(135deg, #b91c1c 0%, #f97316 100%)',
                  color: '#f9fafb',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Buscar
              </button>
            </div>

            {/* CATEGORÍAS (solo visual, llevan a /eventos) */}
            <div
              style={{
                marginBottom: 28,
              }}
            >
              <p
                style={{
                  fontSize: 13,
                  textTransform: 'uppercase',
                  letterSpacing: 0.08,
                  color: '#6b7280',
                  marginBottom: 8,
                }}
              >
                Explora por categoría
              </p>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  onClick={() => goToEvents()}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 999,
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#ffffff',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => handleCategoryClick('musica')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 999,
                    border: 'none',
                    background:
                      'linear-gradient(135deg, #dc2626 0%, #f97316 100%)',
                    color: '#f9fafb',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Música
                </button>
                <button
                  type="button"
                  onClick={() => handleCategoryClick('deportes')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 999,
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#ffffff',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Deportes
                </button>
                <button
                  type="button"
                  onClick={() => handleCategoryClick('teatro')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 999,
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#ffffff',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Teatro
                </button>
                <button
                  type="button"
                  onClick={() => handleCategoryClick('festivales')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 999,
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#ffffff',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Festivales
                </button>
              </div>
            </div>

            {/* CTAs PRINCIPALES */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: 12,
                marginBottom: 20,
              }}
            >
              <button
                type="button"
                onClick={() => goToEvents()}
                style={{
                  padding: '12px 22px',
                  borderRadius: 999,
                  border: 'none',
                  background:
                    'linear-gradient(135deg, #dc2626 0%, #f97316 100%)',
                  color: '#f9fafb',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  boxShadow: '0 12px 30px rgba(185,28,28,0.35)',
                }}
              >
                Ver eventos disponibles
              </button>
              <button
                type="button"
                onClick={handleOrganizerClick}
                style={{
                  padding: '12px 22px',
                  borderRadius: 999,
                  border: '1px solid #dc2626',
                  backgroundColor: '#fff',
                  color: '#b91c1c',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Publicar mi evento
              </button>
            </div>

            {/* BENEFICIOS */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: 16,
                fontSize: 13,
                color: '#6b7280',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 999,
                  backgroundColor: '#fef2f2',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '999px',
                    backgroundColor: '#dc2626',
                  }}
                />
                Sin costos fijos para publicar
              </div>

              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 999,
                  backgroundColor: '#fef2f2',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '999px',
                    backgroundColor: '#dc2626',
                  }}
                />
                Pagos seguros con Flow
              </div>

              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 999,
                  backgroundColor: '#fef2f2',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '999px',
                    backgroundColor: '#dc2626',
                  }}
                />
                QR único por asistente
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default LandingPage;
