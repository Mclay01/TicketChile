'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="admin-panel" role="alert"><h1>No pudimos cargar esta operación</h1><p>Comprueba tus permisos y filtros. Ninguna acción se confirma desde esta pantalla.</p><button className="btn secondary" onClick={reset}>Reintentar consulta</button></div>;}
