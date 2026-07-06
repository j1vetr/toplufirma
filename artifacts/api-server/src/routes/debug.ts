import { Router } from "express";
import { db } from "@workspace/db";
import { firmalar, gemiler, firmaSirketGorunurluk } from "@workspace/db";
import { eq } from "drizzle-orm";
import { gorunurBagliFirmaIds } from "../utils/gorunurluk";

const router = Router();

router.get("/debug/firma-analizi", async (req, res) => {
  try {
    const izinliSirketler = req.izinliSirketler ?? [];
    const isYonetici = req.kullanici?.rol === "yonetici";

    const [tumFirmalar, tumGemilerRaw, gorunurlukRows] = await Promise.all([
      db.select().from(firmalar),
      db.select({
        id: gemiler.id,
        ad: gemiler.ad,
        imoNumarasi: gemiler.imoNumarasi,
        firmaId: gemiler.firmaId,
        aktif: gemiler.aktif,
      }).from(gemiler).orderBy(gemiler.ad),
      db.select().from(firmaSirketGorunurluk),
    ]);

    const catiFirmalar = tumFirmalar.filter(f => f.tip === "cati");
    const bagliMap = new Map(tumFirmalar.filter(f => f.tip === "bagli").map(f => [f.id, f]));
    const firmaMap = new Map(tumFirmalar.map(f => [f.id, f]));

    const erisilebilenCatiFirmalar = isYonetici
      ? catiFirmalar
      : catiFirmalar.filter(f => izinliSirketler.includes(f.id));

    const gorunurlukMap = new Map<number, number[]>();
    for (const g of gorunurlukRows) {
      if (!gorunurlukMap.has(g.firmaId)) gorunurlukMap.set(g.firmaId, []);
      gorunurlukMap.get(g.firmaId)!.push(g.catiFirmaId);
    }

    const catiAnalizler = await Promise.all(
      erisilebilenCatiFirmalar.map(async (cati) => {
        const bagliFirmaIds = await gorunurBagliFirmaIds(cati.id);
        const bagliFirmaIdSet = new Set(bagliFirmaIds);

        const bagliFirmalar = bagliFirmaIds.map(bId => {
          const bf = bagliMap.get(bId);
          if (!bf) return { id: bId, ad: "?", baglantiYolu: "bilinmiyor", ustFirmaId: null, grupFirmaId: null };

          let baglantiYolu: string;
          if (bf.ustFirmaId === cati.id) {
            baglantiYolu = "doğrudan (ustFirmaId)";
          } else if (bf.grupFirmaId != null) {
            const gf = firmaMap.get(bf.grupFirmaId);
            baglantiYolu = `grup zinciri (grupFirmaId → ${gf?.ad ?? bf.grupFirmaId})`;
          } else {
            baglantiYolu = "bilinmiyor";
          }

          return {
            id: bf.id,
            ad: bf.ad,
            baglantiYolu,
            ustFirmaId: bf.ustFirmaId,
            grupFirmaId: bf.grupFirmaId,
          };
        });

        const eslesenGemiler = tumGemilerRaw
          .filter(g => bagliFirmaIdSet.has(g.firmaId ?? -1))
          .map(g => {
            const bf = bagliMap.get(g.firmaId!);
            return {
              id: g.id,
              ad: g.ad,
              imoNumarasi: g.imoNumarasi,
              firmaId: g.firmaId,
              firmaAd: bf?.ad ?? null,
              aktif: g.aktif,
            };
          });

        return {
          id: cati.id,
          ad: cati.ad,
          bagliFirmaAdedi: bagliFirmalar.length,
          gemiAdedi: eslesenGemiler.length,
          bagliFirmalar,
          eslesenGemiler,
        };
      })
    );

    const eslesenGemiIdleri = new Set(
      catiAnalizler.flatMap(c => c.eslesenGemiler.map(g => g.id))
    );

    const eslesmeyen = tumGemilerRaw
      .filter(g => !eslesenGemiIdleri.has(g.id))
      .map(g => {
        const bf = g.firmaId ? firmaMap.get(g.firmaId) : null;
        return {
          id: g.id,
          ad: g.ad,
          imoNumarasi: g.imoNumarasi,
          firmaId: g.firmaId,
          firmaAd: bf?.ad ?? null,
          firmaTip: bf?.tip ?? null,
          ustFirmaId: bf?.ustFirmaId ?? null,
          grupFirmaId: bf?.grupFirmaId ?? null,
          sorun: !g.firmaId
            ? "firmaId yok — hiçbir firmaya bağlı değil"
            : !bf
              ? "firma veritabanında bulunamadı"
              : bf.tip !== "bagli"
                ? `firma tipi '${bf.tip}' — yalnızca 'bagli' tipi gemiler filtreye girer`
                : bf.ustFirmaId == null && bf.grupFirmaId == null
                  ? "bagli firmada ne ustFirmaId ne grupFirmaId var — hiçbir çatı firmaya bağlanamıyor"
                  : bf.grupFirmaId != null
                    ? (() => {
                        const gf = firmaMap.get(bf.grupFirmaId!);
                        const gorunurIcin = gorunurlukMap.get(bf.grupFirmaId!) ?? [];
                        if (gorunurIcin.length === 0) return `grup firma '${gf?.ad}' herkese görünür ama hiçbir catiFirma eşleşmedi — incelenmeli`;
                        return `grup firma '${gf?.ad}' yalnızca şu catiFirmalar için görünür: [${gorunurIcin.join(", ")}]`;
                      })()
                    : "nedenini belirlenemedi — lütfen ilişkileri kontrol edin",
        };
      });

    res.json({
      ozet: {
        toplamGemi: tumGemilerRaw.length,
        eslesen: eslesenGemiIdleri.size,
        eslesmeyen: eslesmeyen.length,
        catiFirmaAdedi: catiAnalizler.length,
      },
      catiAnalizler,
      eslesmeyen,
    });
  } catch (err) {
    res.status(500).json({ error: "Analiz yapılamadı", detail: String(err) });
  }
});

export default router;
