/**
 * Yetkilendirme entegrasyon testleri: rol/aktiflik/modül izinleri DB'den okunur;
 * daha önce alınmış (eski) bir token, DB'deki değişiklikten SONRA yetkisini kaybetmelidir.
 *
 * Geliştirme veritabanına karşı çalışır (DATABASE_URL); kendi oluşturduğu
 * kullanıcıları test sonunda siler.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { eq, inArray } from "drizzle-orm";
import { db, kullanicilar } from "@workspace/db";
import app from "../app";
import { JWT_SECRET, type TokenPayload } from "../middleware/auth";

const SUFFIX = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const olusturulanlar: number[] = [];

async function kullaniciEkle(opts: {
  rol: "yonetici" | "muhasebeci" | "salt_okunur";
  modulIzinleri?: string[] | null;
  aktif?: boolean;
}): Promise<{ id: number; token: string }> {
  const email = `yetki-test-${opts.rol}-${olusturulanlar.length}-${SUFFIX}@test.local`;
  const [row] = await db
    .insert(kullanicilar)
    .values({
      ad: `Yetki Test ${opts.rol}`,
      email,
      parola: "x", // login kullanılmıyor; token'ı doğrudan imzalıyoruz
      rol: opts.rol,
      aktif: opts.aktif ?? true,
      modulIzinleri: opts.modulIzinleri ?? null,
    })
    .returning({ id: kullanicilar.id });
  olusturulanlar.push(row.id);
  const payload: TokenPayload = {
    id: row.id,
    email,
    ad: `Yetki Test ${opts.rol}`,
    rol: opts.rol,
    sirketler: [],
    modulIzinleri: opts.modulIzinleri ?? null,
  };
  return { id: row.id, token: jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" }) };
}

afterAll(async () => {
  if (olusturulanlar.length > 0) {
    await db.delete(kullanicilar).where(inArray(kullanicilar.id, olusturulanlar));
  }
});

describe("DB tabanlı yetki zorlaması (eski token'lar anında etkisizleşir)", () => {
  it("düşürülen yönetici, eski token'ıyla yönetici uçlarına erişemez", async () => {
    const aktor = await kullaniciEkle({ rol: "yonetici" });
    const kurban = await kullaniciEkle({ rol: "yonetici" });

    // Başlangıçta her iki yönetici token'ı da /kullanicilar'a erişebilir.
    const once = await request(app).get("/api/kullanicilar").set("Authorization", `Bearer ${kurban.token}`);
    expect(once.status).toBe(200);

    // Gerçek API üzerinden rol düşürme (cache temizleme dahil tam yol test edilir).
    const dusur = await request(app)
      .put(`/api/kullanicilar/${kurban.id}`)
      .set("Authorization", `Bearer ${aktor.token}`)
      .send({ rol: "muhasebeci", modulIzinleri: ["teklifler"] });
    expect(dusur.status).toBe(200);

    // Aynı (eski, rol=yonetici yazan) token artık yönetici ucuna giremez.
    const sonra = await request(app).get("/api/kullanicilar").set("Authorization", `Bearer ${kurban.token}`);
    expect(sonra.status).toBe(403);

    // Modül kısıtı da aynı token'a uygulanır: teklifler serbest, ödemeler yasak.
    const teklifler = await request(app).get("/api/teklifler").set("Authorization", `Bearer ${kurban.token}`);
    expect(teklifler.status).toBe(200);
    const odemeler = await request(app).get("/api/odemeler").set("Authorization", `Bearer ${kurban.token}`);
    expect(odemeler.status).toBe(403);
  });

  it("pasifleştirilen kullanıcı, eski token'ıyla hiçbir korumalı uca erişemez", async () => {
    const aktor = await kullaniciEkle({ rol: "yonetici" });
    const kurban = await kullaniciEkle({ rol: "muhasebeci", modulIzinleri: ["teklifler"] });

    const once = await request(app).get("/api/teklifler").set("Authorization", `Bearer ${kurban.token}`);
    expect(once.status).toBe(200);

    const pasif = await request(app)
      .put(`/api/kullanicilar/${kurban.id}`)
      .set("Authorization", `Bearer ${aktor.token}`)
      .send({ aktif: false });
    expect(pasif.status).toBe(200);

    const sonra = await request(app).get("/api/teklifler").set("Authorization", `Bearer ${kurban.token}`);
    expect(sonra.status).toBe(401);
  });

  it("silinen kullanıcının eski token'ı geçersizdir", async () => {
    const aktor = await kullaniciEkle({ rol: "yonetici" });
    const kurban = await kullaniciEkle({ rol: "muhasebeci" });

    const sil = await request(app)
      .delete(`/api/kullanicilar/${kurban.id}`)
      .set("Authorization", `Bearer ${aktor.token}`);
    expect(sil.status).toBe(204);

    const sonra = await request(app).get("/api/teklifler").set("Authorization", `Bearer ${kurban.token}`);
    expect(sonra.status).toBe(401);
  });

  it("modül izni değişikliği eski token'a anında uygulanır", async () => {
    const aktor = await kullaniciEkle({ rol: "yonetici" });
    const kurban = await kullaniciEkle({ rol: "muhasebeci", modulIzinleri: ["teklifler"] });

    expect((await request(app).get("/api/teklifler").set("Authorization", `Bearer ${kurban.token}`)).status).toBe(200);
    expect((await request(app).get("/api/odemeler").set("Authorization", `Bearer ${kurban.token}`)).status).toBe(403);

    const degistir = await request(app)
      .put(`/api/kullanicilar/${kurban.id}`)
      .set("Authorization", `Bearer ${aktor.token}`)
      .send({ modulIzinleri: ["odemeler"] });
    expect(degistir.status).toBe(200);

    expect((await request(app).get("/api/odemeler").set("Authorization", `Bearer ${kurban.token}`)).status).toBe(200);
    expect((await request(app).get("/api/teklifler").set("Authorization", `Bearer ${kurban.token}`)).status).toBe(403);
  });

  it("referans listeleri açık, detay uçları modül ister", async () => {
    const k = await kullaniciEkle({ rol: "muhasebeci", modulIzinleri: ["teklifler"] });
    // Liste uçları (formların ihtiyacı) tüm doğrulanmış kullanıcılara açık.
    expect((await request(app).get("/api/firmalar").set("Authorization", `Bearer ${k.token}`)).status).toBe(200);
    expect((await request(app).get("/api/kdv-oranlari").set("Authorization", `Bearer ${k.token}`)).status).toBe(200);
    // Detay uçları ilgili modülü ister.
    expect((await request(app).get("/api/firmalar/1").set("Authorization", `Bearer ${k.token}`)).status).toBe(403);
    expect((await request(app).get("/api/gemiler/1").set("Authorization", `Bearer ${k.token}`)).status).toBe(403);
  });
});
