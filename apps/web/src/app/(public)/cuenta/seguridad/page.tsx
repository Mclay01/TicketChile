import Link from 'next/link';
import { buyerProfile } from '@/lib/account.server';
import { Logout } from '@/components/tc/AccountNav';
import { Notice, PageHeading } from '@/components/tc/ui';
export default async function Page() {
  const p=await buyerProfile();
  return <div className="stack"><PageHeading eyebrow="Mi cuenta" title="Seguridad y acceso" /><section className="panel stack"><h2>Tu correo</h2><p style={{overflowWrap:'anywhere'}}>{p?.email}</p><Notice>{p?.email_verified_at?'Correo verificado.':'Verificación pendiente.'}</Notice><p className="hint">El cambio de correo no está habilitado. Protegemos la continuidad de tus entradas y tu identidad.</p></section><section className="panel stack"><h2>Contraseña y sesión</h2><p>Solicita un enlace de recuperación para cambiar tu contraseña. El cambio invalida las sesiones anteriores.</p><Link className="btn secondary" href="/recuperar">Cambiar contraseña</Link><Logout /></section></div>;
}
