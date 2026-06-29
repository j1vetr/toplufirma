import { useRoute } from "wouter";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useGetGemi, getGetGemiQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, HardDrive, FileText, Wrench } from "lucide-react";

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

const DURUM_RENK: Record<string, string> = {
  taslak: "bg-slate-500/10 text-slate-500",
  acik: "bg-orange-500/10 text-orange-600",
  kismi_odendi: "bg-yellow-500/10 text-yellow-600",
  odendi: "bg-green-500/10 text-green-600",
  iptal: "bg-gray-500/10 text-gray-500",
};

const KATEGORI_RENK: Record<string, string> = {
  servis: "bg-blue-100 text-blue-800",
  sozlesme: "bg-purple-100 text-purple-800",
  bakim: "bg-amber-100 text-amber-800",
  diger: "bg-gray-100 text-gray-700",
};

const KATEGORI_LABEL: Record<string, string> = {
  servis: "Servis",
  sozlesme: "Sözleşme",
  bakim: "Bakım",
  diger: "Diğer",
};

interface ServisKayit {
  id: number;
  kategori: string;
  baslik: string;
  tarih: string;
  notlar: string | null;
  dosyalar: { id: number }[];
}

const apiBase = () => `${import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""}/api`;
function getToken() { return localStorage.getItem("panel_token") ?? ""; }

export default function GemiDetay() {
  const [, params] = useRoute("/gemiler/:id");
  const id = Number(params?.id);
  const { data: gemi, isLoading } = useGetGemi(id, { query: { enabled: !!id, queryKey: getGetGemiQueryKey(id) } });

  const { data: servisKayitlari = [], isLoading: servisYukleniyor } = useQuery<ServisKayit[]>({
    queryKey: ["servis-kayitlari-gemi", id],
    queryFn: async () => {
      if (!id) return [];
      const r = await fetch(`${apiBase()}/servis-kayitlari?gemiId=${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!id,
    staleTime: 30_000,
  });

  if (isLoading) return <div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded-none" /><div className="h-64 bg-muted rounded-none" /></div>;
  if (!gemi) return <div className="text-center py-16 text-muted-foreground">Gemi bulunamadı.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/gemiler"><Button variant="ghost" size="icon" className="rounded-sm"><ArrowLeft className="h-4 w-4" /></Button></Link>
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
        <TabsList className="rounded-none">
          <TabsTrigger value="ekipmanlar" className="rounded-none">Ekipmanlar</TabsTrigger>
          <TabsTrigger value="faturalar" className="rounded-none">Faturalar</TabsTrigger>
          <TabsTrigger value="servis" className="rounded-none">
            Servis & Sözleşme
            {servisKayitlari.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 font-semibold">
                {servisKayitlari.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ekipmanlar" className="mt-4">
          <Card>
            <CardContent className="p-4 space-y-2">
              {gemi.ekipmanlar && gemi.ekipmanlar.length > 0 ? gemi.ekipmanlar.map(e => (
                <div key={e.id} className="flex items-center gap-4 py-3 border-b last:border-0">
                  <div className="p-2 rounded-sm bg-purple-500/10"><HardDrive className="h-4 w-4 text-purple-500" /></div>
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
                  <div className="p-2 rounded-sm bg-orange-500/10"><FileText className="h-4 w-4 text-orange-500" /></div>
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

        <TabsContent value="servis" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {servisYukleniyor ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-10 bg-muted rounded-none" />
                  <div className="h-10 bg-muted rounded-none" />
                </div>
              ) : servisKayitlari.length > 0 ? (
                <div className="divide-y">
                  {servisKayitlari.map(k => (
                    <div key={k.id} className="flex items-start gap-3 py-3">
                      <div className="p-2 rounded-sm bg-blue-500/10 shrink-0">
                        <Wrench className="h-4 w-4 text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 font-medium ${KATEGORI_RENK[k.kategori] ?? "bg-gray-100 text-gray-700"}`}>
                            {KATEGORI_LABEL[k.kategori] ?? k.kategori}
                          </span>
                          <span className="font-medium text-sm">{k.baslik}</span>
                          {k.dosyalar?.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              · {k.dosyalar.length} dosya
                            </span>
                          )}
                        </div>
                        {k.notlar && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{k.notlar}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{k.tarih}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10">
                  <Wrench className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Bu gemiye ait servis veya sözleşme kaydı yok.</p>
                  <Link href="/servis">
                    <Button variant="outline" size="sm" className="mt-3">
                      Servis sayfasına git
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
