// Next hydration needs inline scripts until a nonce-bearing rendering strategy is adopted.
// Checkout redirects navigate at top level; provider scripts/frames are not embedded.
export function securityHeaders(production) {
  const csp = ["default-src 'self'", `script-src 'self' 'unsafe-inline'${production ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self'",
    `connect-src 'self'${production ? '' : ' ws://localhost:* ws://127.0.0.1:*'}`,
    "media-src 'self' blob:", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'",
    "form-action 'self' https://webpay3g.transbank.cl https://webpay3gint.transbank.cl"];
  return [
    { key: 'Content-Security-Policy', value: csp.join('; ') },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
    ...(production ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
  ];
}
