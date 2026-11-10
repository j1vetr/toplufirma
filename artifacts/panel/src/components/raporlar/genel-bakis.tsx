import { useState } from "react";
import type { FinansalRapor } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Panel, Metrik, Not, CsvButon, Bos, OranCubugu } from "./rapor-ortak";
import { FaturaGrafigi, NakitGrafigi } from "./aylik-grafikler";
import {
  RENK, DURUM_ETIKET, DURUM_RENK, fmtPara, fmtTarih, oran, csvIndir, dosyaAdi, type RaporBaglam,
} from "@/lib/rapor-bicim";

export function GenelBakis({ r, b }: { r: FinansalRapor; b: RaporBaglam }) {
  const pb = r.paraBirimi;
  const o = r.ozet;
  const [tumFaturalar, setTumFaturalar] = useState(false);
  const faturalar = tumFaturalar ? r.faturalar : r.faturalar.slice(0, 25);

  const aylikCsv = () => csvIndir(
    ["Ay", "Fatura adedi", `Faturalanan (${pb})`, `Faturaya sayılan (${pb})`, `Kalan alacak (${pb})`, `Nakit tahsilat (${pb})`, `Nakit ödeme (${pb})`, `Net nakit (${pb})`],
    r.aylik.map((a) => [a.ayAd, a.sayi, a.faturalanan, a.faturayaSayilan, a.kalan, a.tahsilat, a.odeme, a.netNakit]),
    dosyaAdi("aylik", b),
  );
  const durumCsv = () => csvIndir(
    ["Durum", "Fatura adedi", `Tutar (${pb})`],
    r.durumlar.map((d) => [DURUM_ETIKET[d.durum] ?? d.durum, d.sayi, d.tutar]),
    dosyaAdi("durum", b),
  );
  const faturaCsv = () => csvIndir(
    ["Fatura no", "Fatura tarihi", "Vade", "Çatı firma", "Müşteri", "Gemi", "Durum", "Para birimi", "KDV hariç", "KDV", "Genel toplam", "Faturaya sayılan", "Kalan"],
    r.faturalar.map((f) => [f.faturaNo, f.faturaTarihi, f.vadeTarihi, f.catiFirmaAd, f.bagliFirmaAd, f.gemiAd, DURUM_ETIKET[f.durum] ?? f.durum, f.paraBirimi, f.toplamTutar, f.kdvTutari, f.genelToplam, f.odenenTutar, f.kalanTutar]),
    dosyaAdi("faturalar", b),
  );

  return (
    <div className="space-y-5">
      {/* İki ayrı defter */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="border">
          <div className="flex items-baseline justify-between border-b bg-muted/60 px-4 py-2">
            <h2 className="text-xs font-bold">Fatura tarafı</h2>
            <span className="text-[11px] text-muted-foreground">Fatura tarihine göre</span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-border">
            <Metrik etiket="Faturalanan" deger={fmtPara(o.toplamFatura, pb)} alt={`${o.faturaSayisi} geçerli fatura`} renk={RENK.fatura} testId="text-toplam-fatura" />
            <Metrik etiket="Faturaya sayılan" deger={fmtPara(o.faturayaSayilan, pb)} alt={`Faturaların %${oran(o.faturayaSayilan, o.toplamFatura).toFixed(1)} kadarı kapanmış`} renk={RENK.karsilanan} testId="text-faturaya-sayilan" />
            <Metrik etiket="Kalan alacak (bugün)" deger={fmtPara(o.kalanAlacak, pb)} alt="Bu dönem faturalarından bugün açık kalan" renk={RENK.kalan} testId="text-kalan-alacak" />
            <Metrik etiket="Dönem net hareketi" deger={fmtPara(o.donemNetHareketi, pb)} alt="Fatura ve ödeme eksi tahsilat. Tüm zaman bakiyesi değildir." testId="text-donem-net" />
          </div>
        </div>
        <div className="border">
          <div className="flex items-baseline justify-between border-b bg-muted/60 px-4 py-2">
            <h2 className="text-xs font-bold">Nakit tarafı</h2>
            <span className="text-[11px] text-muted-foreground">Ödeme tarihine göre</span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-border">
            <Metrik etiket="Nakit tahsilat" deger={fmtPara(o.nakitTahsilat, pb)} alt="Dönemde gerçekten giren para" renk={RENK.tahsilat} testId="text-nakit-tahsilat" />
            <Metrik etiket="Nakit ödeme" deger={fmtPara(o.nakitOdeme, pb)} alt="Müşteriye yapılan çıkışlar" renk={RENK.odeme} testId="text-nakit-odeme" />
            <Metrik etiket="Net nakit" deger={fmtPara(o.netNakit, pb)} alt="Tahsilat eksi ödeme" vurgu testId="text-net-nakit" />
            <div className="bg-card p-4 text-xs leading-relaxed text-muted-foreground">
              Eski bir tahsilatın faturaya eşlenmesi kalan alacağı düşürür ama yeni nakit sayılmaz.
            </div>
          </div>
        </div>
      </div>

      <Not>
        <strong>Bu iki tarafı toplamayın.</strong> Faturaya sayılan tutar, faturalara dağıtılmış ödemedir ve bu dönemde gelen para anlamına gelmez. Nakit tahsilat her tahsilat kaydını bir kez, tahsilat tarihine göre sayar. Tüm tutarlar yalnızca {pb} cinsindendir.
      </Not>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel baslik="Aylık faturalama" alt="Her çubuk o ay kesilen faturaların toplamı. Mavi kısım kapanmış, turuncu kısım bugün hâlâ açık.">
          <FaturaGrafigi aylik={r.aylik} pb={pb} />
        </Panel>
        <Panel baslik="Aylık nakit akışı" alt="Gerçek tahsilat ve ödeme tarihleri. Çizgi aylık net nakdi gösterir.">
          <NakitGrafigi aylik={r.aylik} pb={pb} />
        </Panel>
      </div>

      <Panel baslik="Ay ay döküm" alt={`${pb} cinsinden`} sag={<CsvButon onClick={aylikCsv} testId="button-csv-aylik" />}>
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[720px] text-xs tabular-nums">
            <thead>
              <tr className="border-b text-left text-[10px] tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-semibold sm:px-5">AY</th>
                <th className="px-2 py-2 text-right font-semibold">ADET</th>
                <th className="px-2 py-2 text-right font-semibold">FATURALANAN</th>
                <th className="px-2 py-2 text-right font-semibold">SAYILAN</th>
                <th className="border-r px-2 py-2 text-right font-semibold">KALAN</th>
                <th className="px-2 py-2 text-right font-semibold">TAHSİLAT</th>
                <th className="px-2 py-2 text-right font-semibold">ÖDEME</th>
                <th className="px-4 py-2 text-right font-semibold sm:px-5">NET NAKİT</th>
              </tr>
            </thead>
            <tbody>
              {r.aylik.map((a) => (
                <tr key={a.tarih} className="border-b last:border-0 hover:bg-muted/50" data-testid={`row-ay-${a.ay}`}>
                  <td className="px-4 py-2 font-semibold sm:px-5">{a.ayAd}</td>
                  <td className="px-2 py-2 text-right text-muted-foreground">{a.sayi}</td>
                  <td className="px-2 py-2 text-right font-semibold">{fmtPara(a.faturalanan, pb)}</td>
                  <td className="px-2 py-2 text-right">{fmtPara(a.faturayaSayilan, pb)}</td>
                  <td className="border-r px-2 py-2 text-right" style={{ color: a.kalan > 0 ? RENK.kalan : undefined }}>{fmtPara(a.kalan, pb)}</td>
                  <td className="px-2 py-2 text-right">{fmtPara(a.tahsilat, pb)}</td>
                  <td className="px-2 py-2 text-right">{fmtPara(a.odeme, pb)}</td>
                  <td className="px-4 py-2 text-right font-semibold sm:px-5" style={{ color: a.netNakit < 0 ? RENK.odeme : undefined }}>{fmtPara(a.netNakit, pb)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1fr_2fr]">
        <Panel baslik="Durum dağılımı" alt="Geçerli faturalar, taslak ve iptal hariç" sag={<CsvButon onClick={durumCsv} disabled={!r.durumlar.length} testId="button-csv-durum" />}>
          {r.durumlar.length === 0 ? <Bos baslik="Bu dönemde fatura yok" /> : (
            <ul className="space-y-3">
              {[...r.durumlar].sort((x, y) => y.tutar - x.tutar).map((d) => {
                const yuzde = oran(d.tutar, o.toplamFatura);
                return (
                  <li key={d.durum} className="space-y-1.5" data-testid={`row-durum-${d.durum}`}>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-semibold">{DURUM_ETIKET[d.durum] ?? d.durum} <span className="font-normal text-muted-foreground">{d.sayi} fatura</span></span>
                      <span className="tabular-nums">{fmtPara(d.tutar, pb)} <span className="text-muted-foreground">%{yuzde.toFixed(1)}</span></span>
                    </div>
                    <OranCubugu deger={yuzde} renk={DURUM_RENK[d.durum] ?? "#979797"} />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel baslik="Fatura dökümü" alt={`${r.faturalar.length} fatura. Rakamların kaynağı bu satırlardır.`} sag={<CsvButon onClick={faturaCsv} disabled={!r.faturalar.length} testId="button-csv-faturalar" />}>
          {r.faturalar.length === 0 ? <Bos baslik="Fatura bulunamadı" aciklama="Filtreleri değiştirerek farklı bir dönem veya para birimi deneyin." /> : (
            <>
              <div className="-mx-4 max-h-[420px] overflow-auto sm:-mx-5">
                <table className="w-full min-w-[640px] text-xs tabular-nums">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b text-left text-[10px] tracking-wider text-muted-foreground">
                      <th className="px-4 py-2 font-semibold sm:px-5">FATURA</th>
                      <th className="px-2 py-2 font-semibold">MÜŞTERİ VE GEMİ</th>
                      <th className="px-2 py-2 text-right font-semibold">TOPLAM</th>
                      <th className="px-2 py-2 text-right font-semibold">SAYILAN</th>
                      <th className="px-4 py-2 text-right font-semibold sm:px-5">KALAN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faturalar.map((f) => (
                      <tr key={f.id} className="border-b last:border-0 hover:bg-muted/50" data-testid={`row-fatura-${f.id}`}>
                        <td className="px-4 py-2 sm:px-5">
                          <p className="font-mono font-semibold">{f.faturaNo}</p>
                          <p className="text-[11px] text-muted-foreground">{fmtTarih(f.faturaTarihi)} · {DURUM_ETIKET[f.durum] ?? f.durum}</p>
                        </td>
                        <td className="max-w-[220px] px-2 py-2">
                          <p className="truncate">{f.bagliFirmaAd ?? "Müşteri yok"}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{f.gemiAd ?? "Gemi atanmamış"}</p>
                        </td>
                        <td className="px-2 py-2 text-right font-semibold">{fmtPara(f.genelToplam, f.paraBirimi)}</td>
                        <td className="px-2 py-2 text-right">{fmtPara(f.odenenTutar, f.paraBirimi)}</td>
                        <td className="px-4 py-2 text-right sm:px-5" style={{ color: f.kalanTutar > 0 ? RENK.kalan : undefined }}>{fmtPara(f.kalanTutar, f.paraBirimi)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {r.faturalar.length > 25 && (
                <Button variant="ghost" size="sm" className="mt-3 w-full text-xs" onClick={() => setTumFaturalar((v) => !v)} data-testid="button-tum-faturalar">
                  {tumFaturalar ? "İlk 25 faturayı göster" : `Tüm ${r.faturalar.length} faturayı göster`}
                </Button>
              )}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
