// apps/web/src/lib/tickets.email.ts
import { pool } from "@/lib/db";

function normalizeEmail(v: string) {
  return String(v || "").trim().toLowerCase();
}

function mustEnv(name: string) {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function sendEmailResend(args: { to: string; subject: string; html: string; text?: string }) {
  const apiKey = mustEnv("RESEND_API_KEY");
  const from = mustEnv("MAIL_FROM"); // ej: "TicketChile <no-reply@tudominio.cl>"

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Resend error ${res.status}: ${msg || res.statusText}`);
  }
}

/**
 * Dedupe lock usando webhook_events(provider,event_id)
 * - Si ya existe: no manda (evita doble envío).
 * - Si falla el envío: borra el lock para poder reintentar.
 */
async function sendOnce(dedupeKey: string, fn: () => Promise<void>) {
  const lock = await pool.query(
    `
    INSERT INTO webhook_events (provider, event_id)
    VALUES ('email', $1)
    ON CONFLICT (provider, event_id) DO NOTHING
    RETURNING event_id
    `,
    [dedupeKey]
  );

  if (lock.rowCount === 0) return { skipped: true };

  try {
    await fn();
    return { sent: true };
  } catch (e) {
    await pool
      .query(`DELETE FROM webhook_events WHERE provider='email' AND event_id=$1`, [dedupeKey])
      .catch(() => {});
    throw e;
  }
}

function escapeHtml(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendTicketsEmailsForPayment(paymentIdRaw: string, baseUrlRaw: string) {
  const paymentId = String(paymentIdRaw || "").trim();
  if (!paymentId) throw new Error("sendTicketsEmailsForPayment: missing paymentId");

  const baseUrl = String(baseUrlRaw || "").replace(/\/+$/, "");

  // 1) Traer payment + order_id
  const pRes = await pool.query(
    `
    SELECT id, status, event_title, event_id, amount_clp,
           buyer_name, buyer_email, owner_email, order_id
    FROM payments
    WHERE id=$1
    LIMIT 1
    `,
    [paymentId]
  );

  if (pRes.rowCount === 0) throw new Error("payment not found for email");
  const p = pRes.rows[0];

  const status = String(p.status || "").toUpperCase();
  if (status !== "PAID") {
    // No mandes correos por pagos no pagados (obvio, pero hay que decirlo).
    return { skipped: true, reason: `payment status=${status}` };
  }

  const buyerEmail = normalizeEmail(p.buyer_email || "");
  const ownerEmail = normalizeEmail(p.owner_email || "");
  const buyerName = String(p.buyer_name || "").trim();
  const eventTitle = String(p.event_title || "").trim();
  const orderId = String(p.order_id || "").trim();

  if (!orderId) throw new Error("payment has no order_id yet (cannot email tickets)");

  // 2) Traer tickets
  const tRes = await pool.query(
    `
    SELECT id, ticket_type_name, status
    FROM tickets
    WHERE order_id=$1
    ORDER BY created_at ASC
    `,
    [orderId]
  );

  const tickets = tRes.rows || [];
  const count = tickets.length;

  const confirmUrl = `${baseUrl}/checkout/confirm?payment_id=${encodeURIComponent(paymentId)}`;
  const myTicketsUrl = `${baseUrl}/mis-tickets`;

  const subject = count
    ? `Tus tickets: ${eventTitle || "Compra confirmada"} (${count})`
    : `Compra confirmada: ${eventTitle || "TicketChile"}`;

  const rowsHtml = tickets
    .map(
      (t: any) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;">${escapeHtml(
          String(t.ticket_type_name || "")
        )}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;">${escapeHtml(
          String(t.id || "")
        )}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;">${escapeHtml(
          String(t.status || "")
        )}</td>
      </tr>
    `
    )
    .join("");

  const html = `
  <div style="font-family:Arial,sans-serif;line-height:1.45;color:#111">
    <h2 style="margin:0 0 12px 0;">Compra confirmada ✅</h2>
    <p style="margin:0 0 10px 0;">
      <b>Evento:</b> ${escapeHtml(eventTitle || "—")}<br/>
      <b>Comprador:</b> ${escapeHtml(buyerName || "—")}<br/>
      <b>Pago:</b> ${escapeHtml(paymentId)}
    </p>

    <p style="margin:0 0 14px 0;">
      Puedes ver el detalle aquí:
      <a href="${confirmUrl}">${confirmUrl}</a>
    </p>

    ${
      count
        ? `
      <h3 style="margin:16px 0 8px 0;">Tickets (${count})</h3>
      <table style="border-collapse:collapse;width:100%;max-width:820px;">
        <thead>
          <tr>
            <th align="left" style="padding:8px;border-bottom:2px solid #ddd;">Tipo</th>
            <th align="left" style="padding:8px;border-bottom:2px solid #ddd;">ID</th>
            <th align="left" style="padding:8px;border-bottom:2px solid #ddd;">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      `
        : `<p>No encontré tickets asociados (raro). Revisa el panel.</p>`
    }

    <p style="margin:16px 0 0 0;">
      Acceso directo a <a href="${myTicketsUrl}">Mis tickets</a>.
    </p>

    <hr style="margin:18px 0;border:none;border-top:1px solid #eee"/>
    <p style="margin:0;color:#666;font-size:12px">
      TicketChile • Este correo fue generado automáticamente.
    </p>
  </div>
  `.trim();

  const text = `Compra confirmada
Evento: ${eventTitle || "-"}
Pago: ${paymentId}
Ver detalle: ${confirmUrl}
Mis tickets: ${myTicketsUrl}`;

  // 3) Mandar a buyer + owner (si existen) sin duplicar
  const targets = Array.from(
    new Set([buyerEmail, ownerEmail].filter((x) => x && x.includes("@")))
  );

  const results: any[] = [];
  for (const to of targets) {
    const key = `ticket_email:${paymentId}:${to}`;
    const out = await sendOnce(key, async () => {
      await sendEmailResend({ to, subject, html, text });
    });
    results.push({ to, ...out });
  }

  return { ok: true, targets, results };
}
