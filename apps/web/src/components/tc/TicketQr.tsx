"use client";
import Image from "next/image";
import { useState } from "react";
import { Notice } from "./ui";
export default function TicketQr({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <Notice error>No pudimos cargar tu QR. Actualiza la página para volver a validar el acceso.</Notice> : <Image className="qr-image" src={`/api/qr?ticketId=${encodeURIComponent(id)}`} alt="Código QR de acceso de tu entrada" width={280} height={280} unoptimized onError={() => setFailed(true)} />;
}
