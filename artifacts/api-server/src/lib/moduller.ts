import { type Request, type Response, type NextFunction } from "express";
import { db, kullanicilar } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Panel modül anahtarları. Panel tarafındaki karşılığı:
 * artifacts/panel/src/lib/moduller.ts — iki liste senkron tutulmalı.
 */
export const MODULLER = [
  "dashboard",
  "firmalar",
  "gemiler",
  "teklifler",
  "faturalar",
  "odemeler",
  "cariler",
  "ekipmanlar",
  "servis",
  "urunler",
  "raporlar",
  "gonderi_gecmisi",
  "ayarlar",
] as const;

export type Modul = (typeof MODULLER)[number];

export function gecerliModulListesi(deger: unknown): Modul[] | null | undefined {
  if (deger === undefined) return undefined;
  if (deger === null) return null;
  if (!Array.isArray(deger)) return undefined;
  const temiz = [...new Set(deger)].filter(
    (m): m is Modul => typeof m === "string" && (MODULLER as readonly string[]).includes(m)
  );
  return temiz;
}

/**
 * Rota öneki -> gerekli modüller.
 * - `listeSerbest: true` => SADECE önekin kendisine yapılan GET/HEAD (liste ucu) herkese açık;
 *   detay uçları (/gemiler/:id gibi) yine modül izni ister — detaylar fatura/ekipman verisi gömer.
 * - Aksi halde listedeki modüllerden EN AZ BİRİ yeterli.
 */
const KURALLAR: Array<{ prefix: string; oku: Modul[]; yaz: Modul[]; listeSerbest?: boolean }> = [
  { prefix: "/dashboard", oku: ["dashboard"], yaz: ["dashboard"] },
  // Firma/gemi LİSTELERİ şirket seçimi ve fatura/teklif formları için her yerde gerekli.
  { prefix: "/firmalar", oku: ["firmalar"], yaz: ["firmalar"], listeSerbest: true },
  { prefix: "/gemiler", oku: ["gemiler"], yaz: ["gemiler"], listeSerbest: true },
  { prefix: "/teklifler", oku: ["teklifler"], yaz: ["teklifler"] },
  { prefix: "/faturalar", oku: ["faturalar"], yaz: ["faturalar"] },
  { prefix: "/tekrarlayan-faturalar", oku: ["faturalar"], yaz: ["faturalar"] },
  // Fatura formunun ihtiyaç duyduğu referans listeler; yönetimi Ayarlar/Ürünler sayfasında.
  { prefix: "/fatura-serileri", oku: ["ayarlar"], yaz: ["ayarlar"], listeSerbest: true },
  { prefix: "/kdv-oranlari", oku: ["ayarlar"], yaz: ["ayarlar"], listeSerbest: true },
  { prefix: "/kalem-sablonlari", oku: ["urunler"], yaz: ["urunler"], listeSerbest: true },
  { prefix: "/odemeler", oku: ["odemeler"], yaz: ["odemeler"] },
  { prefix: "/cariler", oku: ["cariler"], yaz: ["cariler"] },
  // Banka hesapları Ayarlar sayfasında yönetiliyor; ödeme formu hesap listesini okur.
  { prefix: "/banka-hesaplari", oku: ["ayarlar", "odemeler"], yaz: ["ayarlar"] },
  { prefix: "/ekipmanlar", oku: ["ekipmanlar"], yaz: ["ekipmanlar"] },
  { prefix: "/servis-kayitlari", oku: ["servis"], yaz: ["servis"] },
  { prefix: "/servis-dosyalari", oku: ["servis"], yaz: ["servis"] },
  { prefix: "/raporlar", oku: ["raporlar"], yaz: ["raporlar"] },
  { prefix: "/gonderi-gecmisi", oku: ["gonderi_gecmisi"], yaz: ["gonderi_gecmisi"] },
  // Tanı/debug uçları firma-kapsamı dışı veri içerebilir; Ayarlar iznine bağlı.
  { prefix: "/debug", oku: ["ayarlar"], yaz: ["ayarlar"] },
];

// Modül izinleri ve rol JWT'ye değil DB'ye dayanır: yönetici bir kullanıcının izinlerini
// kısıtladığında (ya da rolünü düşürdüğünde/hesabı kapattığında) eski token'la erişim sürmesin.
// Kısa süreli cache ile sorgu maliyeti düşük tutulur.
const CACHE_TTL_MS = 30_000;
interface KullaniciDurum {
  rol: string;
  aktif: boolean;
  moduller: string[] | null;
}
const modulCache = new Map<number, { durum: KullaniciDurum | null; exp: number }>();

export function modulCacheTemizle(kullaniciId?: number): void {
  if (kullaniciId === undefined) modulCache.clear();
  else modulCache.delete(kullaniciId);
}

/** DB'deki güncel rol/aktiflik/modül bilgisi; kullanıcı silinmişse null. */
export async function kullaniciDurumu(kullaniciId: number): Promise<KullaniciDurum | null> {
  const simdi = Date.now();
  const cached = modulCache.get(kullaniciId);
  if (cached && cached.exp > simdi) return cached.durum;
  const [row] = await db
    .select({ rol: kullanicilar.rol, aktif: kullanicilar.aktif, modulIzinleri: kullanicilar.modulIzinleri })
    .from(kullanicilar)
    .where(eq(kullanicilar.id, kullaniciId));
  const durum: KullaniciDurum | null = row
    ? { rol: row.rol, aktif: row.aktif, moduller: row.modulIzinleri ?? null }
    : null;
  modulCache.set(kullaniciId, { durum, exp: simdi + CACHE_TTL_MS });
  return durum;
}

/** Silinmiş/pasif kullanıcı => false. DB'de yönetici veya kısıtsız (null) => true. */
export async function modulIzinliMi(kullaniciId: number, moduller: Modul[]): Promise<boolean> {
  const durum = await kullaniciDurumu(kullaniciId);
  if (!durum || !durum.aktif) return false;
  if (durum.rol === "yonetici" || durum.moduller === null) return true;
  return moduller.some((m) => durum.moduller!.includes(m));
}

/** requireAuth'tan SONRA çalışmalı; eşleşmeyen rotalar serbest. Yönetici muafiyeti DB rolüne göre. */
export async function modulKisiti(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const k = req.kullanici;
    if (!k) { next(); return; }
    const kural = KURALLAR.find((r) => req.path === r.prefix || req.path.startsWith(r.prefix + "/"));
    if (!kural) { next(); return; }
    const okumaMi = req.method === "GET" || req.method === "HEAD";
    if (okumaMi && kural.listeSerbest && req.path === kural.prefix) { next(); return; }
    const gerekli = okumaMi ? kural.oku : kural.yaz;
    if (await modulIzinliMi(k.id, gerekli)) { next(); return; }
    res.status(403).json({ error: "Bu bölüme erişim izniniz yok" });
  } catch (err) {
    console.error("[modulKisiti] yetki kontrolü başarısız:", err);
    res.status(500).json({ error: "Yetki kontrolü yapılamadı" });
  }
}
