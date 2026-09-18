import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { localDatabase } from "./local-postgres.mjs";
import { loadSource } from "./load-source.mjs";
let db; let email = "owner@m5.test";
const access = loadSource("lib/access.server.ts");
const load = file => loadSource(file, { "@/lib/db": db, "@/lib/ticket-access.server": { requireBuyerEmail: async () => { if (!email) throw new access.AccessError(401, "UNAUTHENTICATED", "Login"); return email; } }, "@/lib/access.server": access, "@/auth": {}, "next/navigation": { redirect: () => { throw new Error("LOGIN_REDIRECT"); } } });
before(async () => {
  db = await localDatabase();
  await db.pool.query("INSERT INTO organizer_users(id,username,display_name,password_hash) VALUES('org','owner','Real organizer','disabled')");
  for (let i = 0; i < 15; i++) {
    await db.pool.query(`INSERT INTO events(id,slug,title,city,venue,date_iso,description,image,is_published,category_slug)
      VALUES($1,$1,$2,$3,'Real venue',now()+($4||' days')::interval,'Description','https://untrusted.test/image.jpg',$5,$6)`, [`ev${i}`, i === 0 ? "100% Music" : `Concert ${i}`, i % 2 ? "Santiago" : "Valparaiso", i === 14 ? "-1" : String(i + 1), i !== 13, i % 2 ? "conciertos" : "teatro"]);
    await db.pool.query("INSERT INTO ticket_types(id,event_id,name,price_clp,capacity,sold,held,max_per_order) VALUES('general',$1,'General',$2,20,3,2,4)", [`ev${i}`, 1000 + i * 100]);
    await db.pool.query("INSERT INTO organizer_events(event_id,organizer_id) VALUES($1,'org')", [`ev${i}`]);
  }
  for (const [id, owner, event] of [["own", "owner@m5.test", "ev0"], ["foreign", "other@m5.test", "ev1"], ["past", "owner@m5.test", "ev14"]]) {
    await db.pool.query("INSERT INTO holds(id,event_id,status,expires_at,owner_email) VALUES($1,$2,'CONSUMED',now(),$3)", [`h-${id}`, event, owner]);
    await db.pool.query("INSERT INTO orders(id,hold_id,event_id,event_title,buyer_name,buyer_email,owner_email) VALUES($1,$2,$3,'Ordered title','Name',$4,$4)", [id, `h-${id}`, event, owner]);
    await db.pool.query("INSERT INTO tickets(id,order_id,event_id,ticket_type_id,ticket_type_name,buyer_email,owner_email,status) VALUES($1,$2,$3,'general','General',$4,$4,'VALID')", [`t-${id}`, id, event, owner]);
  }
  await db.pool.query("INSERT INTO tickets(id,order_id,event_id,ticket_type_id,ticket_type_name,buyer_email,owner_email,status) VALUES('transferred','own','ev0','general','General','owner@m5.test','other@m5.test','VALID'),('cancelled','own','ev0','general','General','owner@m5.test','owner@m5.test','CANCELLED')");
});
after(async () => db?.pool.end());
test("catalog is bounded, excludes unpublished/past events, and maps real inventory/organizer metadata", async () => {
  const result = await load("lib/events.server.ts").catalogDb();
  assert.equal(result.total, 13); assert.equal(result.events.length, 12); assert.equal(result.events[0].organizerName, "Real organizer");
  assert.equal(result.events[0].ticketTypes[0].maxPerOrder, 4); assert.equal(result.events[0].ticketTypes[0].held, 2); assert.equal(result.events[0].image, "/media-placeholder.svg");
  const page = await load("lib/events.server.ts").catalogDb({ page: "2" }); assert.equal(page.events.length, 1); assert.ok(!result.events.some(e => e.id === page.events[0].id));
});
test("catalog combines city/category/date filters, sorts canonical prices, and escapes search wildcards", async () => {
  const service = load("lib/events.server.ts");
  assert.equal((await service.catalogDb({ q: "%" })).total, 1);
  assert.equal((await service.catalogDb({ q: "%' OR 1=1 --" })).total, 0);
  const filtered = await service.catalogDb({ city: "Santiago", category: "conciertos", when: "week", sort: "price_desc" });
  assert.ok(filtered.events.length > 0); assert.ok(filtered.events.every(e => e.city === "Santiago" && e.category === "conciertos"));
  assert.ok(filtered.events[0].ticketTypes[0].priceCLP > filtered.events.at(-1).ticketTypes[0].priceCLP);
  assert.equal((await service.catalogDb({ q: "Concert 12" })).events[0].id, "ev12");
});
test("detail and every legacy public event API reject unpublished identifiers", async () => {
  assert.equal(await load("lib/events.server.ts").getEventBySlugDb("ev13"), undefined);
  for (const [route, url, params] of [["app/api/events/route.ts", "http://local/api/events?id=ev13", {}], ["app/api/events/[id]/route.ts", "http://local/api/events/ev13", { id: "ev13" }], ["app/api/events/by-slug/[slug]/route.ts", "http://local/api/events/by-slug/ev13", { slug: "ev13" }]]) {
    assert.equal((await load(route).GET(new Request(url), { params: Promise.resolve(params) })).status, 404);
  }
  assert.equal((await load("lib/events.server.ts").getEventByIdDb("ev14")).ended, true);
});
test("facets count only current published events with configured category names", async () => {
  const facets = await load("lib/events.server.ts").discoveryFacets();
  assert.equal(facets.categories.reduce((n, c) => n + c.count, 0), 13);
  assert.equal(facets.cities.reduce((n, c) => n + c.count, 0), 13);
  assert.ok(facets.categories.some(c => c.slug === "familiar" && c.count === 0));
});
test("legacy base64 media is read through a publication-checked binary route, never serialized into public event data", async () => {
  const sharp = (await import("sharp")).default;
  const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: "red" } }).png().toBuffer();
  await db.pool.query("UPDATE events SET image=$1 WHERE id IN ('ev0','ev13')", [`data:image/png;base64,${bytes.toString("base64")}`]);
  const event = await load("lib/events.server.ts").getEventByIdDb("ev0");
  assert.equal(event.image, "/api/event-media/ev0/poster"); assert.ok(!JSON.stringify(event).includes("base64"));
  const route = load("app/api/event-media/[id]/[slot]/route.ts");
  const response = await route.GET(new Request("http://local"), { params: Promise.resolve({ id: "ev0", slot: "poster" }) });
  assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "image/webp");
  for (const params of [{ id: "ev13", slot: "poster" }, { id: "ev0", slot: "password_hash" }]) assert.equal((await route.GET(new Request("http://local"), { params: Promise.resolve(params) })).status, 404);
});
test("buyer lists separate upcoming, past and cancelled entries and exclude transferred ownership", async () => {
  const account = load("lib/account.server.ts");
  assert.deepEqual((await account.buyerTickets()).tickets.map(t => t.id), ["t-own"]);
  assert.deepEqual((await account.buyerTickets("past")).tickets.map(t => t.id), ["t-past"]);
  assert.deepEqual((await account.buyerTickets("cancelled")).tickets.map(t => t.id), ["cancelled"]);
  assert.equal(await account.buyerTicket("t-foreign"), null); assert.equal(await account.buyerTicket("transferred"), null);
  assert.equal((await account.buyerTicket("cancelled")).status, "CANCELLED");
  email = "other@m5.test";
  try { assert.equal((await account.buyerTicket("transferred")).owner_email, email); assert.equal(await account.buyerTicket("t-own"), null); } finally { email = "owner@m5.test"; }
});
test("purchase history scopes orders separately from tickets and never reveals payment references", async () => {
  const purchases = (await load("lib/account.server.ts").buyerPurchases()).purchases;
  assert.deepEqual(purchases.map(p => p.id).sort(), ["own", "past"]);
  assert.ok(purchases.every(p => !Object.hasOwn(p, "provider_ref") && !Object.hasOwn(p, "buyer_email")));
});
test("anonymous account reads redirect before any query", async () => {
  email = "";
  try { const account = load("lib/account.server.ts"); for (const operation of [() => account.buyerTickets(), () => account.buyerTicket("t-own"), () => account.buyerPurchases(), () => account.buyerProfile()]) await assert.rejects(operation, /LOGIN_REDIRECT/); } finally { email = "owner@m5.test"; }
});
test("media reference ownership rejects foreign objects and new base64 persistence", async () => {
  await db.pool.query("INSERT INTO media_objects(id,organizer_id,object_key,content_type,bytes) VALUES('11111111-1111-4111-8111-111111111111','org','test.webp','image/webp',100)");
  const service = load("lib/media-access.server.ts"), url = "/api/media/11111111-1111-4111-8111-111111111111";
  assert.equal(await service.ownedMediaReference(url, "org"), url);
  await assert.rejects(service.ownedMediaReference(url, "foreign"), { status: 404 });
  await assert.rejects(service.ownedMediaReference("data:image/png;base64,AA==", "org"), { status: 400 });
});
test("authorized media upload stores normalized immutable bytes plus atomic audit and remains private before publication", async () => {
  const fs = await import("node:fs/promises"), os = await import("node:os"), path = await import("node:path"), sharp = (await import("sharp")).default;
  const storage = loadSource("lib/media-storage.server.ts");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-upload-test-"));
  const store = storage.localMediaStore(root);
  const overrides = { "@/lib/db": db, "@/lib/access.server": access,
    "@/lib/event-access.server": { requireEventAccess: async (id, cap) => { assert.equal(id, "ev0"); assert.equal(cap, "event.edit"); return { organizerId: "org", actor: { kind: "ORGANIZER", id: "org" } }; } },
    "@/lib/security/capabilities.server": {}, "@/lib/security/rate-limit.server": { limit: async () => {} },
    "@/lib/media-storage.server": { ...storage, localMediaStore: () => store } };
  const route = loadSource("app/api/media/route.ts", overrides);
  const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: "blue" } }).png().toBuffer();
  const response = await route.POST(new Request("http://local/api/media?eventId=ev0", { method: "POST", headers: { origin: "http://local", "content-type": "image/png" }, body: bytes }));
  assert.equal(response.status, 201); const data = await response.json();
  const row = (await db.pool.query("SELECT * FROM media_objects WHERE id=$1", [data.id])).rows[0];
  assert.equal(row.organizer_id, "org"); assert.equal(row.content_type, "image/webp"); assert.equal((await sharp(await store.get(row.object_key)).metadata()).format, "webp");
  assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM security_audit WHERE action='media.created' AND target_id=$1", [data.id])).rows[0].n, 1);
  const read = loadSource("app/api/media/[id]/route.ts", { ...overrides, "@/lib/event-access.server": { requireEventAccess: async () => { throw new access.AccessError(404, "DENIED", "Denied"); } } });
  const context = { params: Promise.resolve({ id: data.id }) };
  assert.equal((await read.GET(new Request("http://local"), context)).status, 404);
  await db.pool.query("UPDATE events SET image=$1 WHERE id='ev0'", [data.url]);
  assert.equal((await read.GET(new Request("http://local"), context)).status, 200);
  await db.pool.query("UPDATE events SET is_published=false WHERE id='ev0'");
  assert.equal((await read.GET(new Request("http://local"), context)).status, 404);
});
