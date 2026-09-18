import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Build only. Never start the application with these nonfunctional credentials.
const cwd = fileURLToPath(new URL("../", import.meta.url));
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", TICKETCHILE_BUILD_DIR: ".next-astra" };
for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  const filename = new URL(`../${name}`, import.meta.url);
  if (fs.existsSync(filename)) {
    for (const key of Object.keys(dotenv.parse(fs.readFileSync(filename)))) env[key] = "";
  }
}
// Clear inherited provider settings as well as file-loaded settings.
for (const key of Object.keys(env)) {
  if (/^(STRIPE_|FLOW_|WEBPAY_|FINTOC_|RESEND_|MAIL_|CHECKOUT_|FROM_EMAIL$|GOOGLE_|AUTH_|SECURITY_|NEXTAUTH_|TRANSFER_|ORGANIZER_|ADMIN_BOOTSTRAP_|APP_|NEXT_PUBLIC_)/.test(key)) env[key] = "";
}
for (const key of ["TICKETCHILE_DB_POSTGRES_URL", "TICKETCHILE_DB_POSTGRES_URL_NON_POOLING", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "POSTGRES_PRISMA_URL", "DATABASE_URL"]) {
  env[key] = "postgresql://local:local@127.0.0.1:1/ticketchile_build";
}
Object.assign(env, {
  DATABASE_SSL: "false", TICKETCHILE_BUILD_DIR: ".next-astra",
  NEXTAUTH_SECRET: "isolated-build-not-a-real-session-secret", NEXTAUTH_URL: "http://localhost:3000",
  NEXTAUTH_URL_INTERNAL: "http://localhost:3000",
  STRIPE_SECRET_KEY: "sk_test_build_placeholder", RESEND_API_KEY: "re_build_placeholder",
  TICKETCHILE_QR_SECRET: "isolated-build-not-a-real-qr-secret",
});
const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], { cwd, env, stdio: "inherit" });
if (result.error) console.error(`Build process failed: ${result.error.code}`);
process.exit(result.status ?? 1);
