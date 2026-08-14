/**
 * "Ödendi" işaretinin geri alınması entegrasyon testleri:
 * - elle işaretlenen fatura için kalan tutar kadar otomatik tahsilat oluşur
 *   (kalıcı `otomatik` işaretiyle), geri alınınca aynı transaction'da silinir
 * - elle girilen tahsilatlar korunur — açıklaması "(otomatik tahsilat)"
 *   metnini içerse bile silinmez (köken açıklamaya değil kolona dayanır)
 * - açıklaması sonradan düzenlenen otomatik tahsilat yine tanınır ve silinir
 * - aynı davranış hem tekil PATCH hem toplu-durum yolunda geçerlidir
 * - kullanıcı API'sinden `otomatik` alanı yazılamaz
 *
 * Geliştirme veritabanına karşı çalışır (DATABASE_URL); kendi oluşturduğu
 * tüm kayıtları test sonunda siler.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { eq, and, inArray } from "drizzle-orm";
import { db, kullanicilar, firmalar, faturalar, odemeler } from "@workspace/db";
import app from "../app";
import { JWT_SECRET, type TokenPayload } from "../middleware/auth";

const SUFFIX = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let token = "";
let kullaniciId = 0;
let catiId = 0;
let bagliId = 0;
let faturaSayac = 0;

const bugun = new Date().toISOString().split("T")[0];

/** 1 x 100 + %20 KDV = 120 USD tutarlı açık fatura oluşturur, id döner. */
async function faturaOlustur(): Promise<number> {
  faturaSayac++;
  const resp = await request(app)
    .post("/api/faturalar")
    .set("Authorization", `Bearer ${token}`)
    .send({
      catiFirmaId: catiId,
      bagliFirmaId: bagliId,
      manuelFaturaNo: `OGT-${SUFFIX}-${faturaSayac}`,
      faturaTarihi: bugun,
      vadeTarihi: bugun,
      paraBirimi: "USD",
      kalemler: [{ aciklama: "Servis", miktar: 1, birimFiyat: 100, kdvOrani: 20 }],
    });
  expect(resp.status).toBe(201);
  return resp.body.id as number;
}

async function tahsilatEkle(faturaId: number, tutar: number, aciklama: string, ekstra: Record<string, unknown> = {}): Promise<number> {
  const resp = await request(app)
    .post("/api/odemeler")
    .set("Authorization", `Bearer ${token}`)
    .send({
      catiFirmaId: catiId, bagliFirmaId: bagliId, faturaId,
      tip: "tahsilat", tarih: bugun, tutar, paraBirimi: "USD", aciklama,
      ...ekstra,
    });
  expect(resp.status).toBe(201);
  return resp.body.id as number;
}

async function faturaOdemeleri(faturaId: number) {
  return db.select().from(odemeler).where(eq(odemeler.faturaId, faturaId));
}

async function durumDegistir(faturaId: number, durum: string) {
  const resp = await request(app)
    .patch(`/api/faturalar/${faturaId}`)
    .set("Authorization", `Bearer ${token}`)
    .send({ durum });
  expect(resp.status).toBe(200);
  return resp;
}

beforeAll(async () => {
  const email = `odendi-geri-al-${SUFFIX}@test.local`;
  const [u] = await db
    .insert(kullanicilar)
    .values({ ad: "Ödendi Test", email, parola: "x", rol: "yonetici", aktif: true })
    .returning({ id: kullanicilar.id });
  kullaniciId = u.id;
  const payload: TokenPayload = {
    id: u.id, email, ad: "Ödendi Test", rol: "yonetici", sirketler: [], modulIzinleri: null,
  };
  token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });

  const [cati] = await db
    .insert(firmalar)
    .values({ tip: "cati", ad: `Ödendi Test Çatı ${SUFFIX}`, seriOneki: "OGT" })
    .returning({ id: firmalar.id });
  catiId = cati.id;
  const [bagli] = await db
    .insert(firmalar)
    .values({ tip: "bagli", ad: `Ödendi Test Bağlı ${SUFFIX}`, ustFirmaId: catiId })
    .returning({ id: firmalar.id });
  bagliId = bagli.id;
});

afterAll(async () => {
  await db.delete(odemeler).where(eq(odemeler.catiFirmaId, catiId));
  await db.delete(faturalar).where(eq(faturalar.catiFirmaId, catiId));
  await db.delete(firmalar).where(inArray(firmalar.id, [bagliId, catiId]));
  await db.delete(kullanicilar).where(eq(kullanicilar.id, kullaniciId));
});

