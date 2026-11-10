import {
  ResponsiveContainer, BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import type { RaporAy } from "@workspace/api-client-react";
import { RENK, fmtKisa, fmtPara } from "@/lib/rapor-bicim";

const eksen = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const zaman = (aylik: RaporAy[]) => aylik.map(a => ({ ...a, tarihMs: Date.parse(`${a.tarih}T00:00:00Z`) }));
const ayEtiketi = (ms: number) => new Date(ms).toLocaleDateString("tr-TR", { month: "short", timeZone: "UTC" });
const zamanAraligi = (veri: { tarihMs: number }[]): [number, number] => [
  (veri[0]?.tarihMs ?? 0) - 12 * 86400000,
  (veri[veri.length - 1]?.tarihMs ?? 0) + 12 * 86400000,
];

function Ipucu({ active, payload, label, pb, satirlar }: {
  active?: boolean; payload?: { payload: RaporAy }[]; label?: string | number; pb: string;
  satirlar: { anahtar: keyof RaporAy; ad: string; renk: string }[];
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="min-w-52 border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-bold">{typeof label === "number" ? new Date(label).toLocaleDateString("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" }) : label}</p>
      {satirlar.map((s) => (
        <div key={s.anahtar} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5"><i className="h-2 w-2" style={{ background: s.renk }} />{s.ad}</span>
          <span className="font-semibold tabular-nums">{fmtPara(Number(r[s.anahtar]), pb)}</span>
        </div>
      ))}
    </div>
  );
}

function Lejant({ ogeler }: { ogeler: { ad: string; renk: string; cizgi?: boolean }[] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {ogeler.map((o) => (
        <li key={o.ad} className="flex items-center gap-1.5">
          <i className={o.cizgi ? "h-[2px] w-3" : "h-2.5 w-2.5"} style={{ background: o.renk }} />{o.ad}
        </li>
      ))}
    </ul>
  );
}

export function FaturaGrafigi({ aylik, pb }: { aylik: RaporAy[]; pb: string }) {
  const veri = zaman(aylik);
  const satirlar = [
    { anahtar: "faturalanan" as const, ad: "Faturalanan", renk: RENK.fatura },
    { anahtar: "faturayaSayilan" as const, ad: "Faturaya sayılan", renk: RENK.karsilanan },
    { anahtar: "kalan" as const, ad: "Kalan alacak (bugün)", renk: RENK.kalan },
  ];
  return (
    <div>
      <Lejant ogeler={[{ ad: "Faturaya sayılan", renk: RENK.karsilanan }, { ad: "Kalan alacak", renk: RENK.kalan }]} />
      <div className="h-64" role="img" aria-label="Aylık faturalanan tutarın faturaya sayılan ve kalan olarak dağılımı">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={veri} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="tarihMs" type="number" scale="time" domain={zamanAraligi(veri)} ticks={veri.map(a => a.tarihMs)} tick={eksen} tickLine={false} axisLine={false} tickFormatter={ayEtiketi} />
            <YAxis tick={eksen} tickLine={false} axisLine={false} tickFormatter={fmtKisa} width={52} />
            <Tooltip cursor={{ fill: "hsl(var(--muted))" }} content={<Ipucu pb={pb} satirlar={satirlar} />} />
            <Bar dataKey="faturayaSayilan" stackId="f" fill={RENK.karsilanan} maxBarSize={36} isAnimationActive={false} />
            <Bar dataKey="kalan" stackId="f" fill={RENK.kalan} maxBarSize={36} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function NakitGrafigi({ aylik, pb }: { aylik: RaporAy[]; pb: string }) {
  const veri = zaman(aylik).map((a) => ({ ...a, odemeNeg: -a.odeme }));
  const satirlar = [
    { anahtar: "tahsilat" as const, ad: "Nakit tahsilat", renk: RENK.tahsilat },
    { anahtar: "odeme" as const, ad: "Nakit ödeme", renk: RENK.odeme },
    { anahtar: "netNakit" as const, ad: "Net nakit", renk: RENK.net },
  ];
  return (
    <div>
      <Lejant ogeler={[{ ad: "Tahsilat", renk: RENK.tahsilat }, { ad: "Ödeme", renk: RENK.odeme }, { ad: "Net nakit", renk: RENK.net, cizgi: true }]} />
      <div className="h-64" role="img" aria-label="Aylık nakit tahsilat, ödeme ve net nakit">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={veri} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} stackOffset="sign" barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="tarihMs" type="number" scale="time" domain={zamanAraligi(veri)} ticks={veri.map(a => a.tarihMs)} tick={eksen} tickLine={false} axisLine={false} tickFormatter={ayEtiketi} />
            <YAxis tick={eksen} tickLine={false} axisLine={false} tickFormatter={fmtKisa} width={52} />
            <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.4} />
            <Tooltip cursor={{ fill: "hsl(var(--muted))" }} content={<Ipucu pb={pb} satirlar={satirlar} />} />
            <Bar dataKey="tahsilat" stackId="n" fill={RENK.tahsilat} maxBarSize={36} isAnimationActive={false} />
            <Bar dataKey="odemeNeg" stackId="n" fill={RENK.odeme} maxBarSize={36} isAnimationActive={false} />
            <Line dataKey="netNakit" stroke={RENK.net} strokeWidth={2} dot={aylik.length < 10 ? { r: 2.5 } : false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
