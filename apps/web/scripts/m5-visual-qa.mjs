import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { browserPage } from "./m5-browser.mjs";
const page = await browserPage();
const base = "http://localhost:3005";
const directory = "../../docs/03-implementation/qa/m5";
const rows = [];
const routes = [
  ["home", "/"], ["catalog", "/eventos"], ["search", "/eventos?q=Cordillera"], ["empty", "/eventos?q=no-such-event"],
  ["category", "/categorias/conciertos"], ["event", "/eventos/m5-event-0"], ["signin", "/signin"], ["signup", "/signup"],
  ["recovery", "/recuperar"], ["reset", "/nueva-contrasena"], ["faq", "/ayuda"], ["legal", "/legal/privacidad"], ["contact", "/contacto"], ["simulator", "/simulador"],
];
async function check(name, route) {
  for (const width of [390, 430, 768, 1024, 1440]) {
    await page.navigate(base + route, width);
    const result = await page.evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.querySelector('h1')?.innerText,
      missingLabels:Array.from(document.querySelectorAll('main input:not([type=hidden]), main select, main textarea')).filter(x=>!x.closest('label')&&!x.labels?.length&&!x.getAttribute('aria-label')).length,
      brokenImages:Array.from(document.querySelectorAll('main img')).filter(x=>x.complete&&!x.naturalWidth).length,
      font:getComputedStyle(document.body).fontFamily,main:!!document.querySelector('main'),overflow:Array.from(document.querySelectorAll('main *')).filter(x=>x.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(x).position!=='absolute').slice(0,5).map(x=>x.tagName+'.'+x.className)})`);
    rows.push({ page: name, viewport: width, ...result });
    assert.ok(result.scroll <= result.width + 1, `${name} ${width} horizontal overflow ${JSON.stringify(result.overflow)}`);
    assert.ok(result.title, `${name} missing page title`); assert.equal(result.brokenImages, 0, `${name} broken image`); assert.equal(result.missingLabels, 0, `${name} unlabeled field`);
    if ([390, 1440].includes(width) && ["home", "catalog", "event", "signin", "tickets", "ticket"].includes(name)) await page.capture(`${directory}/${name}-${width}.png`);
  }
  console.log(`PASS ${name}: 390, 430, 768, 1024, 1440`);
}
try {
  for (const route of routes) await check(...route);
  // Native dialog focus, Escape and reduced-motion semantics.
  await page.navigate(base + "/", 390);
  await page.evaluate("document.querySelector('button[aria-label=\"Explorar TicketChile\"]').click()");
  assert.equal(await page.evaluate("!!document.querySelector('dialog[open]') && document.querySelector('dialog').contains(document.activeElement)"), true);
  await page.call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page.call("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  assert.equal(await page.evaluate("!!document.querySelector('dialog[open]')"), false);
  await page.call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  assert.equal(await page.evaluate("getComputedStyle(document.documentElement).scrollBehavior"), "auto");
  // Actual M3 credentials form establishes a persisted buyer session; no fabricated JWT.
  await page.navigate(base + "/signin", 390);
  await page.evaluate(`(()=>{for(const [name,value] of [['email','buyer@m5.test'],['password','M5-local-fixture-password!']])document.querySelector('input[name='+name+']').value=value;document.querySelector('main form').requestSubmit()})()`);
  for (let i = 0; i < 80; i++) { await new Promise(r => setTimeout(r, 250)); if (await page.evaluate("location.pathname==='/mis-tickets'")) break; }
  assert.equal(await page.evaluate("location.pathname"), "/mis-tickets");
  for (const route of [["profile", "/cuenta"], ["tickets", "/mis-tickets"], ["ticket", "/mis-tickets/m5-ticket"], ["purchases", "/cuenta/compras"]]) await check(...route);
  // Quantity selection submits only intended type IDs/counts in URL; cap from persisted type.
  await page.navigate(base + "/eventos/m5-event-0", 390);
  await page.evaluate("document.querySelector('button[aria-label=\"Agregar General\"]').click()");
  await new Promise(r => setTimeout(r, 150));
  await page.evaluate("Array.from(document.querySelectorAll('button')).find(x=>x.textContent.startsWith('Continuar')).click()");
  for (let i = 0; i < 80; i++) { await new Promise(r => setTimeout(r, 250)); if (await page.evaluate("location.pathname.startsWith('/checkout/')")) break; }
  const url = new URL(await page.evaluate("location.href")); assert.equal(url.searchParams.get("cart"), "general:1"); assert.equal(url.searchParams.size, 1);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(`${directory}/browser-report.json`, JSON.stringify({ source: "Synthetic disposable PostgreSQL; isolated Chrome; local Next development preview", timestamp: new Date().toISOString(), pages: rows, checks: ["Native buyer credentials form", "Dialog focus and Escape", "Reduced motion", "Selection IDs/quantities only", "No horizontal overflow", "No broken images", "Labeled fields"] }, null, 2));
  console.log(`PASS ${rows.length} page/viewport combinations plus interactions`);
} finally { await page.close(); }
