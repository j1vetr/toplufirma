import type { Request } from "express";
import { db } from "@workspace/db";
import { firmalar, faturalar, odemeler } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sirketErisimKontrol } from "../middleware/auth";
import { gorunurBagliFirmaIds } from "./gorunurluk";

type FirmaRow = typeof firmalar.$inferSelect;

/**
 * Bağlı firma erişim kontrolü.
 *
 * UI'dan oluşturulan bağlı firmalarda `ustFirmaId` NULL olabilir (gruplama
 * `grupFirmaId` üzerinden yapılır); bu yüzden erişim kontrolü yalnızca
 * `ustFirmaId`'ye dayanamaz. Sırasıyla:
 *   1. yönetici → her zaman erişebilir
 *   2. ustFirmaId doluysa → izinli şirketler listesinde mi
 *   3. görünürlük kuralları → firma, kullanıcının izinli çatı firmalarından
 *      birine görünür mü (grup görünürlüğü dahil)
 *   4. son çare → firmanın faturalarındaki çatı firmalardan birine erişim var mı
 */
export async function bagliFirmaErisimKontrol(firma: FirmaRow, req: Request): Promise<boolean> {
  if (!req.kullanici) return false;
  if (req.kullanici.rol === "yonetici") return true;
  const izinli = req.izinliSirketler ?? [];
  if (firma.ustFirmaId != null) return izinli.includes(firma.ustFirmaId);
  for (const catiId of izinli) {
    const gorunurIds = await gorunurBagliFirmaIds(catiId);
    if (gorunurIds.includes(firma.id)) return true;
  }
  // Grup üyesi bir firma görünürlük kurallarından geçemediyse erişim yok —
  // fatura tabanlı son çare, kısıtlı grup görünürlüğünü BYPASS ETMEMELİ.
  if (firma.grupFirmaId != null) return false;
  // Yetim firma (ustFirmaId ve grupFirmaId her ikisi NULL): firmanın
  // faturalarındaki çatı firmalardan birine erişim varsa izin ver.
  const faturaCatilari = await db
    .select({ catiFirmaId: faturalar.catiFirmaId })
    .from(faturalar)
    .where(eq(faturalar.bagliFirmaId, firma.id));
  return faturaCatilari.some(r => sirketErisimKontrol(r.catiFirmaId, req));
}

export type EkstreKalem = {
  id: number;
  tip: "fatura" | "odeme" | "tahsilat";
  tarih: string;
  aciklama: string | null;
  referansNo: string | null;
  gemiAd: string | null;
  borc: number | null;
  alacak: number | null;
  tutar: number;
  paraBirimi: string | null;
  /** Yürüyen bakiye (borç − alacak kümülatif). Çoklu para biriminde ayrıştırma Task #126 kapsamında. */
  bakiye: number;
};

export type EkstreVerisi = {
  kalemler: EkstreKalem[];
  toplamBorc: number;
  toplamAlacak: number;
  kalanBakiye: number;
};

/**
 * Bağlı firma ekstresi — Cariler sayfasındaki bakiye mantığıyla birebir tutarlı:
 *   - Kayıtlar yalnızca `bagliFirmaId` üzerinden çekilir (çatı firma filtresi yok;
 *     UI'dan oluşturulan firmalarda `ustFirmaId` NULL olduğundan çatı filtresi
 *     ekstrenin boş dönmesine yol açıyordu). Erişim kontrolü çağıran tarafta
 *     `bagliFirmaErisimKontrol` ile yapılır.
 *   - Taslak ve iptal faturalar dahil edilmez.
 *   - `odeme` tipi hareketler BORÇ, `tahsilat` tipi hareketler ALACAK tarafına yazılır.
 */
export async function ekstreVerisiGetir(
  bagliFirmaId: number,
  baslangicTarihi?: string,
  bitisTarihi?: string,
): Promise<EkstreVerisi> {
  const [faturaRows, odemeRows] = await Promise.all([
    db.select().from(faturalar).where(eq(faturalar.bagliFirmaId, bagliFirmaId)),
    db.select().from(odemeler).where(eq(odemeler.bagliFirmaId, bagliFirmaId)),
  ]);

  const fatFilt = faturaRows.filter(f =>
    !["taslak", "iptal"].includes(f.durum) &&
    (!baslangicTarihi || f.faturaTarihi >= baslangicTarihi) &&
    (!bitisTarihi || f.faturaTarihi <= bitisTarihi)
  );
  const odFilt = odemeRows.filter(o =>
    (!baslangicTarihi || o.tarih >= baslangicTarihi) &&
    (!bitisTarihi || o.tarih <= bitisTarihi)
  );

  const fatKalemler: Omit<EkstreKalem, "bakiye">[] = fatFilt.map(f => ({
    id: f.id,
    tip: "fatura" as const,
    tarih: f.faturaTarihi,
    aciklama: f.aciklama ?? f.faturaNo,
    referansNo: f.faturaNo,
    gemiAd: null,
    borc: Number(f.genelToplam),
    alacak: null,
    tutar: Number(f.genelToplam),
    paraBirimi: f.paraBirimi,
  }));
  const odKalemler: Omit<EkstreKalem, "bakiye">[] = odFilt.map(o => ({
    id: o.id,
    tip: o.tip as "odeme" | "tahsilat",
    tarih: o.tarih,
    aciklama: o.aciklama ?? null,
    referansNo: null,
    gemiAd: null,
    borc: o.tip === "odeme" ? Number(o.tutar) : null,
    alacak: o.tip === "tahsilat" ? Number(o.tutar) : null,
    tutar: Number(o.tutar),
    paraBirimi: o.paraBirimi,
  }));

  // Cariler'deki buildEntries ile aynı sıralama: tarih, eşitlikte fatura önce.
  const sirali = [...fatKalemler, ...odKalemler].sort((a, b) => {
    const d = a.tarih.localeCompare(b.tarih);
    if (d !== 0) return d;
    if (a.tip === "fatura" && b.tip !== "fatura") return -1;
    return 1;
  });
  let bakiye = 0;
  const kalemler: EkstreKalem[] = sirali.map(k => {
    bakiye += (k.borc ?? 0) - (k.alacak ?? 0);
    return { ...k, bakiye };
  });
  const toplamBorc = kalemler.reduce((s, k) => s + (k.borc ?? 0), 0);
  const toplamAlacak = kalemler.reduce((s, k) => s + (k.alacak ?? 0), 0);
  const kalanBakiye = toplamBorc - toplamAlacak;

  return { kalemler, toplamBorc, toplamAlacak, kalanBakiye };
}

export const EKSTRE_TIP_ETIKET: Record<EkstreKalem["tip"], string> = {
  fatura: "Fatura",
  odeme: "Ödeme",
  tahsilat: "Tahsilat",
};
