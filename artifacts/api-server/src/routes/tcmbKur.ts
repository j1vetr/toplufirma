import { Router } from "express";

const router = Router();

async function tcmbKurCek(): Promise<{ kurlar: Record<string, number>; tarih: string }> {
  const res = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml", {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`TCMB HTTP ${res.status}`);
  const xml = await res.text();

  const tarihMatch = xml.match(/Tarih="(\d{2})\/(\d{2})\/(\d{4})"/);
  const tarih = tarihMatch
    ? `${tarihMatch[1]}.${tarihMatch[2]}.${tarihMatch[3]}`
    : new Date().toLocaleDateString("tr-TR");

  const hedefler = ["USD", "EUR", "GBP"];
  const kurlar: Record<string, number> = {};

  for (const kod of hedefler) {
    const blokRx = new RegExp(
      `<Currency[^>]*CurrencyCode="${kod}"[^>]*>([\\s\\S]*?)<\\/Currency>`,
    );
    const blok = xml.match(blokRx);
    if (!blok) continue;
    const satisRx = /<ForexSelling>([\d.]+)<\/ForexSelling>/;
    const satisMatch = blok[1].match(satisRx);
    if (satisMatch) kurlar[kod] = parseFloat(satisMatch[1]);
  }

  return { kurlar, tarih };
}

router.get("/tcmb-kur", async (_req, res) => {
  try {
    const { kurlar, tarih } = await tcmbKurCek();
    res.json({ kurlar, tarih });
  } catch {
    res.status(503).json({ error: "TCMB verisi alınamadı" });
  }
});

export default router;
