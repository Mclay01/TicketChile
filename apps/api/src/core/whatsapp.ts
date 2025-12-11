// apps/api/src/core/whatsapp.ts
import axios from 'axios';

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
  console.warn(
    '[whatsapp] WHATSAPP_TOKEN o WHATSAPP_PHONE_ID no configurados. No se enviarán mensajes.'
  );
}

type SendWhatsappTicketsParams = {
  to: string; // número en formato internacional: 569XXXXXXXX
  buyerName: string;
  eventTitle: string;
  eventDate: string;
  tickets: { code: string }[];
};

/**
 * Envía los tickets por WhatsApp usando la Cloud API de Meta.
 * Requiere que tengas creada y aprobada una plantilla, por ejemplo: "ticket_compra".
 */
export async function sendOrderTicketsWhatsApp(params: SendWhatsappTicketsParams) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return;

  const { to, buyerName, eventTitle, eventDate, tickets } = params;

  const ticketsList = tickets.map((t) => t.code).join(', ');

  // IMPORTANTE:
  // Esta estructura asume que creaste una plantilla "ticket_compra"
  // con body tipo:
  //
  //  Hola {{1}}, gracias por tu compra.
  //  Evento: {{2}}
  //  Fecha: {{3}}
  //  Tickets: {{4}}
  //
  const body = {
    messaging_product: 'whatsapp',
    to, // ej: "56912345678"
    type: 'template',
    template: {
      name: 'ticket_compra',      // <-- nombre EXACTO de tu plantilla en Meta
      language: { code: 'es' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: buyerName || '' },
            { type: 'text', text: eventTitle },
            { type: 'text', text: eventDate },
            { type: 'text', text: ticketsList },
          ],
        },
      ],
    },
  };

  try {
    console.log('[whatsapp] Enviando tickets por WhatsApp...', {
      to,
      buyerName,
      eventTitle,
      ticketsCount: tickets.length,
    });

    await axios.post(
      `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
      body,
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      },
    );

    console.log('[whatsapp] Mensaje enviado correctamente.');
  } catch (err) {
    console.error('[whatsapp] Error enviando WhatsApp:', err);
  }
}
