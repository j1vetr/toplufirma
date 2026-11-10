import type { KdvOzeti } from "@workspace/api-client-react";
import { Panel, Metrik, CsvButon, Bos, Not } from "./rapor-ortak";
import { RENK, fmtPara, oran, csvIndir, dosyaAdi, type RaporBaglam } from "@/lib/rapor-bicim";

export function KdvSekmesi({ kdv, b }: { kdv: KdvOzeti; b: RaporBaglam }) {
  const pb = b.paraBirimi;
  const firmalar = [...kdv.firmaKirilim].sort((x, y) => y.kdvTutari - x.kdvTutari);

  const csv = () => csvIndir(
    ["Çatı firma", `KDV hariç (${pb})`, `KDV (${pb})`, `KDV dahil (${pb})`],
    [
      ...firmalar.map((f) => [f.catiFirmaAd, f.kdvHaric, f.kdvTutari, f.kdvDahil]),
      ["Toplam", kdv.kdvHaricToplam, kdv.kdvTutariToplam, kdv.kdvDahilToplam],
    ],
    dosyaAdi("kdv", b),
  );

  return (
    <div className="space-y-5">
      <Not>KDV, ödeme durumundan bağımsız olarak dönemde kesilen <strong>tüm geçerli faturalardan</strong> hesaplanır. Taslak ve iptal faturalar hariçtir.</Not>
      <div className="grid grid-cols-1 gap-px border bg-border sm:grid-cols-3">
        <Metrik etiket="KDV hariç" deger={fmtPara(kdv.kdvHaricToplam, pb)} renk={RENK.fatura} testId="text-kdv-haric" />
        <Metrik etiket="Hesaplanan KDV" deger={fmtPara(kdv.kdvTutariToplam, pb)} vurgu alt={`Matrahın %${oran(kdv.kdvTutariToplam, kdv.kdvHaricToplam).toFixed(2)} kadarı`} testId="text-kdv-tutar" />
        <Metrik etiket="KDV dahil" deger={fmtPara(kdv.kdvDahilToplam, pb)} testId="text-kdv-dahil" />
      </div>
      <Panel baslik="Firma kırılımı" alt={`${pb} cinsinden`} sag={<CsvButon onClick={csv} testId="button-csv-kdv" />}>
        {firmalar.length === 0 ? <Bos baslik="Bu dönemde KDV kaydı yok" /> : (
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="w-full min-w-[520px] text-xs tabular-nums">
              <thead>
                <tr className="border-b text-left text-[10px] tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-semibold sm:px-5">ÇATI FİRMA</th>
                  <th className="px-2 py-2 text-right font-semibold">KDV HARİÇ</th>
                  <th className="px-2 py-2 text-right font-semibold">KDV</th>
                  <th className="px-4 py-2 text-right font-semibold sm:px-5">KDV DAHİL</th>
                </tr>
              </thead>
              <tbody>
                {firmalar.map((f) => (
                  <tr key={f.catiFirmaId} className="border-b hover:bg-muted/50" data-testid={`row-kdv-${f.catiFirmaId}`}>
                    <td className="px-4 py-2 font-semibold sm:px-5">{f.catiFirmaAd}</td>
                    <td className="px-2 py-2 text-right">{fmtPara(f.kdvHaric, pb)}</td>
                    <td className="px-2 py-2 text-right font-semibold">{fmtPara(f.kdvTutari, pb)}</td>
                    <td className="px-4 py-2 text-right sm:px-5">{fmtPara(f.kdvDahil, pb)}</td>
                  </tr>
                ))}
                <tr className="bg-muted/60 font-bold">
                  <td className="px-4 py-2 sm:px-5">Toplam</td>
                  <td className="px-2 py-2 text-right">{fmtPara(kdv.kdvHaricToplam, pb)}</td>
                  <td className="px-2 py-2 text-right">{fmtPara(kdv.kdvTutariToplam, pb)}</td>
                  <td className="px-4 py-2 text-right sm:px-5">{fmtPara(kdv.kdvDahilToplam, pb)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
