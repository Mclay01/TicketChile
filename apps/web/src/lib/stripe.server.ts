// apps/web/src/lib/stripe.server.ts
import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

function createStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    // Mensaje correcto para Vercel/producción (sin mencionar .env.local)
    throw new Error("Falta STRIPE_SECRET_KEY en variables de entorno.");
  }

  // Si quieres fijar apiVersion, hazlo aquí.
  // Si no, puedes omitir apiVersion y Stripe usará la versión por defecto de tu cuenta.
  return new Stripe(key, {
    // apiVersion: "2025-12-15.clover", // opcional si lo estás usando a propósito
    typescript: true,
  });
}

/**
 * Acceso lazy: no explota el build por import,
 * solo falla cuando realmente intentas usar Stripe.
 */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    if (!stripeSingleton) stripeSingleton = createStripe();
    // @ts-expect-error Proxy passthrough
    return stripeSingleton[prop];
  },
});

export function appBaseUrl() {
  const env =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL ||
    process.env.APP_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  return env || "http://localhost:3001";
}
