import ProfileForm from "@/components/tc/ProfileForm";
import Link from "next/link";
import { buyerProfile } from "@/lib/account.server";
import { PageHeading } from "@/components/tc/ui";
import { Logout } from "@/components/tc/AccountNav";
export default async function ProfilePage() {
  const profile = await buyerProfile();
  return <div className="stack"><PageHeading eyebrow="Mi cuenta" title="Tu perfil">Tus datos y accesos, en un solo lugar.</PageHeading><section className="panel stack"><h2>Datos de tu cuenta</h2><ProfileForm name={profile?.nombre || ""} phone={profile?.phone || ""} /><dl className="metadata"><div><dt>Nombre</dt><dd>{profile?.nombre || "Sin nombre registrado"}</dd></div><div><dt>Correo electrónico</dt><dd style={{ overflowWrap: "anywhere" }}>{profile?.email}</dd></div><div><dt>Estado del correo</dt><dd>{profile?.email_verified_at ? "Verificado" : "Pendiente de verificación"}</dd></div></dl><p className="hint">El correo y el RUT no se pueden modificar desde este formulario.</p></section><section className="panel stack"><h2>Seguridad y acceso</h2><p className="muted">Revisa tu acceso o solicita un cambio de contraseña.</p><div className="row"><Link className="btn secondary" href="/cuenta/seguridad">Configurar seguridad</Link><Link href="/recuperar">Cambiar contraseña</Link></div></section><div><Logout /></div></div>;
}
