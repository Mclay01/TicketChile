// apps/web/src/lib/stripe.server.ts
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("Falta STRIPE_SECRET_KEY en apps/web/.env.local");

export const stripe = new Stripe(key, {
  apiVersion: "2025-12-15.clover",
  typescript: true,
});

export function appBaseUrl() {
  const env =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  return env || "http://localhost:3001";
}
