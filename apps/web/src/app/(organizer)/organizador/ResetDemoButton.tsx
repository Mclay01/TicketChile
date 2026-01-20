"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ResetDemoButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await fetch("/api/demo/reset", { method: "POST" });
          router.refresh();
        } finally {
          setLoading(false);
        }
      }}
      className={[
        "rounded-xl border px-4 py-2 text-sm transition backdrop-blur",
        "border-white/10 bg-black/30 hover:bg-white/10",
        "disabled:opacity-50 disabled:hover:bg-black/30",
      ].join(" ")}
    >
      {loading ? "Reseteando…" : "Reset demo"}
    </button>
  );
}
