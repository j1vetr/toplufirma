// Native Chromium/CDP smoke test. Requires the isolated db fixture script first.
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const fixture = JSON.parse(await readFile("/tmp/cari-odeme-browser-fixture.json", "utf8"));
const profile = await mkdtemp(`${tmpdir()}/cari-odeme-chrome-`);
const chrome = spawn("/repl/tools/bin/chromium", [
  "--headless", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=9223",
  `--user-data-dir=${profile}`, "--window-size=1280,900", "about:blank",
], { stdio: "ignore" });
const pause = ms => new Promise(r => setTimeout(r, ms));
let ws, serial = 0;
const pending = new Map();
async function command(method, params = {}) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ": " + result.exceptionDetails.exception?.description);
  return result.result.value;
}
async function until(expression, label) {
  for (let i = 0; i < 100; i++) {
    try { if (await evaluate(expression)) return; } catch {}
    await pause(150);
  }
  throw new Error(`Timed out: ${label}`);
}
async function click(expression) {
  const point = await evaluate(`(() => { const e = ${expression}; if (!e) throw new Error("Missing element"); e.scrollIntoView({block:"center"}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await command("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
  await command("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
  await pause(200);
}
const button = text => `Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
const selector = s => `document.querySelector(${JSON.stringify(s)})`;
async function type(s, value) {
  await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(s)}); if(!e) throw new Error("Missing input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,${JSON.stringify(String(value))}); e.dispatchEvent(new Event("input",{bubbles:true})); e.dispatchEvent(new Event("change",{bubbles:true})); })()`);
  await pause(200);
}
async function navigate(path, ready) {
  await command("Page.navigate", { url: `http://localhost:80${path}` });
  await until(ready, path);
}
async function api(path) {
  return evaluate(`fetch(${JSON.stringify(path)}, {headers:{Authorization:"Bearer "+localStorage.getItem("panel_token")}}).then(async r=>{if(!r.ok) throw new Error("API "+r.status); return r.json();})`);
}
async function chooseInvoice() {
  await until(`!!document.querySelector('[data-testid="select-cari-odeme-fatura"]')`, "invoice chooser");
  await click(selector('[data-testid="select-cari-odeme-fatura"]'));
  await click(`Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes(${JSON.stringify(fixture.faturaNos[1])}))`);
  await until(`document.body.innerText.includes(${JSON.stringify(`Ödeme Kaydet - ${fixture.faturaNos[1]}`)})`, "shared payment dialog");
  await until(`document.querySelectorAll('[role="dialog"][data-state="open"]').length === 1`, "one active payment dialog");
}
try {
  let pages;
  for (let i = 0; i < 80; i++) {
    try { pages = await (await fetch("http://127.0.0.1:9223/json")).json(); if (pages.some(p => p.type === "page")) break; } catch {}
    await pause(100);
  }
  ws = new WebSocket(pages.find(p => p.type === "page").webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener("open", r, { once: true }));
  ws.addEventListener("message", event => {
    const message = JSON.parse(event.data), item = pending.get(message.id);
    if (item) { pending.delete(message.id); message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result); }
  });
  await command("Page.enable");
  await navigate("/", `!!document.querySelector('input[type="password"]')`);
  await type('input[type="email"]', fixture.email);
  await type('input[type="password"]', fixture.parola);
  await click(`Array.from(document.querySelectorAll("button")).find(b=>b.textContent.toLocaleLowerCase("tr-TR").includes("giriş yap"))`);
  await until(`!!localStorage.getItem("panel_token")`, "normal password login");
  await evaluate(`localStorage.setItem("aktifSirketId",${JSON.stringify(String(fixture.catiId))})`);
  if (process.argv.includes("--batch")) {
    async function selectMultiple() {
      await click(selector('[data-testid="button-coklu-fatura-sec"]'));
      for (const no of fixture.faturaNos) {
        await click(selector(`[role="checkbox"][aria-label="${no} seç"]`));
      }
      await click(selector('[data-testid="button-toplu-odeme-ac"]'));
      await until(`!!document.querySelector('[data-testid="toplu-odeme-modal"]')`, "batch allocation dialog");
      await until(`document.querySelectorAll('[role="dialog"][data-state="open"]').length === 1`, "one active batch dialog");
      await type(`#dagitim-${fixture.faturaIds[1]}`, 250);
      await until(`document.querySelector('[data-testid="toplu-dagitim-toplami"]').textContent.includes("750,00 USD")`, "one total of 750");
    }
    async function verifyBatch() {
      const a = await api(`/api/faturalar/${fixture.faturaIds[0]}`);
      const b = await api(`/api/faturalar/${fixture.faturaIds[1]}`);
      assert.equal(a.durum, "odendi");
      assert.equal(a.kalanTutar, 0);
      assert.equal(b.durum, "kismi_odendi");
      assert.equal(b.kalanTutar, 250);
      const payments = await api(`/api/odemeler?catiFirmaId=${fixture.catiId}`);
      assert.equal(payments.length, 1);
      assert.equal(payments[0].tutar, 750);
      assert.equal(payments[0].faturaEslesmeleri.length, 2);
      const group = await api(`/api/cariler/grup/${fixture.grupId}?catiFirmaId=${fixture.catiId}`);
      assert.equal(group.ozet.bakiye, 250);
      return payments[0].id;
    }
    await navigate(`/cariler/${fixture.bagliId}`, `!!${button("Ödeme Kaydet")}`);
    await click(button("Ödeme Kaydet"));
    await selectMultiple();
    await click(selector('[data-testid="select-toplu-kaynak"]'));
    await click(`Array.from(document.querySelectorAll('[role="option"]')).find(e=>e.textContent.trim()==="Tahsilattan Ödendi")`);
    await until(`!!document.querySelector('[data-testid="select-toplu-tahsilat"]')`, "existing receipt selector");
    assert.equal(await evaluate(`document.querySelector('[data-testid="button-toplu-dagitim-kaydet"]').disabled`), true);
    await click(selector('[data-testid="select-toplu-tahsilat"]'));
    await click(`Array.from(document.querySelectorAll('[role="option"]')).find(e=>e.textContent.includes("#${fixture.receiptId} -"))`);
    await type(`#dagitim-${fixture.faturaIds[1]}`, 251);
    assert.equal(await evaluate(`document.querySelector('[data-testid="button-toplu-dagitim-kaydet"]').disabled`), true);
    await type(`#dagitim-${fixture.faturaIds[1]}`, 250);
    await until(`!document.querySelector('[data-testid="button-toplu-dagitim-kaydet"]').disabled`, "existing receipt allocation enabled");
    await click(selector('[data-testid="button-toplu-dagitim-kaydet"]'));
    await until(`!document.querySelector('[role="dialog"]')`, "existing receipt batch saved");
    const receiptId = await verifyBatch();
    assert.equal(receiptId, fixture.receiptId);
    console.log("PASS: cari multi-select -> existing single receipt -> 500 + 250, one movement and 250 debt.");

    // Remove only this isolated test receipt. This reopens its invoices for the new-money flow.
    await evaluate(`fetch("/api/odemeler/${receiptId}", {method:"DELETE", headers:{Authorization:"Bearer "+localStorage.getItem("panel_token")}}).then(r=>{if(r.status!==204) throw new Error("Fixture reset failed")})`);
    await navigate(`/cariler/grup/${fixture.grupId}`, `!!${button("Ödeme")}`);
    await click(button("Ödeme"));
    await selectMultiple();
    await until(`!document.querySelector('[data-testid="button-toplu-dagitim-kaydet"]').disabled`, "new receipt allocation enabled");
    await click(selector('[data-testid="button-toplu-dagitim-kaydet"]'));
    await until(`!document.querySelector('[role="dialog"]')`, "new receipt batch saved");
    await verifyBatch();
    await navigate(`/cariler/grup/${fixture.grupId}`, `!!${button("Ödeme")}`);
    await click(button("Ödeme"));
    await chooseInvoice();
    await click(button("İptal"));
    await verifyBatch();
    console.log("PASS: group multi-select -> one new 750 receipt -> full/partial statuses, persists after navigation and cancellation.");
  } else {
  if (!process.argv.includes("--remaining")) {
  await navigate(`/cariler/${fixture.bagliId}`, `!!${button("Ödeme Kaydet")}`);
  await click(button("Ödeme Kaydet"));
  await chooseInvoice();
  await click(selector('[aria-label="Tahsilat işlemleri hakkında bilgi"]'));
  await until(`document.body.innerText.includes("Kısmi Ödeme Nasıl Çalışır?")`, "information popup");
  await click(selector('[aria-label="Bilgilendirmeyi kapat"]'));
  await click(selector('[role="dialog"] button[role="combobox"]'));
  await click(`Array.from(document.querySelectorAll('[role="option"]')).find(e=>e.textContent.trim()==="Tahsilattan Ödendi")`);
  await type('[role="dialog"] input[type="number"]', 200);
  await until(`!!${button("Tahsilattan karşıla")} && !(${button("Tahsilattan karşıla")}).disabled`, "matching submit enabled");
  const shot = await command("Page.captureScreenshot", { format: "png" });
  await writeFile("/tmp/cari-odeme-shared-dialog.png", Buffer.from(shot.data, "base64"));
  await click(button("Tahsilattan karşıla"));
  await until(`!document.querySelector('[role="dialog"]')`, "matching saved");
  const saved = await api(`/api/faturalar/${fixture.faturaIds[1]}`);
  assert.equal(saved.durum, "kismi_odendi");
  assert.equal(saved.odenenTutar, 200);
  assert.equal(saved.kalanTutar, 300);
  const receipt = await api(`/api/odemeler/${fixture.receiptId}`);
  assert.equal(receipt.tutar, 750);
  assert.equal(receipt.kullanilmamisTutar, 550);
  const ledger = await api(`/api/cariler/${fixture.bagliId}?catiFirmaId=${fixture.catiId}`);
  assert.equal(ledger.ozet.toplamBorc, 1000);
  assert.equal(ledger.ozet.toplamAlacak, 750);
  assert.equal(ledger.ozet.bakiye, 250);
  console.log("PASS: subsidiary cari -> shared dialog -> existing receipt partial payment, no duplicate cash.");

  await navigate(`/cariler/grup/${fixture.grupId}`, `!!${button("Ödeme")}`);
  await click(button("Ödeme"));
  await chooseInvoice();
  await click(button("İptal"));
  console.log("PASS: group cari -> same shared dialog, cancellation creates no payment.");
  }

  await navigate("/cariler", `!!document.querySelector('input[placeholder="Müşteri adı ara..."]')`);
  await type('input[placeholder="Müşteri adı ara..."]', fixture.suffix);
  await until(`!!document.querySelector('button[title="Ödeme Kaydet"]')`, "quick cari payment");
  await click(selector('button[title="Ödeme Kaydet"]'));
  await chooseInvoice();
  await click(button("İptal"));
  console.log("PASS: quick cari payment -> same shared dialog.");

  await navigate("/odemeler", `!!document.querySelector('[data-testid="button-odeme-yeni"]')`);
  await click(selector('[data-testid="button-odeme-yeni"]'));
  await click(selector('[data-testid="select-yeni-odeme-cari"]'));
  await until(`Array.from(document.querySelectorAll("button")).some(b=>b.textContent.includes(${JSON.stringify(`${fixture.suffix}-Bagli`)}))`, "customer list");
  await click(`Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes(${JSON.stringify(`${fixture.suffix}-Bagli`)}))`);
  await chooseInvoice();
  await click(button("İptal"));
  console.log("PASS: general payments -> same shared dialog.");

  const after = await api(`/api/odemeler?catiFirmaId=${fixture.catiId}`);
  assert.equal(after.length, 1);
  assert.equal(after[0].tutar, 750);
  console.log("PASS: all four paths preserve exactly one 750 USD cash movement.");
  }
} catch (error) {
  try {
    const shot = await command("Page.captureScreenshot", { format: "png" });
    await writeFile("/tmp/cari-odeme-e2e-error.png", Buffer.from(shot.data, "base64"));
    console.error((await evaluate("document.body.innerText")).slice(-6000));
  } catch {}
  throw error;
} finally {
  ws?.close();
  chrome.kill("SIGTERM");
  await pause(300);
  await rm(profile, { recursive: true, force: true });
}
