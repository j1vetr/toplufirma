import { useRoute } from "wouter";
import { useGetCari, getGetCariQueryKey, useGetCariEkstre, getGetCariEkstreQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Ship, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

const DURUM_RENK: Record<string, string> = {
  acik: "bg-orange-500/10 text-orange-600",
  kismi_odendi: "bg-yellow-500/10 text-yellow-600",
  odendi: "bg-green-500/10 text-green-600",
  iptal: "bg-gray-500/10 text-gray-500",
};

export default function CariDetay() {
  const [, params] = useRoute("/cariler/:id");
  const id = Number(params?.id);

  const { data: cari, isLoading } = useGetCari(id, { query: { enabled: !!id, queryKey: getGetCariQueryKey(id) } });
  const { data: ekstre } = useGetCariEkstre(id, { query: { enabled: !!id, queryKey: getGetCariEkstreQueryKey(id) } });

  if (isLoading) return <div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded-xl" /><div className="h-64 bg-muted rounded-xl" /></div>;
  if (!cari) return <div className="text-center py-16 text-muted-foreground">Cari bulunamadi.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/cariler">
          <Button variant="ghost" size="icon" className="rounded-full"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h2 className="text-xl font-display font-semibold">{cari.ad}</h2>
          <p className="text-sm text-muted-foreground">{cari.sirketAd}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-5 flex items-center gap-3">
          <div className="p-3 rounded-full bg-red-500/10"><TrendingUp className="h-5 w-5 text-red-500" /></div>
          <div><p className="text-xs text-muted-foreground">Toplam Borc</p><p className="text-xl font-display font-bold">{fmt(cari.toplamBorc, cari.paraBirimi)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-5 flex items-center gap-3">
          <div className="p-3 rounded-full bg-green-500/10"><TrendingDown className="h-5 w-5 text-green-500" /></div>
          <div><p className="text-xs text-muted-foreground">Toplam Alacak</p><p className="text-xl font-display font-bold">{fmt(cari.toplamAlacak, cari.paraBirimi)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-5 flex items-center gap-3">
          <div className="p-3 rounded-full bg-blue-500/10"><Minus className="h-5 w-5 text-blue-500" /></div>
          <div><p className="text-xs text-muted-foreground">Kalan Bakiye</p><p className="text-xl font-display font-bold">{fmt(cari.kalanBakiye, cari.paraBirimi)}</p></div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="ekstre">
        <TabsList className="rounded-full">
          <TabsTrigger value="ekstre" className="rounded-full">Ekstre</TabsTrigger>
          <TabsTrigger value="faturalar" className="rounded-full">Acik Faturalar</TabsTrigger>
          <TabsTrigger value="gemiler" className="rounded-full">Gemiler</TabsTrigger>
          <TabsTrigger value="bilgiler" className="rounded-full">Bilgiler</TabsTrigger>
        </TabsList>

        <TabsContent value="ekstre" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Hesap Ekstresi</CardTitle></CardHeader>
            <CardContent>
              {ekstre?.kalemler && ekstre.kalemler.length > 0 ? (
                <div className="space-y-2">
                  {ekstre.kalemler.map((k, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                      <div>
                        <span className="font-medium">{k.aciklama ?? k.referansNo ?? "-"}</span>
                        <span className="ml-2 text-muted-foreground text-xs">{k.tarih}</span>
                      </div>
                      <div className="text-right">
                        {k.borc != null && <span className="text-red-500 font-medium">-{fmt(k.borc, k.paraBirimi)}</span>}
                        {k.alacak != null && <span className="text-green-500 font-medium">+{fmt(k.alacak, k.paraBirimi)}</span>}
                        <p className="text-xs text-muted-foreground">{fmt(k.bakiye, k.paraBirimi)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-center text-muted-foreground py-8">Hareket bulunmuyor.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="faturalar" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {cari.acikFaturalar && cari.acikFaturalar.length > 0 ? (
                <div className="space-y-2">
                  {cari.acikFaturalar.map(f => (
                    <div key={f.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                      <div>
                        <Link href={`/faturalar/${f.id}`} className="font-medium hover:text-primary">{f.faturaNo}</Link>
                        <p className="text-muted-foreground text-xs">{f.faturaTarihi}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${DURUM_RENK[f.durum]}`}>{f.durum}</span>
                        <p className="font-semibold mt-1">{fmt(f.genelToplam, f.paraBirimi)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-center text-muted-foreground py-8">Acik fatura yok.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gemiler" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {cari.bagliGemiler && cari.bagliGemiler.length > 0 ? (
                <div className="space-y-2">
                  {cari.bagliGemiler.map(g => (
                    <div key={g.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                      <div className="p-2 rounded-full bg-blue-500/10"><Ship className="h-4 w-4 text-blue-500" /></div>
                      <div>
                        <Link href={`/gemiler/${g.id}`} className="font-medium hover:text-primary">{g.ad}</Link>
                        {g.imoNumarasi && <p className="text-xs text-muted-foreground">IMO: {g.imoNumarasi}</p>}
                      </div>
                      <Badge variant={g.aktif ? "default" : "secondary"} className="ml-auto">{g.aktif ? "Aktif" : "Pasif"}</Badge>
                    </div>
                  ))}
                </div>
              ) : <p className="text-center text-muted-foreground py-8">Kayitli gemi yok.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bilgiler" className="mt-4">
          <Card>
            <CardContent className="p-4 grid grid-cols-2 gap-4 text-sm">
              {[
                ["Tip", cari.tip],
                ["Para Birimi", cari.paraBirimi],
                ["Vergi No", cari.vergiNo],
                ["Vergi Dairesi", cari.vergiDairesi],
                ["Telefon", cari.telefon],
                ["E-posta", cari.eposta],
                ["Yetkili Kisi", cari.yetkiliKisi],
                ["Adres", cari.adres],
              ].map(([etiket, deger]) => deger ? (
                <div key={etiket}>
                  <p className="text-muted-foreground">{etiket}</p>
                  <p className="font-medium">{deger}</p>
                </div>
              ) : null)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
