// apps/api/src/core/mail.ts
import nodemailer, { Transporter } from 'nodemailer';
import { env } from './config/env';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  // Si no hay SMTP configurado, usamos un transport "dummy" para no romper
  if (!env.SMTP_HOST) {
    console.warn(
      '[mail] SMTP_HOST no está configurado, los correos se marcarán como enviados pero no saldrán a ningún lado.'
    );
    transporter = nodemailer.createTransport({
      jsonTransport: true, // solo loguea el contenido
    });
    return transporter;
  }

  const smtpPort = Number(env.SMTP_PORT) || 587;
  const smtpSecure = false; // para puerto 587 (STARTTLS), secure debe ser false

  console.log('[mail] Creando transporter SMTP real:', {
    host: env.SMTP_HOST,
    port: smtpPort,
    secure: smtpSecure,
    hasUser: !!env.SMTP_USER,
  });

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: smtpPort,
    secure: smtpSecure,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
          }
        : undefined,
  });

  return transporter;
}

/**
 * Envío genérico de email
 */
export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const t = getTransporter();

  const from = env.MAIL_FROM || env.SMTP_USER;
  if (!from) {
    console.warn('[mail] MAIL_FROM/SMTP_USER no configurados, no se envía mail');
    return;
  }

  console.log('[mail] Enviando correo...', {
    from,
    to: opts.to,
    subject: opts.subject,
  });

  try {
    const info = await t.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });

    console.log('[mail] Correo enviado OK. Respuesta transporter:', info);
  } catch (err) {
    console.error('[mail] Error enviando correo con nodemailer:', err);
    throw err;
  }
}

/**
 * Helper específico para enviar los tickets de una orden
 * (por ahora soporta varios tickets en el mismo correo)
 */
export async function sendOrderTicketsEmail(params: {
  to: string;
  buyerName: string;
  eventTitle: string;
  eventDate: string;
  eventVenue: string;
  tickets: { code: string }[];
}) {
  const { to, buyerName, eventTitle, eventDate, eventVenue, tickets } = params;

  console.log('[mail] Preparando correo de tickets', {
    to,
    buyerName,
    eventTitle,
    ticketsCount: tickets.length,
  });

  const subject = `Tus tickets para ${eventTitle}`;

  const ticketsHtml = tickets
    .map((t) => {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
        t.code,
      )}`;
      return `
        <div style="margin-bottom: 24px; border: 1px solid #ddd; padding: 12px; border-radius: 8px;">
          <p><strong>Código:</strong> ${t.code}</p>
          <p>Presenta este QR en la entrada:</p>
          <img src="${qrUrl}" width="220" height="220" alt="QR ticket ${t.code}" />
        </div>
      `;
    })
    .join('');

  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <h1>Tus tickets para ${eventTitle}</h1>
      <p>Hola ${buyerName || ''}, gracias por tu compra.</p>

      <p>
        <strong>Evento:</strong> ${eventTitle}<br />
        <strong>Fecha:</strong> ${eventDate}<br />
        <strong>Lugar:</strong> ${eventVenue}
      </p>

      <h2>Tus tickets</h2>
      ${ticketsHtml}

      <p style="font-size: 12px; color: #666;">
        Si tienes problemas con este correo, muestra el código de cada ticket en la puerta.
      </p>
    </div>
  `;

  await sendMail({
    to,
    subject,
    html,
    text: `Evento: ${eventTitle}\nFecha: ${eventDate}\nLugar: ${eventVenue}\nTickets: ${tickets
      .map((t) => t.code)
      .join(', ')}`,
  });
}
