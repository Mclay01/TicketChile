"use client";
import { useRef, type ReactNode } from "react";
import { Minus, Plus, X } from "lucide-react";
export function Dialog({ label, title, children }: { label: ReactNode; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  return <><button ref={opener} className="icon-btn mobile-only" type="button" aria-haspopup="dialog" aria-label={title} onClick={() => ref.current?.showModal()}>{label}</button>
    <dialog ref={ref} aria-label={title} onClose={() => opener.current?.focus()} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(e => e.getClientRects().length);
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}><div className="dialog-head"><h2>{title}</h2><button type="button" className="icon-btn" aria-label="Cerrar" onClick={() => ref.current?.close()}><X size={20} /></button></div>
      <div onClick={e => { if ((e.target as HTMLElement).closest("a")) ref.current?.close(); }}>{children}</div>
    </dialog></>;
}
export function QuantityStepper({ label, value, max, disabled, onChange }: { label: string; value: number; max: number; disabled?: boolean; onChange: (n: number) => void }) {
  return <div className="stepper" role="group" aria-label={`Cantidad de ${label}`}><button type="button" className="icon-btn" aria-label={`Quitar ${label}`} disabled={disabled || value <= 0} onClick={() => onChange(value - 1)}><Minus size={16} /></button><output aria-live="polite" aria-label={`Cantidad de ${label}`}>{value}</output><button type="button" className="icon-btn" aria-label={`Agregar ${label}`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}><Plus size={16} /></button></div>;
}
