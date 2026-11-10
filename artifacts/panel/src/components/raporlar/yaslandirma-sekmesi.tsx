import type { RaporYaslandirma } from "@workspace/api-client-react";
import { Panel, CsvButon, Bos, Not } from "./rapor-ortak";
import { DURUM_ETIKET, fmtPara, fmtTarih, oran, csvIndir, dosyaAdi, buyukHarf, type RaporBaglam } from "@/lib/rapor-bicim";

const DILIM_RENK = ["#61A9BD", "#CED14E", "#E98E2E", "#D8524F", "#973130", "#684736"];

export function YaslandirmaSekmesi({ dilimler, b }: { dilimler: RaporYaslandirma[]; b: RaporBaglam }) {
  const pb = b.paraBirimi;
  const toplam = dilimler.reduce((s, d) => s + d.kalan, 0);
  const adet = dilimler.reduce((s, d) => s + d.faturaSayisi, 0);

  const csv = () => csvIndir(
    ["Dilim", "Fatura no", "Fatura tarihi", "Vade", "Müşteri", "Gemi", "Durum", "Para birimi", "Genel toplam", "Faturaya sayılan", "Kalan"],
    dilimler.flatMap((d) => d.faturalar.map((f) => [d.etiket, f.faturaNo, f.faturaTarihi, f.vadeTarihi, f.bagliFirmaAd, f.gemiAd, DURUM_ETIKET[f.durum] ?? f.durum, f.paraBirimi, f.genelToplam, f.odenenTutar, f.kalanTutar])),
    dosyaAdi("yaslandirma", b),
  );

  return (
    <div className="space-y-5">
      <Not>Seçili dönemde kesilen faturaların <strong>bugün</strong> açık kalan tutarı, vadesine göre dilimlenmiştir. Vadesi henüz gelmemiş faturalar da dahildir.</Not>

      <Panel
        baslik="Kalan alacak yaşı"
        alt={`${adet} açık fatura, toplam ${fmtPara(toplam, pb)}`}
        sag={<CsvButon onClick={csv} disabled={adet === 0} testId="button-csv-yaslandirma" />}
      >
        {toplam <= 0 ? <Bos baslik="Açık alacak yok" aciklama="Bu dönemin tüm faturaları kapanmış görünüyor." /> : (
          <>
            <div className="flex h-8 w-full overflow-hidden" role="img" aria-label="Yaşlandırma dilimlerinin toplam içindeki payı">
              {dilimler.map((d, i) => d.kalan > 0 && (
                <div key={d.etiket} style={{ flexGrow: d.kalan, background: DILIM_RENK[i % DILIM_RENK.length] }} title={`${d.etiket} ${fmtPara(d.kalan, pb)}`} />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
              {dilimler.map((d, i) => (
                <div key={d.etiket} className="bg-card p-3" data-testid={`card-dilim-${i}`}>
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground">
                    <i className="h-2 w-2" style={{ background: DILIM_RENK[i % DILIM_RENK.length] }} />{buyukHarf(d.etiket)}
                  </p>
                  <p className="mt-1.5 text-sm font-bold tabular-nums">{fmtPara(d.kalan, pb)}</p>
                  <p className="text-[11px] text-muted-foreground">{d.faturaSayisi} fatura · %{oran(d.kalan, toplam).toFixed(1)}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>

      {dilimler.filter((d) => d.faturalar.length > 0).map((d) => {
        const i = dilimler.indexOf(d);
        return (
          <Panel key={d.etiket} baslik={d.etiket} alt={`${d.faturaSayisi} fatura, ${fmtPara(d.kalan, pb)} açık`}>
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <table className="w-full min-w-[600px] text-xs tabular-nums">
                <thead>
                  <tr className="border-b text-left text-[10px] tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 font-semibold sm:px-5">FATURA</th>
                    <th className="px-2 py-2 font-semibold">MÜŞTERİ VE GEMİ</th>
                    <th className="px-2 py-2 font-semibold">VADE</th>
                    <th className="px-2 py-2 text-right font-semibold">TOPLAM</th>
                    <th className="px-4 py-2 text-right font-semibold sm:px-5">KALAN</th>
                  </tr>
                </thead>
                <tbody>
                  {d.faturalar.map((f) => (
                    <tr key={f.id} className="border-b last:border-0 hover:bg-muted/50" data-testid={`row-yas-fatura-${f.id}`}>
                      <td className="px-4 py-2 font-mono font-semibold sm:px-5">{f.faturaNo}</td>
                      <td className="max-w-[220px] px-2 py-2">
                        <p className="truncate">{f.bagliFirmaAd ?? "Müşteri yok"}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{f.gemiAd ?? "Gemi atanmamış"}</p>
                      </td>
                      <td className="px-2 py-2">{fmtTarih(f.vadeTarihi)}</td>
                      <td className="px-2 py-2 text-right text-muted-foreground">{fmtPara(f.genelToplam, f.paraBirimi)}</td>
                      <td className="px-4 py-2 text-right font-semibold sm:px-5" style={{ color: DILIM_RENK[i % DILIM_RENK.length] }}>{fmtPara(f.kalanTutar, f.paraBirimi)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
