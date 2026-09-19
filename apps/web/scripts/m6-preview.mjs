import fs from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { localDatabase } from "../tests/local-postgres.mjs";
import { loadSource } from "../tests/load-source.mjs";
// Disposable fixture database and inert environment. Never uses application credentials.
const env = { ...process.env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", TICKETCHILE_BUILD_DIR: ".next-m5-qa" };
for (const name of [".env", ".env.local", ".env.development", ".env.development.local"]) if (fs.existsSync(name)) for (const key of Object.keys(dotenv.parse(fs.readFileSync(name)))) env[key] = "";
for (const key of Object.keys(env)) if (/^(STRIPE_|FLOW_|WEBPAY_|FINTOC_|RESEND_|MAIL_|CHECKOUT_|FROM_EMAIL$|GOOGLE_|AUTH_|SECURITY_|NEXTAUTH_|TRANSFER_|ORGANIZER_|ADMIN_BOOTSTRAP_|APP_|NEXT_PUBLIC_|SUPPORT_)/.test(key)) env[key] = "";
const db = await localDatabase();
const url = `postgresql://ticket_local@127.0.0.1:55439/${db.database}`;
for (const key of ["TICKETCHILE_DB_POSTGRES_URL", "TICKETCHILE_DB_POSTGRES_URL_NON_POOLING", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "POSTGRES_PRISMA_URL", "DATABASE_URL"]) env[key] = url;
Object.assign(env, { DATABASE_SSL: "false", SECURITY_DATA_KEY: Buffer.alloc(32, 53).toString("base64"), NEXTAUTH_SECRET: "m6-local-only-synthetic-session-secret", NEXTAUTH_URL: "http://localhost:3005", NEXTAUTH_URL_INTERNAL: "http://localhost:3005", APP_BASE_URL: "http://localhost:3005", TICKETCHILE_QR_SECRET: "m6-local-only-synthetic-qr-secret", STRIPE_SECRET_KEY: "sk_test_disabled_placeholder", RESEND_API_KEY: "re_disabled_placeholder" });
const crypto = loadSource("lib/security/crypto.server.ts");
const user = randomUUID();
await db.pool.query("INSERT INTO usuarios(id,nombre,email,password_hash,email_verified_at) VALUES($1,'Persona de prueba','buyer@m6.test',$2,now())", [user, await crypto.hashPassword("M6-local-fixture-password!")]);
await db.pool.query("INSERT INTO organizer_users(id,username,display_name,password_hash,verified,approved) VALUES('m6-organizer','m6-organizer','Producciones de prueba','disabled',true,true)");
const names = ["Ritual Nocturno", "Cordillera Sonora", "Nocturna / Sesion 04", "El Ultimo Verano", "Festival Puerto Vivo", "Encuentro Familiar", "Sonidos del Sur", "Noche Abierta", "Escena Local", "Voces del Puerto", "Patio Sonoro", "Ciclo de Verano", "Musica en el Parque"];
for (let i = 0; i < names.length; i++) {
  const id = `m6-event-${i}`, assets = ["fiesta-verano", "sunset-party", "noche-rock"][i % 3];
  await db.pool.query(`INSERT INTO events(id,slug,title,city,venue,date_iso,description,image,hero_desktop,hero_mobile,is_published,category_slug)
    VALUES($1,$1,$2,$3,$4,now()+($5||' days')::interval,$6,$7,$8,$9,true,$10)`, [id, names[i], i % 3 ? "Santiago" : "Valparaiso", i % 2 ? "Teatro de prueba" : "Escenario Central", String(i + 5), "Evento sintetico para verificar la experiencia de TicketChile. Musica en vivo y un encuentro para recordar. Estos datos no representan una venta real.", `/events/${assets}.jpg`, `/banners/1400x450/${assets}.jpg`, `/banners/800x400/${assets}.jpg`, ["conciertos", "fiestas", "teatro", "festivales"][i % 4]]);
  await db.pool.query("INSERT INTO organizer_events(event_id,organizer_id) VALUES($1,'m6-organizer')", [id]);
  await db.pool.query("INSERT INTO ticket_types(id,event_id,name,price_clp,capacity,max_per_order) VALUES('general',$1,'General',$2,100,4),('vip',$1,'Preferencial',30000,20,2)", [id, 12000 + i * 1000]);
}
await db.pool.query("INSERT INTO holds(id,event_id,status,expires_at,owner_email) VALUES('m6-hold','m6-event-0','CONSUMED',now(),'buyer@m6.test')");
await db.pool.query("INSERT INTO orders(id,hold_id,event_id,event_title,buyer_name,buyer_email,owner_email) VALUES('m6-order','m6-hold','m6-event-0','Ritual Nocturno','Persona de prueba','buyer@m6.test','buyer@m6.test')");
await db.pool.query("INSERT INTO tickets(id,order_id,event_id,ticket_type_id,ticket_type_name,buyer_email,owner_email,status) VALUES('m6-ticket','m6-order','m6-event-0','general','General','buyer@m6.test','buyer@m6.test','VALID')");

process.env.SECURITY_DATA_KEY=env.SECURITY_DATA_KEY;
env.ORGANIZER_AI_ADAPTER='local';
const identity=loadSource('lib/security/identity.server.ts',{'@/lib/db':db});
const owner=await identity.principal('ORGANIZER','m6-organizer');
const session=await identity.createSession(owner,true); // Synthetic persisted MFA-ready session, never a production bypass.
await db.pool.query("UPDATE events SET end_at=date_iso+interval '3 hours',address='Direccion de prueba',region='Metropolitana',age_policy='Adultos',access_info='Acceso principal de prueba',capacity=120");
await db.pool.query("UPDATE events SET lifecycle='DRAFT',is_published=false WHERE id='m6-event-2'");
await db.pool.query("UPDATE ticket_types SET sold=1 WHERE event_id='m6-event-0' AND id='general'");
await db.pool.query("INSERT INTO payments(id,hold_id,provider,event_id,event_title,buyer_name,buyer_email,owner_email,amount_clp,currency,status,verified_at,paid_at,order_id,fulfillment_status,creation_state) VALUES('m6-payment','m6-hold','stripe','m6-event-0','Ritual Nocturno','Persona de prueba','buyer@m6.test','buyer@m6.test',12000,'CLP','PAID',now(),now(),'m6-order','ISSUED','READY')");
await db.pool.query("INSERT INTO hold_items(hold_id,event_id,ticket_type_id,ticket_type_name,unit_price_clp,qty) VALUES('m6-hold','m6-event-0','general','General',12000,1)");
await db.pool.query("INSERT INTO organizer_staff(id,organizer_id,buyer_id,role,capabilities,event_ids) VALUES($1,'m6-organizer',$2,'ORGANIZER_DOOR',ARRAY['scanner.read','scanner.checkin'],ARRAY['m6-event-0'])",[randomUUID(),user]);
fs.mkdirSync('.local',{recursive:true});fs.writeFileSync('.local/m6-session.json',JSON.stringify({session,database:db.database}));
await db.pool.end();
fs.mkdirSync(".local", { recursive: true }); fs.writeFileSync(".local/m6-preview.json", JSON.stringify({ database: db.database }));
console.log(`Synthetic QA database: ${db.database}. Preview binds 127.0.0.1:3005; provider/email calls disabled.`);
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3005"], { env, stdio: "inherit" });
process.on("SIGINT", () => child.kill()); process.on("SIGTERM", () => child.kill()); child.on("exit", code => process.exit(code ?? 0));
