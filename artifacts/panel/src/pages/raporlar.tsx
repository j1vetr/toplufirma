import { useState } from "react";
import {
  useGetKdvOzeti, getGetKdvOzetiQueryKey,
  useGetAlacakYaslandirma, getGetAlacakYaslandirmaQueryKey,
  useListSirketler, getListSirketlerQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

const DURUM_RENK: Record<string, string> = {
  acik: "bg-orange-500/10 text-orange-600",
  kismi_odendi: "bg-yellow-500/10 text-yellow-600",
  odendi: "bg-green-500/10 text-green-600",
  iptal: "bg-gray-500/10 text-gray-500",
};

const YILLAR = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));
const AYLAR = ["", "Ocak","Subat","Mart","Nisan","Mayis","Haziran","Temmuz","Agustos","Eylul","Ekim","Kasim","Aralik"];

const DILIM_RENKLERI = ["#22c55e", "#f59e0b", "#f97316", "#ef4444"];

export default function Raporlar() {
  const [sirketId, setSirketId] = useState("");
  const [yil, setYil] = useState(String(new Date().getFullYear()));
  const [ay, setAy] = useState("");

  const { data: sirketler = [] } = useListSirketler({ query: { queryKey: getListSirketlerQueryKey() } });
  const { data: kdvOzeti, isLoading: kdvYukleniyor } = useGetKdvOzeti({ query: { queryKey: getGetKdvOzetiQueryKey() } });
  const { data: yaslandirma, isLoading: yasYukleniyor } = useGetAlacakYaslandirma({ query: { queryKey: getGetAlacakYaslandirmaQueryKey() } });

  const grafigVerisi = yaslandirma?.dilimler?.map(d => ({
    etiket: d.etiket,
    tutar: d.toplamTutar,
    sayi: d.faturaSayisi,
  })) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex gap-3 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">Sirket</Label>
          <Select value={sirketId} onValueChange={setSirketId}>
            <SelectTrigger className="w-48" data-testid="select-rapor-sirket"><SelectValue placeholder="Tum Sirketler" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tum Sirketler</SelectItem>
              {sirketler.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.ad}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Yil</Label>
          <Select value={yil} onValueChange={setYil}>
            <SelectTrigger className="w-28" data-testid="select-rapor-yil"><SelectValue /></SelectTrigger>
            <SelectContent>{YILLAR.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ay (opsiyonel)</Label>
          <Select value={ay} onValueChange={setAy}>
            <SelectTrigger className="w-36" data-testid="select-rapor-ay"><SelectValue placeholder="Tum Aylar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tum Aylar</SelectItem>
              {AYLAR.slice(1).map((a, i) => <SelectItem key={i+1} value={String(i+1)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="kdv">
        <TabsList className="rounded-full">
          <TabsTrigger value="kdv" className="rounded-full">KDV Ozeti</TabsTrigger>
          <TabsTrigger value="yaslandirma" className="rounded-full">Alacak Yaslandirma</TabsTrigger>
        </TabsList>

        <TabsContent value="kdv" className="mt-6">
          {kdvYukleniyor ? (
            <div className="animate-pulse space-y-3">{[1,2].map(i => <div key={i} className="h-20 bg-muted rounded-lg" />)}</div>
          ) : kdvOzeti ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  ["KDV Haric Toplam", kdvOzeti.kdvHaricToplam],
                  ["KDV Tutari", kdvOzeti.kdvTutariToplam],
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
                  <CardHeader><CardTitle className="text-base">Para Birimi Kirilimi</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {kdvOzeti.paraBirimiKirilim.map(p => (
                        <div key={p.paraBirimi} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                          <span className="font-mono font-bold">{p.paraBirimi}</span>
                          <div className="text-right space-y-0.5">
                            <p>KDV Haric: {fmt(p.kdvHaric, p.paraBirimi)}</p>
                            <p>KDV: {fmt(p.kdvTutari, p.paraBirimi)}</p>
                            <p className="font-bold">KDV Dahil: {fmt(p.kdvDahil, p.paraBirimi)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {kdvOzeti.sirketKirilim && kdvOzeti.sirketKirilim.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Sirket Kirilimi</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {kdvOzeti.sirketKirilim.map(s => (
                        <div key={s.sirketId} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                          <span className="font-medium">{s.sirketAd}</span>
                          <div className="text-right">
                            <p>KDV: {fmt(s.kdvTutari)}</p>
                            <p className="font-bold">Toplam: {fmt(s.kdvDahil)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : <div className="text-center text-muted-foreground py-16">Veri bulunamadi.</div>}
        </TabsContent>

        <TabsContent value="yaslandirma" className="mt-6">
          {yasYukleniyor ? (
            <div className="animate-pulse space-y-3">{[1,2].map(i => <div key={i} className="h-20 bg-muted rounded-lg" />)}</div>
          ) : yaslandirma?.dilimler ? (
            <div className="space-y-6">
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
                <CardHeader><CardTitle className="text-base">Yaslandirma Grafiği</CardTitle></CardHeader>
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
                  <CardHeader><CardTitle className="text-base">{d.etiket} Faturalar</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {d.faturalar.slice(0, 5).map(f => (
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
          ) : <div className="text-center text-muted-foreground py-16">Veri bulunamadi.</div>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
