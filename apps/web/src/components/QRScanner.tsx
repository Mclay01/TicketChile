"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

type Props = {
  onResult: (text: string) => void;
  cooldownMs?: number; // opcional: default 1200
};

export default function QRScanner({ onResult, cooldownMs = 1200 }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // @zxing/browser: no siempre existe reset() estable, así que guardamos stop seguro.
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const stopRef = useRef<null | (() => void)>(null);

  // anti “doble stop” (evita errores tipo setPhotoOptions failed / races)
  const stoppingRef = useRef(false);

  // cooldown anti-spam (evita 200 + 409 + 409 + 409...)
  const lastScanAtRef = useRef(0);
  const lastTextRef = useRef<string>("");

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSecure =
    typeof window !== "undefined" &&
    (window.isSecureContext || location.hostname === "localhost");

  async function start() {
    setError(null);

    if (!isSecure) {
      setError(
        "Para abrir cámara en móvil necesitas HTTPS (o localhost). Abre la app por Cloudflared / URL https."
      );
      return;
    }

    // si está parando, no arranques todavía (evita carreras)
    if (stoppingRef.current) return;

    try {
      const video = videoRef.current;
      if (!video) return;

      // si ya está corriendo, no reinicies (evita doble stream)
      if (running) return;

      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      setRunning(true);

      // decodeFromVideoDevice retorna "controls" con stop() (según versión)
      const controls: any = await reader.decodeFromVideoDevice(
        undefined, // default camera (normalmente trasera)
        video,
        (result) => {
          const text = result?.getText?.();
          if (!text) return;

          const now = Date.now();

          // 1) cooldown por tiempo
          if (now - lastScanAtRef.current < cooldownMs) return;

          // 2) evita duplicado exacto inmediato (tiembla el QR)
          if (text === lastTextRef.current && now - lastScanAtRef.current < cooldownMs * 2) return;

          lastScanAtRef.current = now;
          lastTextRef.current = text;

          onResult(text);
        }
      );

      stopRef.current = () => {
        // en algunos móviles/navegadores, el stop puede tirar errores tipo "setPhotoOptions failed"
        try {
          if (controls?.stop) controls.stop();
        } catch {
          // ignorar: ruido de browser al cerrar cámara
        }

        // fallback: algunas versiones traen reset()
        try {
          (readerRef.current as any)?.reset?.();
        } catch {
          // ignorar
        }
      };
    } catch (e: any) {
      setRunning(false);
      stopRef.current = null;
      readerRef.current = null;
      setError(e?.message ?? "No se pudo iniciar la cámara.");
    }
  }

  function stop() {
    if (stoppingRef.current) return;
    stoppingRef.current = true;

    try {
      stopRef.current?.();
    } catch {
      // ignorar errores de cierre de cámara (browser quirks)
    } finally {
      stopRef.current = null;
      readerRef.current = null;
      setRunning(false);

      // limpiar video por si el stream queda pegado
      const v = videoRef.current as any;
      if (v?.srcObject) {
        try {
          const tracks = v.srcObject.getTracks?.() ?? [];
          for (const t of tracks) t.stop?.();
        } catch {
          // ignorar
        }
        v.srcObject = null;
      }

      // libera “stopping” un poco después (corta carreras stop/start)
      setTimeout(() => {
        stoppingRef.current = false;
      }, 200);
    }
  }

  useEffect(() => {
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-white/80">Cámara (QR en vivo)</p>
          <span
            className={[
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]",
              running
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                : "border-white/10 bg-white/5 text-white/60",
            ].join(" ")}
          >
            {running ? "ON" : "OFF"}
          </span>
        </div>

        {!running ? (
          <button
            type="button"
            onClick={start}
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm backdrop-blur hover:bg-white/10"
          >
            Activar cámara
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm backdrop-blur hover:bg-white/10"
          >
            Detener
          </button>
        )}
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
        <video ref={videoRef} className="w-full aspect-video bg-black/40" playsInline muted />
      </div>

      <p className="text-[11px] text-white/40">
        Anti-spam activo: cooldown {cooldownMs}ms (evita múltiples scans del mismo QR).
      </p>
    </div>
  );
}
