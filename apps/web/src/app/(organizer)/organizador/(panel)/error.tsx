'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="notice error" role="alert"><h2>No pudimos cargar esta sección</h2><p>Verifica tu conexión y que tu acceso siga vigente.</p><button className="btn secondary" onClick={reset}>Reintentar</button></div>;}
