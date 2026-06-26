import { db } from "@workspace/db";
import { firmalar, firmaSirketGorunurluk } from "@workspace/db";

/**
 * Verilen catiFirmaId'ye görünür olan tüm bagli firma ID'lerini döner.
 * Bir bagli firma şu durumlarda görünür:
 *   1. bagli.ustFirmaId === catiFirmaId (doğrudan atanmış)
 *   2. bagli.grupFirmaId → o grup firmanın görünürlüğü catiFirmaId'yi kapsıyor
 *      (firmaSirketGorunurluk'ta kayıt varsa o listede, kayıt yoksa = herkese görünür)
 */
export async function gorunurBagliFirmaIds(catiFirmaIdNum: number): Promise<number[]> {
  const tumFirmalar = await db.select().from(firmalar);
  const gorunurlukRows = await db.select().from(firmaSirketGorunurluk);

  const gorunurlukMap = new Map<number, number[]>();
  for (const g of gorunurlukRows) {
    if (!gorunurlukMap.has(g.firmaId)) gorunurlukMap.set(g.firmaId, []);
    gorunurlukMap.get(g.firmaId)!.push(g.catiFirmaId);
  }

  const gorunurGrupIds = new Set<number>();
  for (const f of tumFirmalar) {
    if (f.tip !== "grup") continue;
    const gorunur = gorunurlukMap.get(f.id);
    if (!gorunur || gorunur.length === 0) {
      gorunurGrupIds.add(f.id);
    } else if (gorunur.includes(catiFirmaIdNum)) {
      gorunurGrupIds.add(f.id);
    }
  }

  const ids: number[] = [];
  for (const f of tumFirmalar) {
    if (f.tip !== "bagli") continue;
    if (f.ustFirmaId === catiFirmaIdNum) { ids.push(f.id); continue; }
    if (f.grupFirmaId != null && gorunurGrupIds.has(f.grupFirmaId)) ids.push(f.id);
  }
  return ids;
}
