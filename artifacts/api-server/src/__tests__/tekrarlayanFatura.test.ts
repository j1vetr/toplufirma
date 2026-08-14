/**
 * Tekrarlayan fatura üretimi entegrasyon testleri:
 * - elle üretim taslak fatura oluşturur, kalemleri kopyalar, takvimi ilerletir
 * - aynı tanım + dönem için ikinci üretim reddedilir (mükerrer koruması)
 * - eşzamanlı iki üretim isteğinden yalnızca biri fatura oluşturur
 * - pasif tanımdan üretim API tarafında reddedilir
 * - otomatik üretici vadesi gelmiş tanım için üretir; dönem zaten
 *   faturalanmışsa üretmez ve takvimi ilerleterek günlük yeniden denemeyi keser
 *
 * Geliştirme veritabanına karşı çalışır (DATABASE_URL); kendi oluşturduğu
 * tüm kayıtları test sonunda siler.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { eq, and, inArray } from "drizzle-orm";
import { db, kullanicilar, firmalar, faturalar, faturaKalemleri, tekrarlayanFaturalar, teklifler, teklifKalemleri, faturaSerileri } from "@workspace/db";
import app from "../app";
import { JWT_SECRET, type TokenPayload } from "../middleware/auth";
import { otomatikFaturaUret, tekrarlayandanFaturaUret, TekrarUretimHatasi, donemHesapla, sonrakiAyGunu } from "../lib/otomatikFaturaUret";

const SUFFIX = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let token = "";
let kullaniciId = 0;
let catiId = 0;
let bagliId = 0;
let seriliCatiId = 0; // varsayılan fatura serisi olan çatı firma
let seriliBagliId = 0;

const bugun = new Date().toISOString().split("T")[0];
const buAyBasi = `${bugun.slice(0, 7)}-01`; // her zaman bugün veya geçmiş
const buDonem = donemHesapla(buAyBasi);

async function tanimOlustur(ekstra: Record<string, unknown> = {}): Promise<number> {
  const resp = await request(app)
    .post("/api/tekrarlayan-faturalar")
    .set("Authorization", `Bearer ${token}`)
    .send({
      catiFirmaId: catiId,
      bagliFirmaId: bagliId,
      aciklama: "Aylık bakım hizmeti",
      birimFiyat: 100,
      kdvOrani: 20,
      paraBirimi: "USD",
      sonrakiTarih: buAyBasi,
      ayinGunu: 1,
      kalemler: [
        { aciklama: "Bakım hizmeti", miktar: 2, birimFiyat: 100, kdvOrani: 20 },
        { aciklama: "Yedek parça", miktar: 1, birimFiyat: 50, kdvOrani: 20 },
      ],
      ...ekstra,
    });
  expect(resp.status).toBe(201);
  return resp.body.id as number;
}

beforeAll(async () => {
  const email = `tekrar-test-${SUFFIX}@test.local`;
  const [u] = await db
    .insert(kullanicilar)
    .values({ ad: "Tekrar Test", email, parola: "x", rol: "yonetici", aktif: true })
    .returning({ id: kullanicilar.id });
  kullaniciId = u.id;
  const payload: TokenPayload = {
    id: u.id, email, ad: "Tekrar Test", rol: "yonetici", sirketler: [], modulIzinleri: null,
  };
  token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });

  const [cati] = await db
    .insert(firmalar)
    .values({ tip: "cati", ad: `Tekrar Test Çatı ${SUFFIX}`, seriOneki: "TST" })
    .returning({ id: firmalar.id });
  catiId = cati.id;
  const [bagli] = await db
    .insert(firmalar)
    .values({ tip: "bagli", ad: `Tekrar Test Bağlı ${SUFFIX}`, ustFirmaId: catiId })
    .returning({ id: firmalar.id });
  bagliId = bagli.id;

  // Varsayılan fatura serisi olan ikinci çatı firma (ana üretim yolu:
  // seriOneki verilen çatı firmalarda varsayılan seri otomatik oluşturulur).
  const [seriliCati] = await db
    .insert(firmalar)
    .values({ tip: "cati", ad: `Tekrar Test Serili ${SUFFIX}`, seriOneki: "TSF" })
    .returning({ id: firmalar.id });
  seriliCatiId = seriliCati.id;
  await db.insert(faturaSerileri).values({
    catiFirmaId: seriliCatiId, ad: "Varsayılan", onek: "TSF", sonrakiNo: 1, varsayilan: true,
  });
  const [seriliBagli] = await db
    .insert(firmalar)
    .values({ tip: "bagli", ad: `Tekrar Test Serili Bağlı ${SUFFIX}`, ustFirmaId: seriliCatiId })
    .returning({ id: firmalar.id });
  seriliBagliId = seriliBagli.id;
});

afterAll(async () => {
  // Sıra önemli: faturalar (kalemler cascade) -> tanımlar/teklifler/seriler -> firmalar -> kullanıcı
  const catiIds = [catiId, seriliCatiId];
  await db.delete(faturalar).where(inArray(faturalar.catiFirmaId, catiIds));
  await db.delete(tekrarlayanFaturalar).where(inArray(tekrarlayanFaturalar.catiFirmaId, catiIds));
  await db.delete(teklifler).where(inArray(teklifler.catiFirmaId, catiIds));
  await db.delete(faturaSerileri).where(inArray(faturaSerileri.catiFirmaId, catiIds));
  await db.delete(firmalar).where(inArray(firmalar.id, [bagliId, seriliBagliId, catiId, seriliCatiId]));
  await db.delete(kullanicilar).where(eq(kullanicilar.id, kullaniciId));
});

describe("Tekrarlayan fatura üretimi", () => {
  it("elle üretim: taslak fatura, kopyalanan kalemler, dönem takibi, takvim ilerler", async () => {
    const tanimId = await tanimOlustur();

    const uret = await request(app)
      .post(`/api/tekrarlayan-faturalar/${tanimId}/uret`)
      .set("Authorization", `Bearer ${token}`);
    expect(uret.status).toBe(201);
    expect(uret.body.durum).toBe("taslak");
    // 2*100*1.2 + 1*50*1.2 = 300
    expect(uret.body.genelToplam).toBe(300);
    expect(uret.body.faturaNo.startsWith("TST")).toBe(true);

    const [fatura] = await db.select().from(faturalar).where(eq(faturalar.id, uret.body.id));
    expect(fatura.tekrarlayanFaturaId).toBe(tanimId);
    expect(fatura.tekrarDonemi).toBe(buDonem);

    const kalemler = await db.select().from(faturaKalemleri).where(eq(faturaKalemleri.faturaId, fatura.id));
    expect(kalemler.length).toBe(2);

    const [tanim] = await db.select().from(tekrarlayanFaturalar).where(eq(tekrarlayanFaturalar.id, tanimId));
    expect(tanim.sonrakiTarih).toBe(sonrakiAyGunu(buAyBasi, 1));
  });

  it("aynı dönem için ikinci üretim 409 ile reddedilir, takvim bozulmaz", async () => {
    const tanimId = await tanimOlustur();
    const ilk = await request(app)
      .post(`/api/tekrarlayan-faturalar/${tanimId}/uret`)
      .set("Authorization", `Bearer ${token}`);
    expect(ilk.status).toBe(201);

    // Takvimi elle geri alsak bile (örn. kullanıcı tanımı düzenledi)
    // aynı dönem için ikinci fatura üretilmemeli.
    await db.update(tekrarlayanFaturalar).set({ sonrakiTarih: buAyBasi }).where(eq(tekrarlayanFaturalar.id, tanimId));

    const ikinci = await request(app)
      .post(`/api/tekrarlayan-faturalar/${tanimId}/uret`)
      .set("Authorization", `Bearer ${token}`);
    expect(ikinci.status).toBe(409);
    expect(String(ikinci.body.error)).toContain(buDonem);

    const donemFaturalari = await db
      .select()
      .from(faturalar)
      .where(and(eq(faturalar.tekrarlayanFaturaId, tanimId), eq(faturalar.tekrarDonemi, buDonem)));
    expect(donemFaturalari.length).toBe(1);

    // Reddedilen deneme takvimi ilerletmemeli.
    const [tanim] = await db.select().from(tekrarlayanFaturalar).where(eq(tekrarlayanFaturalar.id, tanimId));
    expect(tanim.sonrakiTarih).toBe(buAyBasi);
  });

  it("aynı dönem için eşzamanlı iki üretimden yalnızca biri fatura oluşturur", async () => {
    const tanimId = await tanimOlustur();

    // Aynı beklenen dönemle iki üretim yarışır (elle + otomatik çakışması senaryosu).
    const sonuclar = await Promise.allSettled([
      tekrarlayandanFaturaUret(tanimId, buDonem),
      tekrarlayandanFaturaUret(tanimId, buDonem),
    ]);

    const basarili = sonuclar.filter(s => s.status === "fulfilled");
    const reddedilen = sonuclar.filter(s => s.status === "rejected") as PromiseRejectedResult[];
    expect(basarili.length).toBe(1);
    expect(reddedilen.length).toBe(1);
    expect(reddedilen[0].reason).toBeInstanceOf(TekrarUretimHatasi);
    expect((reddedilen[0].reason as TekrarUretimHatasi).kod).toBe("donem_mevcut");

    const donemFaturalari = await db
      .select()
      .from(faturalar)
      .where(and(eq(faturalar.tekrarlayanFaturaId, tanimId), eq(faturalar.tekrarDonemi, buDonem)));
    expect(donemFaturalari.length).toBe(1);

    // Takvim yalnızca bir kez ilerlemiş olmalı.
    const [tanim] = await db.select().from(tekrarlayanFaturalar).where(eq(tekrarlayanFaturalar.id, tanimId));
    expect(tanim.sonrakiTarih).toBe(sonrakiAyGunu(buAyBasi, 1));
  });

  it("pasif tanımdan elle üretim 400 ile reddedilir", async () => {
    const tanimId = await tanimOlustur({ aktif: false });

    const uret = await request(app)
      .post(`/api/tekrarlayan-faturalar/${tanimId}/uret`)
      .set("Authorization", `Bearer ${token}`);
    expect(uret.status).toBe(400);
    expect(String(uret.body.error)).toContain("Pasif");

    const uretilen = await db.select().from(faturalar).where(eq(faturalar.tekrarlayanFaturaId, tanimId));
    expect(uretilen.length).toBe(0);
  });

  it("otomatik üretici: vadesi gelen tanım için üretir, faturalanmış dönemi atlar", async () => {
    const tanimId = await tanimOlustur();

    await otomatikFaturaUret();

    const uretilen = await db
      .select()
      .from(faturalar)
      .where(and(eq(faturalar.tekrarlayanFaturaId, tanimId), eq(faturalar.tekrarDonemi, buDonem)));
    expect(uretilen.length).toBe(1);
    expect(uretilen[0].durum).toBe("taslak");

    let [tanim] = await db.select().from(tekrarlayanFaturalar).where(eq(tekrarlayanFaturalar.id, tanimId));
    expect(tanim.sonrakiTarih).toBe(sonrakiAyGunu(buAyBasi, 1));

    // Takvim faturalanmış döneme geri alınırsa: yeni fatura ÜRETME,
    // ama takvimi ilerlet ki her gün yeniden denenmesin.
    await db.update(tekrarlayanFaturalar).set({ sonrakiTarih: buAyBasi }).where(eq(tekrarlayanFaturalar.id, tanimId));
    await otomatikFaturaUret();

    const tekrar = await db
      .select()
      .from(faturalar)
      .where(and(eq(faturalar.tekrarlayanFaturaId, tanimId), eq(faturalar.tekrarDonemi, buDonem)));
    expect(tekrar.length).toBe(1);

    [tanim] = await db.select().from(tekrarlayanFaturalar).where(eq(tekrarlayanFaturalar.id, tanimId));
    expect(tanim.sonrakiTarih).toBe(sonrakiAyGunu(buAyBasi, 1));
  });

  it("eşzamanlı normal + tekrarlayan fatura üretimi çakışan numara vermez", async () => {
    const tanimId = await tanimOlustur();

    const normalBody = {
      catiFirmaId: catiId,
      bagliFirmaId: bagliId,
      faturaTarihi: buAyBasi,
      vadeTarihi: buAyBasi,
      paraBirimi: "USD",
      kalemler: [{ aciklama: "Normal hizmet", miktar: 1, birimFiyat: 75, kdvOrani: 20 }],
    };

    const [normal, tekrar] = await Promise.all([
      request(app).post("/api/faturalar").set("Authorization", `Bearer ${token}`).send(normalBody),
      request(app).post(`/api/tekrarlayan-faturalar/${tanimId}/uret`).set("Authorization", `Bearer ${token}`),
    ]);
    expect(normal.status).toBe(201);
    expect(tekrar.status).toBe(201);
    expect(normal.body.faturaNo).not.toBe(tekrar.body.faturaNo);

    // Firmanın tüm faturaları arasında numara tekrarı olmamalı.
    const hepsi = await db.select({ no: faturalar.faturaNo }).from(faturalar).where(eq(faturalar.catiFirmaId, catiId));
    const nolar = hepsi.map(f => f.no);
    expect(new Set(nolar).size).toBe(nolar.length);
  });

  it("eşzamanlı teklif dönüştürme + tekrarlayan üretim çakışan numara vermez", async () => {
    const tanimId = await tanimOlustur();

    const [teklif] = await db.insert(teklifler).values({
      catiFirmaId: catiId,
      teklifNo: `TKF-${SUFFIX}`,
      tarih: buAyBasi,
      aliciAd: "Test Alıcı",
      paraBirimi: "USD",
      durum: "onaylandi",
    }).returning({ id: teklifler.id });
    await db.insert(teklifKalemleri).values({
      teklifId: teklif.id, aciklama: "Teklif kalemi", miktar: "1", birimFiyat: "120", kdvOrani: "20",
    });

    const [donustur, tekrar] = await Promise.all([
      request(app)
        .post(`/api/teklifler/${teklif.id}/faturaya-donustur`)
        .set("Authorization", `Bearer ${token}`)
        .send({ bagliFirmaId: bagliId }),
      request(app).post(`/api/tekrarlayan-faturalar/${tanimId}/uret`).set("Authorization", `Bearer ${token}`),
    ]);
    expect(donustur.status).toBe(201);
    expect(tekrar.status).toBe(201);
    expect(donustur.body.faturaNo).not.toBe(tekrar.body.faturaNo);

    const hepsi = await db.select({ no: faturalar.faturaNo }).from(faturalar).where(eq(faturalar.catiFirmaId, catiId));
    const nolar = hepsi.map(f => f.no);
    expect(new Set(nolar).size).toBe(nolar.length);
  });

  it("varsayılan serili firmada paralel normal + tekrarlayan üretim seri sayacını paylaşır", async () => {
    const tanimId = await tanimOlustur({ catiFirmaId: seriliCatiId, bagliFirmaId: seriliBagliId });

    const normalBody = {
      catiFirmaId: seriliCatiId,
      bagliFirmaId: seriliBagliId,
      faturaTarihi: buAyBasi,
      vadeTarihi: buAyBasi,
      paraBirimi: "USD",
      kalemler: [{ aciklama: "Serili normal hizmet", miktar: 1, birimFiyat: 80, kdvOrani: 20 }],
    };

    const [normal, tekrar] = await Promise.all([
      request(app).post("/api/faturalar").set("Authorization", `Bearer ${token}`).send(normalBody),
      request(app).post(`/api/tekrarlayan-faturalar/${tanimId}/uret`).set("Authorization", `Bearer ${token}`),
    ]);
    expect(normal.status).toBe(201);
    expect(tekrar.status).toBe(201);
    expect(normal.body.faturaNo).not.toBe(tekrar.body.faturaNo);
    expect(normal.body.faturaNo.startsWith("TSF")).toBe(true);
    expect(tekrar.body.faturaNo.startsWith("TSF")).toBe(true);
  });

  it("varsayılan serili firmada paralel teklif dönüştürme + tekrarlayan üretim çakışmaz", async () => {
    const tanimId = await tanimOlustur({ catiFirmaId: seriliCatiId, bagliFirmaId: seriliBagliId });

    const [teklif] = await db.insert(teklifler).values({
      catiFirmaId: seriliCatiId,
      teklifNo: `TKF-S-${SUFFIX}`,
      tarih: buAyBasi,
      aliciAd: "Serili Test Alıcı",
      paraBirimi: "USD",
      durum: "onaylandi",
    }).returning({ id: teklifler.id });
    await db.insert(teklifKalemleri).values({
      teklifId: teklif.id, aciklama: "Serili teklif kalemi", miktar: "1", birimFiyat: "90", kdvOrani: "20",
    });

    const [donustur, tekrar] = await Promise.all([
      request(app)
        .post(`/api/teklifler/${teklif.id}/faturaya-donustur`)
        .set("Authorization", `Bearer ${token}`)
        .send({ bagliFirmaId: seriliBagliId }),
      request(app).post(`/api/tekrarlayan-faturalar/${tanimId}/uret`).set("Authorization", `Bearer ${token}`),
    ]);
    expect(donustur.status).toBe(201);
    expect(tekrar.status).toBe(201);
    expect(donustur.body.faturaNo).not.toBe(tekrar.body.faturaNo);

    // Serili firmanın tüm faturaları benzersiz numara taşımalı ve seri sayacı
    // üretilen fatura sayısı kadar ilerlemiş olmalı.
    const hepsi = await db.select({ no: faturalar.faturaNo }).from(faturalar).where(eq(faturalar.catiFirmaId, seriliCatiId));
    const nolar = hepsi.map(f => f.no);
    expect(new Set(nolar).size).toBe(nolar.length);
    const [seri] = await db.select().from(faturaSerileri).where(eq(faturaSerileri.catiFirmaId, seriliCatiId));
    expect(seri.sonrakiNo).toBe(nolar.length + 1);
  });

  it("üretilen taslak onaylanabilir (durum acik yapılınca alacak olur)", async () => {
    const tanimId = await tanimOlustur();
    const uret = await request(app)
      .post(`/api/tekrarlayan-faturalar/${tanimId}/uret`)
      .set("Authorization", `Bearer ${token}`);
    expect(uret.status).toBe(201);

    const onay = await request(app)
      .patch(`/api/faturalar/${uret.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ durum: "acik" });
    expect(onay.status).toBe(200);

    const [fatura] = await db.select().from(faturalar).where(eq(faturalar.id, uret.body.id));
    expect(fatura.durum).toBe("acik");
  });
});
