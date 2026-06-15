import { useRoute } from "wouter";
import { Link } from "wouter";
import { useGetGemi, getGetGemiQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, HardDrive, FileText } from "lucide-react";

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

const DURUM_RENK: Record<string, string> = {
  taslak: "bg-slate-500/10 text-slate-500",
  acik: "bg-orange-500/10 text-orange-600",
  kismi_odendi: "bg-yellow-500/10 text-yellow-600",
  odendi: "bg-green-500/10 text-green-600",
  iptal: "bg-gray-500/10 text-gray-500",
};

export default function GemiDetay() {
  const [, params] = useRoute("/gemiler/:id");
  const id = Number(params?.id);
  const { data: gemi, isLoading } = useGetGemi(id, { query: { enabled: !!id, queryKey: getGetGemiQueryKey(id) } });

  if (isLoading) return <div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded-xl" /><div className="h-64 bg-muted rounded-xl" /></div>;
  if (!gemi) return <div className="text-center py-16 text-muted-foreground">Gemi bulunamadı.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/gemiler"><Button variant="ghost" size="icon" className="rounded-full"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h2 className="text-xl font-display font-semibold">{gemi.ad}</h2>
          <p className="text-sm text-muted-foreground">{gemi.firmaAd}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          {[
            ["IMO Numarası", gemi.imoNumarasi],
            ["Bayrak Devleti", gemi.bayrakDevleti],
            ["Bağlı Firma", gemi.firmaAd],
            ["Durum", gemi.aktif ? "Aktif" : "Pasif"],
          ].map(([etiket, deger]) => deger ? (
            <div key={etiket}><p className="text-muted-foreground">{etiket}</p><p className="font-medium mt-0.5">{deger}</p></div>
          ) : null)}
        </CardContent>
      </Card>

      <Tabs defaultValue="ekipmanlar">
        <TabsList className="rounded-full">
          <TabsTrigger value="ekipmanlar" className="rounded-full">Ekipmanlar</TabsTrigger>
          <TabsTrigger value="faturalar" className="rounded-full">Faturalar</TabsTrigger>
        </TabsList>

        <TabsContent value="ekipmanlar" className="mt-4">
          <Card>
            <CardContent className="p-4 space-y-2">
              {gemi.ekipmanlar && gemi.ekipmanlar.length > 0 ? gemi.ekipmanlar.map(e => (
                <div key={e.id} className="flex items-center gap-4 py-3 border-b last:border-0">
                  <div className="p-2 rounded-full bg-purple-500/10"><HardDrive className="h-4 w-4 text-purple-500" /></div>
                  <div className="flex-1">
                    <p className="font-medium">{e.tip}</p>
                    <p className="text-xs text-muted-foreground">Seri: {e.seriNo}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {e.garantiBitisTarihi && <p>Garanti: {e.garantiBitisTarihi}</p>}
                    <Badge variant={e.aktif ? "default" : "secondary"} className="mt-1">{e.aktif ? "Aktif" : "Pasif"}</Badge>
                  </div>
                </div>
              )) : <p className="text-center text-muted-foreground py-8">Ekipman kaydı yok.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="faturalar" className="mt-4">
          <Card>
            <CardContent className="p-4 space-y-2">
              {gemi.faturalar && gemi.faturalar.length > 0 ? gemi.faturalar.map(f => (
                <div key={f.id} className="flex items-center gap-4 py-3 border-b last:border-0 text-sm">
                  <div className="p-2 rounded-full bg-orange-500/10"><FileText className="h-4 w-4 text-orange-500" /></div>
                  <div className="flex-1">
                    <Link href={`/faturalar/${f.id}`} className="font-medium hover:text-primary">{f.faturaNo}</Link>
                    <p className="text-xs text-muted-foreground">{f.faturaTarihi}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${DURUM_RENK[f.durum]}`}>{f.durum}</span>
                    <p className="font-semibold mt-1">{fmt(f.genelToplam, f.paraBirimi)}</p>
                  </div>
                </div>
              )) : <p className="text-center text-muted-foreground py-8">Fatura kaydı yok.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
