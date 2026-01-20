// src/lib/google-wallet.server.ts
import jwt from "jsonwebtoken";

const ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID?.trim();
const SA_EMAIL = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL?.trim();

// En .env suele venir con \n escapados
const PRIVATE_KEY = (process.env.GOOGLE_WALLET_PRIVATE_KEY || "").replace(/\\n/g, "\n");

function requireEnv(name: string, value?: string) {
  if (!value) throw new Error(`Falta ${name} en variables de entorno.`);
  return value;
}

// IDs permiten solo [A-Za-z0-9._-] en el sufijo; el formato final es issuerId.suffix
function sanitizeSuffix(s: string) {
  return String(s).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200);
}

export function buildGoogleWalletSaveUrl(input: {
  // Sufijos “estables”
  classSuffix: string;   // ej: `event_${eventId}`
  objectSuffix: string;  // ej: `ticket_${ticketId}`

  issuerName: string;    // ej: "Ticket Chile"
  eventName: string;     // ej: "Festival Summer Chile"

  // Lo importante: el QR que vas a escanear (tu token firmado)
  qrValue: string;

  // Recomendado: hostname(s) permitidos (sin https)
  origins: string[];     // ej: ["www.ticketchile.com"]

  // Opcional (pero útil)
  ticketHolderName?: string;
  ticketNumber?: string;
  manageUrl?: string;    // link a /mis-tickets o similar
}) {
  requireEnv("GOOGLE_WALLET_ISSUER_ID", ISSUER_ID);
  requireEnv("GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL", SA_EMAIL);
  requireEnv("GOOGLE_WALLET_PRIVATE_KEY", PRIVATE_KEY);

  const classId = `${ISSUER_ID}.${sanitizeSuffix(input.classSuffix)}`;
  const objectId = `${ISSUER_ID}.${sanitizeSuffix(input.objectSuffix)}`;

  // Clase (mínima). Google muestra UNDER_REVIEW en ejemplos.
  const newClass = {
    id: classId,
    issuerName: input.issuerName,
    reviewStatus: "UNDER_REVIEW",
    eventName: {
      defaultValue: {
        language: "es-CL",
        value: input.eventName,
      },
    },
  };

  // Objeto (mínimo útil): barcode QR + datos
  const newObject: any = {
    id: objectId,
    classId,
    state: "ACTIVE",
    barcode: {
      type: "QR_CODE",
      value: input.qrValue,
    },
  };

  if (input.ticketHolderName) newObject.ticketHolderName = input.ticketHolderName;
  if (input.ticketNumber) newObject.ticketNumber = input.ticketNumber;

  if (input.manageUrl) {
    newObject.linksModuleData = {
      uris: [
        {
          uri: input.manageUrl,
          description: "Ver mis tickets",
          id: "manage",
        },
      ],
    };
  }

  // Claims del JWT (typ:savetowallet) + payload con clases/objetos
  const claims = {
    iss: SA_EMAIL,
    aud: "google",
    typ: "savetowallet",
    origins: input.origins,
    payload: {
      eventTicketClasses: [newClass],
      eventTicketObjects: [newObject],
    },
  };

  const token = jwt.sign(claims, PRIVATE_KEY, { algorithm: "RS256" });

  // Save URL oficial
  return `https://pay.google.com/gp/v/save/${token}`;
}
