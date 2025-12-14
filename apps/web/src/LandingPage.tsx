// apps/web/src/LandingPage.tsx
import React from 'react';

export default function LandingPage() {
  function goToEventos() {
    if (typeof window !== 'undefined') {
      window.location.href = '/eventos';
    }
  }

  function goToOrganizer() {
    if (typeof window !== 'undefined') {
      window.location.href = '/eventos?login=1';
    }
  }

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
      {/* NAVBAR */}
      <header
        style={{
          backgroundColor: '#7f1d1d', // rojo oscuro
          color: '#f9fafb',
          padding: '10px 16px',
          borderBottom: '1px solid rgba(0,0,0,0.15)',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <img
              src="/ticketchile-logo.png"
              alt="TicketChile"
              style={{
                height: 40,
                width: 'auto',
                objectFit: 'contain',
              }}
            />
          </div>

          {/* Botones derecha */}
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 14,
            }}
          >
            <button
              type="button"
              onClick={goToEventos}
              style={{
                padding: '7px 13px',
                borderRadius: 999,
                border: '1px solid rgba(248,250,252,0.4)',
                backgroundColor: 'transparent',
                color: '#f9fafb',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Ver eventos
            </button>

            <button
              type="button"
              onClick={goToOrganizer}
              style={{
                padding: '7px 14px',
                borderRadius: 999,
                border: 'none',
                background:
                  'linear-gradient(135deg, #b91c1c 0%, #7f1d1d 50%, #450a0a 100%)',
                color: '#f9fafb',
                cursor: 'pointer',
                fontWeight: 600,
                boxShadow: '0 8px 18px rgba(0,0,0,0.35)',
              }}
            >
              Soy organizador
            </button>
          </nav>
        </div>
      </header>

      {/* CONTENIDO */}
      <main
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 1200,
          margin: '0 auto',
          padding: '32px 16px 40px',
          boxSizing: 'border-box',
        }}
      >
        {/* HERO */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)',
            gap: 32,
            alignItems: 'center',
          }}
        >
          {/* Texto principal */}
          <div>
            <p
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#b91c1c',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Tu entrada más rápida al evento
            </p>

            <h1
              style={{
                fontSize: 32,
                lineHeight: 1.1,
                margin: 0,
                marginBottom: 12,
                color: '#111827',
              }}
            >
              Vende y compra tickets
              <br />
              en segundos con{' '}
              <span style={{ color: '#b91c1c' }}>TicketChile</span>
            </h1>

            <p
              style={{
                margin: 0,
                marginBottom: 16,
                fontSize: 15,
                color: '#4b5563',
                maxWidth: 520,
              }}
            >
              Crea tu evento, configura tus entradas y recibe pagos en línea de
              forma simple y segura. Sin vueltas, sin formularios eternos.
            </p>

            {/* Botones hero */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                marginTop: 8,
                marginBottom: 18,
              }}
            >
              <button
                type="button"
                onClick={goToEventos}
                style={{
                  padding: '10px 18px',
                  borderRadius: 999,
                  border: 'none',
                  background:
                    'linear-gradient(135deg, #b91c1c 0%, #7f1d1d 50%, #450a0a 100%)',
                  color: '#f9fafb',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 14,
                  boxShadow: '0 10px 22px rgba(127,29,29,0.45)',
                }}
              >
                Ver eventos disponibles
              </button>

              <button
                type="button"
                onClick={goToOrganizer}
                style={{
                  padding: '10px 18px',
                  borderRadius: 999,
                  border: '1px solid #b91c1c',
                  backgroundColor: '#ffffff',
                  color: '#7f1d1d',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Publicar mi evento
              </button>
            </div>

            {/* Pills / highlights */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                fontSize: 12,
              }}
            >
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  backgroundColor: '#fee2e2',
                  color: '#991b1b',
                  fontWeight: 500,
                }}
              >
                Pagos con Flow
              </span>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  fontWeight: 500,
                }}
              >
                QR para control de acceso
              </span>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  backgroundColor: '#ede9fe',
                  color: '#5b21b6',
                  fontWeight: 500,
                }}
              >
                Panel organizador incluido
              </span>
            </div>
          </div>

          {/* Lado derecho – tarjetita informativa (SIN evento hardcodeado) */}
          <div
            style={{
              justifySelf: 'stretch',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 420,
                borderRadius: 24,
                border: '1px solid #fee2e2',
                background:
                  'linear-gradient(145deg, #fef2f2 0%, #ffffff 45%, #fee2e2 100%)',
                padding: 18,
                boxShadow: '0 18px 40px rgba(0,0,0,0.15)',
                boxSizing: 'border-box',
              }}
            >
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#991b1b',
                  margin: 0,
                  marginBottom: 6,
                }}
              >
                ¿Eres productor o organizador?
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: '#4b5563',
                  margin: 0,
                  marginBottom: 12,
                }}
              >
                Publica tus eventos y recibe los pagos de tus entradas
                directamente. TicketChile se encarga de la venta y el control
                de acceso.
              </p>

              <ul
                style={{
                  paddingLeft: 18,
                  margin: 0,
                  marginBottom: 14,
                  fontSize: 13,
                  color: '#374151',
                }}
              >
                <li>Configura distintos tipos de entradas</li>
                <li>Comisiones transparentes por ticket vendido</li>
                <li>Escáner QR para validar el acceso</li>
              </ul>

              <button
                type="button"
                onClick={goToOrganizer}
                style={{
                  marginTop: 4,
                  width: '100%',
                  padding: '9px 14px',
                  borderRadius: 999,
                  border: 'none',
                  background:
                    'linear-gradient(135deg, #b91c1c 0%, #7f1d1d 60%, #450a0a 100%)',
                  color: '#f9fafb',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Empezar como organizador
              </button>
            </div>
          </div>
        </section>

        {/* Sección pequeña de “cómo funciona” */}
        <section
          style={{
            marginTop: 40,
            borderTop: '1px solid #e5e7eb',
            paddingTop: 24,
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 12,
              color: '#111827',
            }}
          >
            ¿Cómo funciona TicketChile?
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            <div
              style={{
                borderRadius: 16,
                border: '1px solid #fee2e2',
                backgroundColor: '#fff',
                padding: 14,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  margin: 0,
                  marginBottom: 4,
                  color: '#991b1b',
                }}
              >
                1. Crea tu evento
              </h3>
              <p
                style={{
                  fontSize: 13,
                  margin: 0,
                  color: '#4b5563',
                }}
              >
                Define fecha, lugar, capacidad y tipos de entradas desde el
                panel de organizador.
              </p>
            </div>

            <div
              style={{
                borderRadius: 16,
                border: '1px solid #fee2e2',
                backgroundColor: '#fff',
                padding: 14,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  margin: 0,
                  marginBottom: 4,
                  color: '#991b1b',
                }}
              >
                2. Vende online
              </h3>
              <p
                style={{
                  fontSize: 13,
                  margin: 0,
                  color: '#4b5563',
                }}
              >
                Tus asistentes compran con Flow y reciben sus tickets con QR
                por correo.
              </p>
            </div>

            <div
              style={{
                borderRadius: 16,
                border: '1px solid #fee2e2',
                backgroundColor: '#fff',
                padding: 14,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  margin: 0,
                  marginBottom: 4,
                  color: '#991b1b',
                }}
              >
                3. Controla el acceso
              </h3>
              <p
                style={{
                  fontSize: 13,
                  margin: 0,
                  color: '#4b5563',
                }}
              >
                Usa el lector de QR integrado para marcar tickets como usados y
                evitar duplicados.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER SIMPLE */}
      <footer
        style={{
          borderTop: '1px solid #e5e7eb',
          padding: '10px 16px 14px',
          fontSize: 12,
          color: '#6b7280',
          textAlign: 'center',
          backgroundColor: '#f9fafb',
        }}
      >
        © {new Date().getFullYear()} TicketChile. Todos los derechos reservados.
      </footer>
    </div>
  );
}
