import Link from "next/link";
import { Ticket } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" }) {
  return <button {...props} className={`btn ${variant} ${className}`} />;
}
export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="hint">{hint}</span>}{error && <span className="field-error" role="alert">{error}</span>}</label>;
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`notice ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{children}</div>;
}
export function EmptyState({ title, children, href, action }: { title: string; children?: ReactNode; href?: string; action?: string }) {
  return <div className="empty"><Ticket size={32} aria-hidden="true" /><h2>{title}</h2><p className="muted">{children}</p>{href && <Link className="btn secondary" href={href}>{action || "Explorar eventos"}</Link>}</div>;
}
export function PageHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return <div className="page-heading">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{children && <p className="muted">{children}</p>}</div>;
}
export function Status({ value }: { value: string }) {
  const names: Record<string, string> = { VALID: "Disponible", USED: "Utilizada", CANCELLED: "Anulada", PAID: "Pagada", PENDING: "Pendiente", CREATED: "Creada", FAILED: "No completada", REVIEW: "En revisión" };
  return <span className={`status ${["VALID", "PAID"].includes(value) ? "" : "inactive"}`}>{names[value] || "En revisión"}</span>;
}