describe("Ödendi işaretinin geri alınması (tekil PATCH)", () => {
  it("ödendi işaretle: kalan tutar kadar otomatik tahsilat oluşur; geri al: yalnızca o silinir", async () => {
    const faturaId = await faturaOlustur();
    const manuelId = await tahsilatEkle(faturaId, 20, "Elle girilen kısmi tahsilat");

    await durumDegistir(faturaId, "odendi");

    let ods = await faturaOdemeleri(faturaId);
    const oto = ods.find(o => o.otomatik);
    expect(oto).toBeDefined();
    expect(Number(oto!.tutar)).toBe(100); // 120 - 20 elle girilen
    expect(ods.find(o => o.id === manuelId)?.otomatik).toBe(false);

    await durumDegistir(faturaId, "acik");

    ods = await faturaOdemeleri(faturaId);
    expect(ods.some(o => o.id === oto!.id)).toBe(false); // otomatik silindi
    expect(ods.some(o => o.id === manuelId)).toBe(true); // elle girilen korundu
    expect(ods.length).toBe(1);
  });

  it("açıklaması düzenlenen otomatik tahsilat yine tanınır ve silinir", async () => {
    const faturaId = await faturaOlustur();
    await durumDegistir(faturaId, "odendi");

    const [oto] = (await faturaOdemeleri(faturaId)).filter(o => o.otomatik);
    expect(oto).toBeDefined();

    // Kullanıcı açıklamayı tamamen değiştiriyor — sonek artık yok.
    const patch = await request(app)
      .patch(`/api/odemeler/${oto.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ aciklama: "elle düzenlenmiş açıklama" });
    expect(patch.status).toBe(200);

    await durumDegistir(faturaId, "acik");
    expect((await faturaOdemeleri(faturaId)).length).toBe(0);
  });

  it("elle girilen ve '(otomatik tahsilat)' metni taşıyan tahsilat silinmez", async () => {
    const faturaId = await faturaOlustur();
    const manuelId = await tahsilatEkle(faturaId, 30, "Banka dekontu (otomatik tahsilat)");

    await durumDegistir(faturaId, "odendi");
    await durumDegistir(faturaId, "acik");

    const ods = await faturaOdemeleri(faturaId);
    expect(ods.length).toBe(1);
    expect(ods[0].id).toBe(manuelId);
  });

  it("migrasyon öncesi eski kayıt (otomatik=false, sonek metinli) geri almada korunur", async () => {
    const faturaId = await faturaOlustur();
    const [fat] = await db.select().from(faturalar).where(eq(faturalar.id, faturaId));

    // Migrasyon öncesi dönemi simüle et: kayıt doğrudan DB'ye, tam eski
    // otomatik açıklama biçimiyle ama otomatik=false (kolon varsayılanı) girilir.
    const [eski] = await db.insert(odemeler).values({
      catiFirmaId: catiId, bagliFirmaId: bagliId, faturaId,
      tip: "tahsilat", tarih: bugun, tutar: "120", paraBirimi: "USD",
      odemeYontemi: "banka_havalesi",
      aciklama: `${fat.faturaNo} ödendi olarak işaretlendi (otomatik tahsilat)`,
    }).returning({ id: odemeler.id });
    await db.update(faturalar).set({ durum: "odendi" }).where(eq(faturalar.id, faturaId));

    await durumDegistir(faturaId, "acik");

    // Belirsiz eski kayıt elle girilmiş sayılır ve silinmez.
    const ods = await faturaOdemeleri(faturaId);
    expect(ods.length).toBe(1);
    expect(ods[0].id).toBe(eski.id);
  });

  it("kullanıcı API'sinden otomatik alanı yazılamaz", async () => {
    const faturaId = await faturaOlustur();
    const id = await tahsilatEkle(faturaId, 10, "Elle", { otomatik: true });
    const [kayit] = await db.select().from(odemeler).where(eq(odemeler.id, id));
    expect(kayit.otomatik).toBe(false);
  });
});

describe("Ödendi işaretinin geri alınması (toplu-durum)", () => {
  it("toplu ödendi → toplu geri al: otomatikler silinir, elle girilenler korunur", async () => {
    const f1 = await faturaOlustur();
    const f2 = await faturaOlustur();
    const manuelId = await tahsilatEkle(f1, 50, "Elle kısmi");

    const isaretle = await request(app)
      .patch("/api/faturalar/toplu-durum")
      .set("Authorization", `Bearer ${token}`)
      .send({ ids: [f1, f2], durum: "odendi" });
    expect(isaretle.status).toBe(200);

    const otolar = await db.select().from(odemeler)
      .where(and(inArray(odemeler.faturaId, [f1, f2]), eq(odemeler.otomatik, true)));
    expect(otolar.length).toBe(2);
    expect(otolar.map(o => Number(o.tutar)).sort((a, b) => a - b)).toEqual([70, 120]);

    const geriAl = await request(app)
      .patch("/api/faturalar/toplu-durum")
      .set("Authorization", `Bearer ${token}`)
      .send({ ids: [f1, f2], durum: "acik" });
    expect(geriAl.status).toBe(200);

    const kalan = await db.select().from(odemeler).where(inArray(odemeler.faturaId, [f1, f2]));
    expect(kalan.length).toBe(1);
    expect(kalan[0].id).toBe(manuelId);
    expect(kalan[0].otomatik).toBe(false);
  });
});
