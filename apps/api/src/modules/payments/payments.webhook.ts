// apps/api/src/modules/payments/payments.webhook.ts

// Por ahora NO usamos Stripe como pasarela activa.
// Dejamos este webhook como stub para que la ruta exista
// pero no rompa el servidor si alguien la llama.

export async function handleStripeWebhook(
  signature: string,
  payload: Buffer
): Promise<void> {
  console.warn('[payments] Webhook de Stripe recibido pero Stripe está deshabilitado.', {
    hasSignature: !!signature,
    payloadLength: payload.length,
  });

  // No hacemos nada más. Cuando migremos 100% a Flow,
  // este archivo se puede reutilizar para un webhook distinto
  // o simplemente eliminarse junto con la ruta de Stripe.
  return;
}
