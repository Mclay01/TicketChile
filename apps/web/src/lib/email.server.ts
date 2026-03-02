// apps/web/src/lib/email.server.ts
import "server-only";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOrganizerVerificationEmail(params: {
  to: string;
  code: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY no configurado.");
  }

  await resend.emails.send({
    from: "TicketChile <no-reply@ticketchile.com>",
    to: params.to,
    subject: "Verifica tu cuenta en TicketChile",
    html: `
      <div style="font-family: Arial, sans-serif; padding:20px;">
        <h2>Verifica tu cuenta</h2>
        <p>Tu código de verificación es:</p>
        <div style="font-size:32px; font-weight:bold; letter-spacing:4px; margin:20px 0;">
          ${params.code}
        </div>
        <p>Este código expira en 10 minutos.</p>
        <hr/>
        <p style="font-size:12px; color:#888;">
          Si no solicitaste esta cuenta, puedes ignorar este correo.
        </p>
      </div>
    `,
  });
}