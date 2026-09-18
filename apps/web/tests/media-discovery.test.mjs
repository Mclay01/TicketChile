import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { loadSource } from "./load-source.mjs";
test("search validation bounds hostile arrays, control characters, pagination and sort inputs", () => {
  const { catalogFilters } = loadSource("lib/discovery.ts");
  const f = catalogFilters({ q: "x".repeat(1000), page: "9999", sort: "DROP TABLE events", city: ["Santiago"], when: "forever" });
  assert.equal(f.q.length, 120); assert.equal(f.page, 1000); assert.equal(f.sort, "date"); assert.equal(f.city, ""); assert.equal(f.when, "upcoming");
  assert.equal(catalogFilters({ q: "\u0000 hello\n", page: "-1" }).page, 1);
});
test("media compatibility permits existing raster base64/local assets and rejects remote, SVG and traversal sources", () => {
  const { mediaSource, MEDIA_FALLBACK } = loadSource("lib/media.ts");
  for (const value of ["data:image/png;base64,AA==", "/events/a.jpg", "/api/media/11111111-1111-4111-8111-111111111111"]) assert.equal(mediaSource(value), value);
  for (const value of ["https://127.0.0.1/x", "//evil.test/x", "/events/../secrets", "data:image/svg+xml;base64,AA==", "javascript:alert(1)", "data:image/png;base64," + "A".repeat(7_000_001)]) assert.equal(mediaSource(value), MEDIA_FALLBACK);
});
test("image decoder validates format, bounds dimensions, removes metadata and refuses malformed/oversized content", async () => {
  const { normalizeImage } = loadSource("lib/media-storage.server.ts");
  const input = await sharp({ create: { width: 2600, height: 100, channels: 3, background: "red" } }).jpeg().withMetadata().toBuffer();
  const result = await normalizeImage(input), metadata = await sharp(result).metadata();
  assert.equal(metadata.format, "webp"); assert.equal(metadata.width, 2400); assert.equal(metadata.exif, undefined);
  await assert.rejects(normalizeImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')), { status: 400 });
  await assert.rejects(normalizeImage(Buffer.from("not an image")), { status: 400 });
  await assert.rejects(normalizeImage(Buffer.alloc(5 * 1024 * 1024 + 1)), { status: 413 });
});
test("local object storage is immutable, prevents path traversal and is unavailable in production", async () => {
  const { localMediaStore } = loadSource("lib/media-storage.server.ts");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-media-test-")), key = "11111111-1111-4111-8111-111111111111.webp";
  const store = localMediaStore(root); await store.put(key, Buffer.from("test")); assert.equal((await store.get(key)).toString(), "test");
  await assert.rejects(store.put(key, Buffer.from("replacement")), { code: "EEXIST" }); await assert.rejects(store.get("../secret"), { status: 400 });
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = "production";
  try { assert.throws(() => localMediaStore(root), { status: 503 }); } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});
test("upload streaming enforces bounds without Content-Length and rejects wrong content types", async () => {
  const { readImageBody } = loadSource("lib/media-storage.server.ts");
  await assert.rejects(readImageBody(new Request("http://local", { method: "POST", body: Buffer.alloc(5 * 1024 * 1024 + 1), headers: { "content-type": "image/png" } })), { status: 413 });
  await assert.rejects(readImageBody(new Request("http://local", { method: "POST", body: "<svg>", headers: { "content-type": "image/svg+xml" } })), { status: 415 });
});
test("media upload rejects anonymous, cross-tenant and cross-origin requests before reading/storage", async () => {
  const access = loadSource("lib/access.server.ts");
  let reason = 401;
  const route = loadSource("app/api/media/route.ts", { "@/lib/db": { pool: { query: () => assert.fail("No query") } }, "@/lib/access.server": access,
    "@/lib/event-access.server": { requireEventAccess: async () => { throw new access.AccessError(reason, "DENIED", "Denied"); } },
    "@/lib/security/capabilities.server": {}, "@/lib/security/rate-limit.server": { limit: () => assert.fail("No quota") },
    "@/lib/media-storage.server": { readImageBody: () => assert.fail("No body read"), localMediaStore: () => assert.fail("No storage") } });
  const request = origin => new Request("http://local/api/media?eventId=foreign", { method: "POST", headers: { origin, "content-type": "image/png" }, body: "invalid" });
  assert.equal((await route.POST(request("http://local"))).status, 401); reason = 404;
  assert.equal((await route.POST(request("http://local"))).status, 404); assert.equal((await route.POST(request("https://evil.test"))).status, 403);
});
test("private media does not become public from knowledge of its UUID", async () => {
  const access = loadSource("lib/access.server.ts");
  const route = loadSource("app/api/media/[id]/route.ts", { "@/lib/db": { pool: { query: async () => ({ rows: [{ published: false, organizer_id: "other", event_id: "event", object_key: "object.webp" }] }) } }, "@/lib/access.server": access,
    "@/lib/event-access.server": { requireEventAccess: async () => { throw new access.AccessError(404, "DENIED", "Denied"); } }, "@/lib/security/capabilities.server": {}, "@/lib/media-storage.server": { localMediaStore: () => assert.fail("Do not read private bytes") } });
  const response = await route.GET(new Request("http://local"), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) }); assert.equal(response.status, 404);
});
