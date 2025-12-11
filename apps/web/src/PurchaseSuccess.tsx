// apps/web/src/PurchaseSuccess.tsx
import { useEffect, useState } from 'react';

type Ticket = { code: string };
type OrderData = {
  event: {
    title: string;
    startDateTime: string;
    venueName: string;
    venueAddress: string;
  };
  tickets: Ticket[];
};

export default function PurchaseSuccessPage() {
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token = new URLSearchParams(window.location.search).get('token');

  useEffect(() => {
    if (!token) {
      setError('No se encontró el identificador de la compra.');
      setLoading(false);
      return;
    }

    let attempts = 0;
    let stopped = false;

    const fetchOrder = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/orders/public-order/by-flow-token?token=${encodeURIComponent(
            token
          )}`
        );

        if (res.status === 404) {
          // Puede que el webhook aún no haya creado la orden
          if (attempts < 10 && !stopped) {
            attempts++;
            setTimeout(fetchOrder, 2000); // reintento cada 2s
          } else {
            setError(
              'Estamos procesando tu pago. Tus tickets aparecerán en "Mis tickets" y serán enviados a tu correo en unos minutos.'
            );
            setLoading(false);
          }
          return;
        }

        if (!res.ok) {
          throw new Error('Error al cargar la orden');
        }

        const data = await res.json();
        setOrder(data);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError('No pudimos cargar tu compra. Revisa tu correo o "Mis tickets".');
        setLoading(false);
      }
    };

    fetchOrder();

    return () => {
      stopped = true;
    };
  }, [token]);

  const handleDownload = () => {
    window.print(); // versión simple: el usuario puede guardar como PDF
  };

  if (loading) {
    return (
      <div className="success-page">
        <h1>Procesando tu pago...</h1>
        <p>Estamos confirmando tu compra con Flow. Esto puede tardar unos segundos.</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="success-page">
        <h1>Pago recibido</h1>
        <p>{error}</p>
        <p>
          Si tienes dudas, revisa tu correo o entra a la sección <strong>"Mis tickets"</strong>.
        </p>
      </div>
    );
  }

  const eventDate = new Date(order.event.startDateTime).toLocaleString('es-CL');

  return (
    <div className="success-page">
      <div className="card">
        <h1>✅ ¡Pago confirmado!</h1>
        <p>Gracias por tu compra. Aquí está un resumen de tus entradas.</p>

        <section className="event-info">
          <h2>{order.event.title}</h2>
          <p>
            <strong>Fecha:</strong> {eventDate}
          </p>
          <p>
            <strong>Lugar:</strong> {order.event.venueName} · {order.event.venueAddress}
          </p>
        </section>

        <section className="tickets-preview">
          <h3>Tus tickets</h3>
          <div className="tickets-grid">
            {order.tickets.map((t, idx) => {
              const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                t.code
              )}`;
              return (
                <div key={idx} className="ticket-card">
                  <img src={qrUrl} alt={`Ticket ${t.code}`} />
                  <p><strong>Código:</strong> {t.code}</p>
                </div>
              );
            })}
          </div>
        </section>

        <button onClick={handleDownload} className="download-btn">
          Descargar / Imprimir tickets
        </button>

        <p className="hint">
          También te hemos enviado estos tickets a tu correo.  
          Siempre podrás verlos en la sección <strong>"Mis tickets"</strong>.
        </p>
      </div>
    </div>
  );
}
