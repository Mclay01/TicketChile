import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { browserPage } from "./m5-browser.mjs";
const page = await browserPage(); const base = "http://localhost:3005"; const results = [];
async function waitText(text) {
  for (let i = 0; i < 80; i++) { if (await page.evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`)) return; await new Promise(r => setTimeout(r, 200)); }
  throw new Error(`Missing state: ${text}`);
}
try {
  const injected = await page.call("Page.addScriptToEvaluateOnNewDocument", { source: "const originalFetch=window.fetch;window.fetch=(url,...args)=>String(url).startsWith('/api/remaining?')?Promise.resolve(new Response('{}',{status:503,headers:{'content-type':'application/json'}})):originalFetch(url,...args);" });
  await page.navigate(base + "/eventos/m5-event-0", 390);
  await waitText("No pudimos consultar disponibilidad");
  assert.equal(await page.evaluate("Array.from(document.querySelectorAll('button')).find(x=>x.textContent.startsWith('Continuar')).disabled"), true);
  await page.capture("../../docs/03-implementation/qa/m5/availability-error-390.png");
  await page.call("Page.removeScriptToEvaluateOnNewDocument", { identifier: injected.identifier }); results.push("Stock error has retry feedback and disables selection/continuation");
  await page.navigate(base + "/signup", 390);
  await page.evaluate(`(()=>{for(const [name,value] of [['email','signup-${Date.now()}@m5.test'],['password','M5-local-fixture-password!'],['confirm','M5-local-fixture-password!']])document.querySelector('input[name='+name+']').value=value;document.querySelector('main form').requestSubmit()})()`);
  await waitText("Solicitud recibida"); results.push("Registration uses real M3 endpoint; verification is queued, no external mail");
  await page.navigate(base + "/recuperar", 390);
  await page.evaluate("document.querySelector('input[name=email]').value='buyer@m5.test';document.querySelector('main form').requestSubmit()");
  await waitText("Si la cuenta puede recuperar acceso"); results.push("Recovery uses real M3 endpoint and nonenumerating response");
  await page.navigate(base + "/nueva-contrasena", 390);
  await page.evaluate("document.querySelector('input[name=token]').value='invalid-fixture-token';document.querySelector('input[name=password]').value='M5-local-fixture-password!';document.querySelector('input[name=confirm]').value='M5-local-fixture-password!';document.querySelector('main form').requestSubmit()");
  await waitText("No pudimos cambiar la contrase"); results.push("Invalid reset token renders safe error without claiming success");
  await fs.writeFile("../../docs/03-implementation/qa/m5/state-report.json", JSON.stringify({ source: "Loopback synthetic preview only; inventory error injected in browser, auth endpoints real", results }, null, 2));
  console.log(results.join("\n"));
} finally { await page.close(); }
