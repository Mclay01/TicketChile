import "server-only";
import { privateJson } from "@/lib/access.server";
export function retiredDemo() {
  return privateJson(410, { ok: false, code: "RETIRED", error: "Esta operación de demostración ya no está disponible." });
}
