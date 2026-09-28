import Link from 'next/link';
export default function Recovery({ title = 'No pudimos cargar esta página', href = '/eventos', reset }: { title?: string; href?: string; reset?: () => void }) {
  return <div className="tc page stack"><h1>{title}</h1><p>Vuelve a intentarlo o regresa al inicio de esta sección.</p><div className="row">{reset && <button type="button" className="btn" onClick={reset}>Reintentar</button>}<Link className="btn secondary" href={href}>Volver al inicio</Link></div></div>;
}
