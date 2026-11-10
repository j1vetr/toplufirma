import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { RaporKirilim } from "@workspace/api-client-react";
import { Panel, Metrik, CsvButon, Bos, OranCubugu, Not } from "./rapor-ortak";
import { RENK, fmtKisa, fmtPara, oran, csvIndir, dosyaAdi, type RaporBaglam } from "@/lib/rapor-bicim";

interface Props {
  tur: "musteri" | "gemi";
  satirlar: RaporKirilim[];
  b: RaporBaglam;
}

export function KirilimSekmesi({ tur, satirlar, b }: Props) {
  const pb = b.paraBirimi;
  const ad = tur === "musteri" ? "Müşteri" : "Gemi";
  const sirali = [...satirlar].sort((x, y) => y.faturalanan - x.faturalanan);
  const toplam = sirali.reduce((s, r) => ({ f: s.f + r.faturalanan, k: s.k + r.karsilanan, kl: s.kl + r.kalan }), { f: 0, k: 0, kl: 0 });
  const ilk = sirali.slice(0, 10).map((r) => ({ ...r, kisa: r.ad.length > 16 ? r.ad.slice(0, 15) + "…" : r.ad }));

  const csv = () => csvIndir(
    tur === "gemi"
      ? ["Gemi", "IMO", "Fatura adedi", `Faturalanan (${pb})`, `Faturaya sayılan (${pb})`, `Kalan (${pb})`]
      : ["Müşteri", "Fatura adedi", `Faturalanan (${pb})`, `Faturaya sayılan (${pb})`, `Kalan (${pb})`],
    sirali.map((r) => tur === "gemi"
      ? [r.ad, r.imo ?? "", r.faturaSayisi, r.faturalanan, r.karsilanan, r.kalan]
      : [r.ad, r.faturaSayisi, r.faturalanan, r.karsilanan, r.kalan]),
    dosyaAdi(tur === "gemi" ? "gemi" : "musteri", b),
  );

  if (sirali.length === 0) {
    return <div className="border"><Bos baslik={`Bu dönemde ${ad.toLocaleLowerCase("tr-TR")} kırılımı yok`} aciklama="Seçili firma, dönem ve para biriminde geçerli fatura bulunmuyor." /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-px border bg-border lg:grid-cols-4">
        <Metrik etiket={tur === "musteri" ? "Faturalanan müşteri" : "Faturalanan gemi"} deger={String(sirali.filter((r) => r.id !== null).length)} alt={sirali.some((r) => r.id === null) ? "Atanmamış faturalar ayrı satırda" : undefined} />
        <Metrik etiket="Faturalanan" deger={fmtPara(toplam.f, pb)} renk={RENK.fatura} />
        <Metrik etiket="Faturaya sayılan" deger={fmtPara(toplam.k, pb)} renk={RENK.karsilanan} />
        <Metrik etiket="Kalan (bugün)" deger={fmtPara(toplam.kl, pb)} renk={RENK.kalan} />
      </div>

      <Not>Faturaya sayılan, bu faturalara bugüne kadar dağıtılmış ödemedir. Bu dönemde gelen nakit için Genel bakış sekmesindeki nakit tarafına bakın.</Not>

      <Panel baslik={`En çok faturalanan ${sirali.length > 10 ? "10 " : ""}${ad.toLocaleLowerCase("tr-TR")}`} alt="Çubuk boyu faturalanan tutardır. Mavi kapanmış, turuncu açık kısım.">
        <div style={{ height: Math.max(160, ilk.length * 34) }} role="img" aria-label={`${ad} bazında faturalanan ve kalan tutarlar`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ilk} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={fmtKisa} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="kisa" width={130} tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 2, fontSize: 12 }}
                labelFormatter={(_, p) => (p?.[0]?.payload as RaporKirilim | undefined)?.ad ?? ""}
                formatter={(v, n) => [fmtPara(Number(v), pb), n === "karsilanan" ? "Faturaya sayılan" : "Kalan"]}
              />
              <Bar dataKey="karsilanan" stackId="a" fill={RENK.karsilanan} isAnimationActive={false} />
              <Bar dataKey="kalan" stackId="a" fill={RENK.kalan} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel baslik={`${ad} tablosu`} alt={`${sirali.length} satır, ${pb} cinsinden`} sag={<CsvButon onClick={csv} testId={`button-csv-${tur}`} />}>
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[620px] text-xs tabular-nums">
            <thead>
              <tr className="border-b text-left text-[10px] tracking-wider text-muted-foreground">
                <th className="w-8 px-4 py-2 font-semibold sm:px-5">#</th>
                <th className="px-2 py-2 font-semibold">{tur === "musteri" ? "MÜŞTERİ" : "GEMİ"}</th>
                <th className="px-2 py-2 text-right font-semibold">ADET</th>
                <th className="px-2 py-2 text-right font-semibold">FATURALANAN</th>
                <th className="px-2 py-2 text-right font-semibold">SAYILAN</th>
                <th className="px-2 py-2 text-right font-semibold">KALAN</th>
                <th className="w-32 px-4 py-2 font-semibold sm:px-5">KAPANMA</th>
              </tr>
            </thead>
            <tbody>
              {sirali.map((r, i) => {
                const k = oran(r.karsilanan, r.faturalanan);
                return (
                  <tr key={r.id ?? `yok-${i}`} className="border-b last:border-0 hover:bg-muted/50" data-testid={`row-${tur}-${r.id ?? "yok"}`}>
                    <td className="px-4 py-2 text-muted-foreground sm:px-5">{i + 1}</td>
                    <td className="max-w-[240px] px-2 py-2">
                      <p className={`truncate font-semibold ${r.id === null ? "italic text-muted-foreground" : ""}`}>{r.ad}</p>
                      {r.imo && <p className="font-mono text-[11px] text-muted-foreground">IMO {r.imo}</p>}
                    </td>
                    <td className="px-2 py-2 text-right text-muted-foreground">{r.faturaSayisi}</td>
                    <td className="px-2 py-2 text-right font-semibold">{fmtPara(r.faturalanan, pb)}</td>
                    <td className="px-2 py-2 text-right">{fmtPara(r.karsilanan, pb)}</td>
                    <td className="px-2 py-2 text-right" style={{ color: r.kalan > 0 ? RENK.kalan : undefined }}>{fmtPara(r.kalan, pb)}</td>
                    <td className="px-4 py-2 sm:px-5">
                      <div className="flex items-center gap-2"><OranCubugu deger={k} renk={RENK.karsilanan} /><span className="w-9 text-right text-[11px] text-muted-foreground">%{k.toFixed(0)}</span></div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
