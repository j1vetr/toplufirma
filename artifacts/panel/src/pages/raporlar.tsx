import { useState } from "react";
import {
  useGetKdvOzeti, getGetKdvOzetiQueryKey,
  useGetAlacakYaslandirma, getGetAlacakYaslandirmaQueryKey,
  useListFirmalar, getListFirmalarQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Download } from "lucide-react";
import { useSirket } from "@/contexts/sirket-context";

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

const DURUM_RENK: Record<string, string> = {
  taslak: "bg-slate-500/10 text-slate-500",
  acik: "bg-orange-500/10 text-orange-600",
  kismi_odendi: "bg-yellow-500/10 text-yellow-600",
  odendi: "bg-green-500/10 text-green-600",
  iptal: "bg-gray-500/10 text-gray-500",
};

const YILLAR = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));
const AYLAR = ["", "Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

const DILIM_RENKLERI = ["#22c55e", "#f59e0b", "#f97316", "#ef4444"];

function csvIndir(veriler: Record<string, unknown>[], dosyaAdi: string) {
  if (!veriler || veriler.length === 0) return;
  const satirlar = veriler.map(row =>
    Object.values(row).map(v => (typeof v === "string" && v.includes(",") ? `"${v}"` : String(v ?? ""))).join(",")
  );
  const ust = Object.keys(veriler[0]).join(",");
  const blob = new Blob([[ust, ...satirlar].join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = dosyaAdi; a.click();
  URL.revokeObjectURL(url);
}

export default function Raporlar() {
  const { aktifSirketId } = useSirket();
  const [catiFirmaId, setCatiFirmaId] = useState(aktifSirketId ? String(aktifSirketId) : "");
  const [yil, setYil] = useState(String(new Date().getFullYear()));
  const [ay, setAy] = useState("");

  const { data: catiFirmalar = [] } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );

  const catiFirmaIdNum = catiFirmaId && catiFirmaId !== "all" ? Number(catiFirmaId) : undefined;
  const kdvParams = {
    ...(catiFirmaIdNum && { catiFirmaId: catiFirmaIdNum }),
    ...(yil && { yil: Number(yil) }),
    ...(ay && ay !== "all" && { ay: Number(ay) }),
  };
  const yasParams = {
    ...(catiFirmaIdNum && { catiFirmaId: catiFirmaIdNum }),
  };

  const { data: kdvOzeti, isLoading: kdvYukleniyor } = useGetKdvOzeti(kdvParams, {
    query: { queryKey: [...getGetKdvOzetiQueryKey(), catiFirmaId, yil, ay] },
  });
  const { data: yaslandirma, isLoading: yasYukleniyor } = useGetAlacakYaslandirma(yasParams, {
    query: { queryKey: [...getGetAlacakYaslandirmaQueryKey(), catiFirmaId] },
  });

  const grafigVerisi = yaslandirma?.dilimler?.map(d => ({
    etiket: d.etiket,
    tutar: d.toplamTutar,
    sayi: d.faturaSayisi,
  })) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex gap-3 flex-wrap items-end">
        <div className="space-y-1">
          <Label className="text-xs">Çatı Firma</Label>
          <Select value={catiFirmaId || "all"} onValueChange={v => setCatiFirmaId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-52" data-testid="select-rapor-sirket"><SelectValue placeholder="Tüm Firmalar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Firmalar</SelectItem>
              {catiFirmalar.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.ad}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Yıl</Label>
          <Select value={yil} onValueChange={setYil}>
            <SelectTrigger className="w-28" data-testid="select-rapor-yil"><SelectValue /></SelectTrigger>
            <SelectContent>{YILLAR.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ay (opsiyonel)</Label>
          <Select value={ay || "all"} onValueChange={v => setAy(v === "all" ? "" : v)}>
            <SelectTrigger className="w-36" data-testid="select-rapor-ay"><SelectValue placeholder="Tüm Aylar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Aylar</SelectItem>
              {AYLAR.slice(1).map((a, i) => <SelectItem key={i+1} value={String(i+1)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="kdv">
        <TabsList className="rounded-full">
          <TabsTrigger value="kdv" className="rounded-full">KDV Özeti</TabsTrigger>
          <TabsTrigger value="yaslandirma" className="rounded-full">Alacak Yaşlandırma</TabsTrigger>
        </TabsList>

        <TabsContent value="kdv" className="mt-6">
          {kdvYukleniyor ? (
            <div className="animate-pulse space-y-3">{[1,2].map(i => <div key={i} className="h-20 bg-muted rounded-lg" />)}</div>
          ) : kdvOzeti ? (
            <div className="space-y-6">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => csvIndir([
                  { "KDV Haric": kdvOzeti.kdvHaricToplam, "KDV Tutari": kdvOzeti.kdvTutariToplam, "KDV Dahil": kdvOzeti.kdvDahilToplam }
                ], `kdv-ozeti-${yil}${ay ? "-" + ay : ""}.csv`)}>
                  <Download className="mr-2 h-4 w-4" /> CSV İndir
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  ["KDV Hariç Toplam", kdvOzeti.kdvHaricToplam],
                  ["KDV Tutarı", kdvOzeti.kdvTutariToplam],
                  ["KDV Dahil Toplam", kdvOzeti.kdvDahilToplam],
                ].map(([etiket, deger]) => (
                  <Card key={etiket as string}>
                    <CardContent className="p-5">
                      <p className="text-sm text-muted-foreground">{etiket}</p>
                      <p className="text-2xl font-display font-bold mt-1">{fmt(deger as number)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {kdvOzeti.paraBirimiKirilim && kdvOzeti.paraBirimiKirilim.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Para Birimi Kırılımı</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {kdvOzeti.paraBirimiKirilim.map(p => (
                        <div key={p.paraBirimi} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                          <span className="font-mono font-bold">{p.paraBirimi}</span>
                          <div className="text-right space-y-0.5">
                            <p>KDV Hariç: {fmt(p.kdvHaric, p.paraBirimi)}</p>
                            <p>KDV: {fmt(p.kdvTutari, p.paraBirimi)}</p>
                            <p className="font-bold">KDV Dahil: {fmt(p.kdvDahil, p.paraBirimi)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {kdvOzeti.firmaKirilim && kdvOzeti.firmaKirilim.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Firma Kırılımı</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {kdvOzeti.firmaKirilim.map(f => (
                        <div key={f.catiFirmaId} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                          <span className="font-medium">{f.catiFirmaAd}</span>
                          <div className="text-right">
                            <p>KDV: {fmt(f.kdvTutari)}</p>
                            <p className="font-bold">Toplam: {fmt(f.kdvDahil)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : <div className="text-center text-muted-foreground py-16">Veri bulunamadı.</div>}
        </TabsContent>

        <TabsContent value="yaslandirma" className="mt-6">
          {yasYukleniyor ? (
            <div className="animate-pulse space-y-3">{[1,2].map(i => <div key={i} className="h-20 bg-muted rounded-lg" />)}</div>
          ) : yaslandirma?.dilimler ? (
            <div className="space-y-6">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => {
                  const rows = yaslandirma.dilimler?.flatMap(d =>
                    (d.faturalar ?? []).map(f => ({ dilim: d.etiket, faturaNo: f.faturaNo, durum: f.durum, vade: f.vadeTarihi, tutar: f.genelToplam, pb: f.paraBirimi }))
                  ) ?? [];
                  csvIndir(rows, "alacak-yaslandirma.csv");
                }}>
                  <Download className="mr-2 h-4 w-4" /> CSV İndir
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {yaslandirma.dilimler.map((d, i) => (
                  <Card key={d.etiket}>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">{d.etiket}</p>
                      <p className="text-xl font-display font-bold mt-1" style={{ color: DILIM_RENKLERI[i] }}>{fmt(d.toplamTutar)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{d.faturaSayisi} fatura</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base">Yaşlandırma Grafiği</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={grafigVerisi} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="etiket" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v) => [fmt(Number(v)), "Tutar"]} />
                      <Bar dataKey="tutar" radius={[4, 4, 0, 0]}>
                        {grafigVerisi.map((_, i) => <Cell key={i} fill={DILIM_RENKLERI[i]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {yaslandirma.dilimler.map(d => d.faturalar && d.faturalar.length > 0 && (
                <Card key={d.etiket}>
                  <CardHeader><CardTitle className="text-base">{d.etiket} — Faturalar</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {d.faturalar.slice(0, 10).map(f => (
                        <div key={f.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                          <div>
                            <p className="font-medium">{f.faturaNo}</p>
                            <p className="text-xs text-muted-foreground">Vade: {f.vadeTarihi}</p>
                          </div>
                          <div className="text-right">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${DURUM_RENK[f.durum]}`}>{f.durum}</span>
                            <p className="font-semibold mt-1">{fmt(f.genelToplam, f.paraBirimi)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : <div className="text-center text-muted-foreground py-16">Veri bulunamadı.</div>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
