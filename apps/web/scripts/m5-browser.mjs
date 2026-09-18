import fs from "node:fs/promises";
import path from "node:path";
// Local CDP only. Chrome must use an isolated profile and loopback debugging port.
export async function browserPage() {
  const target = await (await fetch("http://127.0.0.1:9335/json/new?about:blank", { method: "PUT" })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0; const pending = new Map();
  socket.onmessage = event => { const message = JSON.parse(event.data); if (message.id) { const p = pending.get(message.id); pending.delete(message.id); if (message.error) p?.reject(new Error(JSON.stringify(message.error))); else p?.resolve(message.result); } };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  await call("Page.enable"); await call("Runtime.enable");
  const evaluate = async expression => { const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  return {
    call, evaluate,
    async navigate(url, width = 1440) {
      if (!/^(http:\/\/(127\.0\.0\.1|localhost):3005\/|file:\/\/\/C:\/Users\/dell\/OneDrive\/Escritorio\/tiketera\/\.local\/m5-design\/)/.test(url)) throw new Error("Only local M5 pages permitted");
      await call("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
      await call("Page.navigate", { url });
      for (let i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 250)); if (await evaluate("document.readyState==='complete' && !!document.querySelector('h1,[data-screen-label]') && !document.querySelector('nextjs-portal')?.shadowRoot?.querySelector('[data-nextjs-dialog]')")) break; }
      await evaluate("document.fonts.ready.then(()=>Promise.all(Array.from(document.images).map(i=>{i.loading='eager';return i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r;setTimeout(r,4000)})})))");
      await new Promise(r => setTimeout(r, 400));
    },
    async capture(filename) { const result = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, Buffer.from(result.data, "base64")); },
    async close() { socket.close(); await fetch(`http://127.0.0.1:9335/json/close/${target.id}`); },
  };
}
