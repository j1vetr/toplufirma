import assert from "node:assert/strict";
import { readFile, readdir, mkdir, rm } from "node:fs/promises";
import { createBrowser, el, testId, pause } from "./browser-cdp.mjs";
const f = JSON.parse(await readFile("/tmp/cari-odeme-browser-fixture.json", "utf8"));
const browser = await createBrowser();
const { command, evaluate, until, click, type, screenshot } = browser;
const metric = (id, amount, pb = "USD") => until(
  `${testId(id)}?.textContent.includes(${JSON.stringify(`${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} ${pb}`)})`,
  `${id}: ${amount} ${pb}`,
);
const option = text => `Array.from(document.querySelectorAll('[role="option"]')).find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
const downloadDir = "/tmp/rapor-browser-downloads";
try {
  await command("Page.navigate", { url: "http://localhost:80/" });
  await until(`!!${el('input[type="password"]')}`, "login");
  await type('input[type="email"]', f.email);
  await type('input[type="password"]', f.parola);
  await click(`Array.from(document.querySelectorAll("button")).find(b=>b.textContent.toLocaleLowerCase("tr-TR").includes("giriş yap"))`);
  await until(`!!localStorage.getItem("panel_token")`, "normal login");
  await evaluate(`localStorage.setItem("aktifSirketId",${JSON.stringify(String(f.catiId))})`);
  await command("Page.navigate", { url: "http://localhost:80/raporlar" });
  await metric("text-toplam-fatura", 21800);
  if (!process.argv.includes("--filters")) {
  await metric("text-faturaya-sayilan", 13360);
  await metric("text-kalan-alacak", 8440);
  await metric("text-nakit-tahsilat", 13360);
  await metric("text-nakit-odeme", 450);
  assert.equal(await evaluate(`document.querySelectorAll('[data-testid^="row-ay-"]').length`), 12);
  assert.equal(await evaluate(`document.querySelectorAll('[data-testid^="row-fatura-"]').length`), 12);
  assert.equal(await evaluate(`document.querySelectorAll('[role="img"] svg').length >= 2`), true);
  await screenshot("/tmp/rapor-desktop.png");
  console.log("PASS: annual invoice totals, allocation, cash, 12 monthly rows/charts and excluded draft/cancel.");
  }

  await click(testId("select-rapor-ay")); await click(option("Şubat"));
  await metric("text-toplam-fatura", 1500);
  await metric("text-nakit-tahsilat", 585);
  assert.equal(await evaluate(`document.querySelectorAll('[data-testid^="row-ay-"]').length`), 1);
  await click(testId("button-pb-EUR"));
  await metric("text-toplam-fatura", 0, "EUR");
  await click(testId("select-rapor-ay")); await click(option("Tüm yıl"));
  await metric("text-toplam-fatura", 2000, "EUR");
  await metric("text-nakit-tahsilat", 0, "EUR");
  console.log("PASS: month/currency filters, empty month, correct cash dates.");
  await click(testId("button-pb-USD")); await metric("text-toplam-fatura", 21800);

  for (const [tab, row] of [
    ["musteri", `row-musteri-${f.bagliId}`], ["gemi", `row-gemi-${f.gemiId}`],
    ["yaslandirma", `row-yas-fatura-${f.faturaIds[1]}`], ["kdv", `row-kdv-${f.catiId}`],
  ]) {
    await click(testId(`tab-${tab}`));
    await until(`!!${testId(row)}`, `${tab} report populated`);
  }
  console.log("PASS: customer, ship, aging and VAT sections.");
  await click(testId("tab-genel"));
  await mkdir(downloadDir, { recursive: true });
  await command("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
  await click(testId("button-csv-aylik"));
  let files = [];
  for (let i = 0; i < 50; i++) {
    files = (await readdir(downloadDir)).filter(s => s.endsWith(".csv"));
    if (files.length) break;
    await pause(100);
  }
  assert.equal(files.length, 1);
  const csv = await readFile(`${downloadDir}/${files[0]}`, "utf8");
  assert.ok(csv.startsWith("\uFEFF")); assert.ok(csv.includes("Nakit tahsilat (USD)"));
  assert.equal(csv.split("\r\n").length, 13);
  console.log("PASS: real CSV download, currency headers, BOM and 12 monthly data rows.");

  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate("window.scrollTo(0,0)"); await pause(300);
  const width = await evaluate("({content:document.documentElement.scrollWidth, viewport:window.innerWidth})");
  assert.ok(width.content <= width.viewport + 1, `mobile overflow: ${JSON.stringify(width)}`);
  await screenshot("/tmp/rapor-mobile.png");
  await click(testId("tab-kdv")); await until(`!!${testId(`row-kdv-${f.catiId}`)}`, "mobile VAT tab");
  assert.equal(browser.errors.length, 0);
  console.log("PASS: 390px mobile layout, tab interaction, no uncaught browser errors.");
} catch (error) {
  await screenshot("/tmp/rapor-browser-error.png");
  console.error((await evaluate("document.body.innerText")).slice(-7000));
  throw error;
} finally {
  await browser.close();
  await rm(downloadDir, { recursive: true, force: true });
}
