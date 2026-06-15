import { useRoute } from "wouter";
import { Link } from "wouter";
import { useGetBankaHesabi, getGetBankaHesabiQueryKey, useGetBankaHesabiHareketleri, getGetBankaHesabiHareketleriQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";

const fmt = (n: number, pb = "TRY") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

export default function BankaHesabiDetay() {
  const [, params] = useRoute("/banka-hesaplari/:id");
  const id = Number(params?.id);
  const { data: hesap, isLoading } = useGetBankaHesabi(id, { query: { enabled: !!id, queryKey: getGetBankaHesabiQueryKey(id) } });
  const { data: hareketler } = useGetBankaHesabiHareketleri(id, { query: { enabled: !!id, queryKey: getGetBankaHesabiHareketleriQueryKey(id) } });

  if (isLoading) return <div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded-xl" /><div className="h-64 bg-muted rounded-xl" /></div>;
  if (!hesap) return <div className="text-center py-16 text-muted-foreground">Hesap bulunamadi.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/banka-hesaplari"><Button variant="ghost" size="icon" className="rounded-full"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h2 className="text-xl font-display font-semibold">{hesap.bankaAdi} - {hesap.hesapAdi}</h2>
          <p className="text-sm text-muted-foreground">{hesap.sirketAd}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-2xl font-display font-bold">{fmt(hesap.bakiye ?? 0, hesap.paraBirimi)}</p>
          <p className="text-xs text-muted-foreground">Guncel Bakiye</p>
        </div>
      </div>

      {hareketler && (
        <div className="grid grid-cols-2 gap-4">
          <Card><CardContent className="p-5 flex items-center gap-3">
            <div className="p-3 rounded-full bg-green-500/10"><TrendingUp className="h-5 w-5 text-green-500" /></div>
            <div><p className="text-xs text-muted-foreground">Toplam Gelen</p><p className="text-xl font-display font-bold">{fmt(hareketler.toplamGelen, hesap.paraBirimi)}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-5 flex items-center gap-3">
            <div className="p-3 rounded-full bg-red-500/10"><TrendingDown className="h-5 w-5 text-red-500" /></div>
            <div><p className="text-xs text-muted-foreground">Toplam Giden</p><p className="text-xl font-display font-bold">{fmt(hareketler.toplamGiden, hesap.paraBirimi)}</p></div>
          </CardContent></Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Hareket Listesi</CardTitle></CardHeader>
        <CardContent>
          {hareketler?.hareketler && hareketler.hareketler.length > 0 ? (
            <div className="space-y-1">
              {hareketler.hareketler.map(h => (
                <div key={h.id} className="flex items-center justify-between py-3 border-b last:border-0 text-sm">
                  <div>
                    <span className="font-medium">{h.aciklama ?? (h.tip === "tahsilat" ? "Tahsilat" : "Odeme")}</span>
                    <p className="text-xs text-muted-foreground">{h.tarih}</p>
                  </div>
                  <span className={`font-semibold ${h.tip === "tahsilat" ? "text-green-600" : "text-red-500"}`}>
                    {h.tip === "tahsilat" ? "+" : "-"}{fmt(h.tutar, h.paraBirimi)}
                  </span>
                </div>
              ))}
            </div>
          ) : <p className="text-center text-muted-foreground py-8">Hareket bulunmuyor.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
