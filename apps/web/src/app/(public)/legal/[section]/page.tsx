import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeading } from "@/components/tc/ui";
const content: Record<string, { title: string; body: string; detail: string }> = {
  terminos: { title: "Términos y condiciones", body: "La versión definitiva de los términos del servicio está pendiente de revisión y aprobación. Esta página conserva el espacio de información legal; no incorpora como contrato el texto del prototipo.", detail: "Antes de habilitar la operación pública deben publicarse la identificación del prestador, las condiciones de compra y acceso y los canales de atención aprobados." },
  privacidad: { title: "Privacidad", body: "La política definitiva de privacidad está pendiente de revisión y aprobación. La cuenta utiliza los datos necesarios para autenticar el acceso y asociar compras y entradas.", detail: "Debe completarse la información aprobada sobre responsable, finalidades, bases aplicables, proveedores, conservación y ejercicio de derechos. No se inventan plazos ni garantías en esta versión." },
  reembolsos: { title: "Información de reembolsos", body: "La política definitiva de reembolsos está pendiente de aprobación. No se establece aquí un plazo, una penalización ni una elegibilidad automática.", detail: "Las condiciones de cancelación, reprogramación y devolución deberán estar disponibles antes de la venta pública. Un pago en revisión no constituye una confirmación de reembolso." },
};
export default async function LegalPage({ params }: { params: Promise<{ section: string }> }) {
  const section = (await params).section;
  if (!Object.hasOwn(content, section)) notFound();
  const page = content[section];
  return <div className="page prose"><PageHeading eyebrow="Información legal" title={page.title} /><nav className="tabs" aria-label="Documentos legales">{Object.entries(content).map(([key, item]) => <Link key={key} href={`/legal/${key}`} aria-current={key === section ? "page" : undefined}>{item.title}</Link>)}</nav><div className="stack"><Notice>Contenido provisional · Pendiente de aprobación legal</Notice><p>{page.body}</p><h2>Información pendiente</h2><p>{page.detail}</p><Link href="/contacto">Canal de contacto →</Link></div></div>;
}
