import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Uses installed Chromium and Node's built-in WebSocket, no browser dependency.
export async function createBrowser() {
  const profile = await mkdtemp(`${tmpdir()}/report-cdp-`);
  const chrome = spawn("/repl/tools/bin/chromium", [
    "--headless", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=9224",
    `--user-data-dir=${profile}`, "--window-size=1440,1100", "about:blank",
  ], { stdio: "ignore" });
  let pages;
  for (let i = 0; i < 80; i++) {
    try { pages = await (await fetch("http://127.0.0.1:9224/json")).json(); if (pages.some(p => p.type === "page")) break; } catch {}
    await pause(100);
  }
  const ws = new WebSocket(pages.find(p => p.type === "page").webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener("open", resolve, { once: true }));
  let serial = 0;
  const pending = new Map(), errors = [];
  ws.addEventListener("message", event => {
    const r = JSON.parse(event.data), item = pending.get(r.id);
    if (item) { pending.delete(r.id); r.error ? item.reject(new Error(r.error.message)) : item.resolve(r.result); }
    if (r.method === "Runtime.exceptionThrown") errors.push(r.params.exceptionDetails.text);
  });
  function command(method, params = {}) {
    const id = ++serial;
    return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  }
  async function evaluate(expression) {
    const r = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  async function until(expression, label) {
    for (let i = 0; i < 120; i++) {
      try { if (await evaluate(expression)) return; } catch {}
      await pause(100);
    }
    throw new Error(`Timed out: ${label}`);
  }
  async function click(expression) {
    const point = await evaluate(`(() => { const e=${expression}; if(!e) throw new Error("Missing element"); e.scrollIntoView({block:"center"}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await command("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
    await pause(200);
  }
  async function type(selector, value) {
    await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,${JSON.stringify(String(value))}); e.dispatchEvent(new Event("input",{bubbles:true})); e.dispatchEvent(new Event("change",{bubbles:true})); })()`);
  }
  async function screenshot(path) {
    const r = await command("Page.captureScreenshot", { format: "png" });
    await writeFile(path, Buffer.from(r.data, "base64"));
  }
  await command("Page.enable"); await command("Runtime.enable");
  return { command, evaluate, until, click, type, screenshot, errors, async close() {
    ws.close(); chrome.kill("SIGTERM"); await pause(300); await rm(profile, { recursive: true, force: true });
  } };
}
export const el = selector => `document.querySelector(${JSON.stringify(selector)})`;
export const testId = id => el(`[data-testid="${id}"]`);
