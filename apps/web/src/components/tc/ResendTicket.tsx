"use client";
import { useState } from "react";
import { Button, Notice } from "./ui";
export default function ResendTicket({ id }: { id: string }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(false);
  async function resend() {
    setBusy(true); setMessage(""); setError(false);
    try { const response = await fetch("/api/tickets/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticketId: id }) });
      if (!response.ok) { setError(true); setMessage("No pudimos solicitar el reenvío. Intenta nuevamente más tarde."); }
      else setMessage("Reenvío solicitado. El correo quedó en cola; esto no confirma su entrega.");
    } catch { setError(true); setMessage("No pudimos conectar. Intenta nuevamente."); } finally { setBusy(false); }
  }
  return <div className="stack-sm"><Button variant="secondary" disabled={busy} onClick={resend}>{busy ? "Solicitando…" : "Reenviar a mi correo"}</Button>{message && <Notice error={error}>{message}</Notice>}</div>;
}
