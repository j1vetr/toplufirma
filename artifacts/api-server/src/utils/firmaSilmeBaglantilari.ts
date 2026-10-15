import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/** Every non-cascading FK to firmalar, including inactive and draft records.
 * Cascading settings, visibility rules and user assignments do not block deletion.
 * Callers must enforce administrator authorization before exposing these records.
 */
export async function firmaSilmeBaglantilari(id: number) {
  const result = await db.execute<{
    id: number; tur: string; ad: string; detay: string; href: string;
  }>(sql`
    SELECT id, 'Bağlı firma' AS tur, ad,
      CASE WHEN aktif THEN tip::text ELSE tip::text || ' (pasif)' END AS detay,
      CASE WHEN tip = 'grup' THEN '/cariler/grup/' ELSE '/cariler/' END || id AS href
      FROM firmalar WHERE ust_firma_id = ${id} OR grup_firma_id = ${id}
    UNION ALL
    SELECT id, 'Fatura', fatura_no, durum::text || ' · ' || genel_toplam || ' ' || para_birimi,
      '/faturalar/' || id FROM faturalar
      WHERE cati_firma_id = ${id} OR bagli_firma_id = ${id} OR grup_firma_id = ${id}
    UNION ALL
    SELECT id, CASE WHEN tip = 'tahsilat' THEN 'Tahsilat' ELSE 'Ödeme' END,
      COALESCE(NULLIF(aciklama, ''), 'İşlem #' || id),
      tarih::text || ' · ' || tutar || ' ' || para_birimi ||
        CASE WHEN fatura_id IS NULL THEN ' · Faturaya bağlı değil' ELSE ' · Fatura #' || fatura_id END,
      '/odemeler' FROM odemeler WHERE cati_firma_id = ${id} OR bagli_firma_id = ${id}
    UNION ALL
    SELECT id, 'Gemi', ad, COALESCE(imo_numarasi, '') ||
      CASE WHEN aktif THEN '' ELSE ' (pasif)' END, '/gemiler/' || id
      FROM gemiler WHERE firma_id = ${id}
    UNION ALL
    SELECT id, 'Teklif', teklif_no, alici_ad || ' · ' || durum::text, '/teklifler'
      FROM teklifler WHERE cati_firma_id = ${id} OR alici_firma_id = ${id}
    UNION ALL
    SELECT id, 'Tekrarlayan fatura', aciklama,
      CASE WHEN aktif THEN 'Aktif' ELSE 'Pasif' END, '/tekrarlayan-faturalar'
      FROM tekrarlayan_faturalar
      WHERE cati_firma_id = ${id} OR bagli_firma_id = ${id} OR grup_firma_id = ${id}
    UNION ALL
    SELECT id, 'Banka hesabı', hesap_adi, COALESCE(banka_adi, ''), '/banka-hesaplari/' || id
      FROM banka_hesaplari WHERE cati_firma_id = ${id}
    UNION ALL
    SELECT id, 'Fatura serisi', ad, onek, '/ayarlar'
      FROM fatura_serileri WHERE cati_firma_id = ${id}
    UNION ALL
    SELECT id, 'KDV oranı', ad, oran::text || '%', '/ayarlar'
      FROM kdv_oranlari WHERE cati_firma_id = ${id}
    UNION ALL
    SELECT id, 'Ekipman', seri_no, tip, '/ekipmanlar'
      FROM ekipmanlar WHERE cati_firma_id = ${id}
    UNION ALL
    SELECT id, 'Servis / sözleşme', baslik, tarih::text, '/servis/' || id
      FROM servis_kayitlari WHERE cati_firma_id = ${id}
    ORDER BY tur, ad, id
  `);
  return result.rows;
}
