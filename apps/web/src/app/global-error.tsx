'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- A failed root layout needs a full document reload for navigation recovery. */
export default function GlobalError({reset}:{reset:()=>void}) {
  return <html lang="es"><body style={{background:'#0a0b0c',color:'#e9eae7',fontFamily:'sans-serif',padding:32}}><main><h1>No pudimos cargar TicketChile</h1><p>Vuelve a intentarlo en unos momentos.</p><button onClick={reset} style={{padding:16}}>Reintentar</button> <a href="/" style={{color:'#e9eae7',padding:16}}>Volver al inicio</a></main></body></html>;
}
