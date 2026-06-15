import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useGetDashboardOzet, getGetDashboardOzetQueryKey,
  useGetSonIslemler, getGetSonIslemlerQueryKey,
  useGetAylikGelir, getGetAylikGelirQueryKey,
  useGetYenilemeyeYaklasanPlanlar, getGetYenilemeyeYaklasanPlanlarQueryKey,
} from "@workspace/api-client-react";
import { FileText, Wallet, AlertCircle, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useSirket } from "@/contexts/sirket-context";

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

const DURUM_RENK: Record<string, string> = {
  acik: "bg-orange-500/10 text-orange-600",
  kismi_odendi: "bg-yellow-500/10 text-yellow-600",
  odendi: "bg-green-500/10 text-green-600",
  iptal: "bg-gray-500/10 text-gray-500",
};
const DURUM_ETK: Record<string, string> = {
  acik: "Açık", kismi_odendi: "Kısmi", odendi: "Ödendi", iptal: "İptal",
};

export default function Dashboard() {
  const { aktifSirketId } = useSirket();
  const sirketParam = aktifSirketId ? { sirketId: aktifSirketId } : undefined;

  const { data: ozet, isLoading } = useGetDashboardOzet(
    sirketParam,
    { query: { queryKey: [...getGetDashboardOzetQueryKey(sirketParam), aktifSirketId] } },
  );
  const { data: aylikVeriler = [] } = useGetAylikGelir(
    sirketParam,
    { query: { queryKey: [...getGetAylikGelirQueryKey(sirketParam), aktifSirketId] } },
  );
  const { data: sonIslemler } = useGetSonIslemler(
    sirketParam,
    { query: { queryKey: [...getGetSonIslemlerQueryKey(sirketParam), aktifSirketId] } },
  );
  const { data: uyarilar = [] } = useGetYenilemeyeYaklasanPlanlar(
    sirketParam,
    { query: { queryKey: [...getGetYenilemeyeYaklasanPlanlarQueryKey(sirketParam), aktifSirketId] } },
  );

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted rounded-xl" />)}
        </div>
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  const kpis = [
    { title: "Toplam Alacak", value: fmt(ozet?.toplamAlacak ?? 0), icon: TrendingUp, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Toplam Tahsilat", value: fmt(ozet?.toplamTahsilat ?? 0), icon: Wallet, color: "text-green-500", bg: "bg-green-500/10" },
    { title: "Açık Faturalar", value: String(ozet?.toplamFaturaSayisi ?? 0), icon: FileText, color: "text-orange-500", bg: "bg-orange-500/10" },
    { title: "Vadesi Yaklaşan", value: String(ozet?.vadesYaklasiyor ?? 0), icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10" },
  ];

  const aktifAylar = (aylikVeriler as { toplamFatura?: number; toplamTahsilat?: number }[]).filter(
    a => (a.toplamFatura ?? 0) > 0 || (a.toplamTahsilat ?? 0) > 0
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="border-none shadow-sm bg-card hover:shadow-md transition-shadow">
            <CardContent className="p-5 flex items-center space-x-4">
              <div className={`p-4 rounded-full ${kpi.bg}`}>
                <kpi.icon className={`h-6 w-6 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{kpi.title}</p>
                <h3 className="text-2xl font-display font-semibold mt-0.5">{kpi.value}</h3>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {uyarilar.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {uyarilar.map((u) => (
            <div key={u.id} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-full border ${(u.kalanGun ?? 0) <= 7 ? "bg-red-500/10 border-red-200 text-red-600" : "bg-amber-500/10 border-amber-200 text-amber-700"}`}>
              <AlertTriangle className="h-4 w-4" />
              <span><strong>{u.gemiAd ?? u.planAdi}</strong> — {u.kalanGun ?? 0} gün kaldı</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-base">Aylık Fatura & Tahsilat ({new Date().getFullYear()})</CardTitle>
          </CardHeader>
          <CardContent>
            {aktifAylar.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={aylikVeriler as object[]} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="ayAd" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number, n: string) => [fmt(Number(v)), n === "toplamFatura" ? "Fatura" : "Tahsilat"]} />
                  <Legend formatter={(v: string) => v === "toplamFatura" ? "Fatura" : "Tahsilat"} />
                  <Bar dataKey="toplamFatura" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.7} />
                  <Bar dataKey="toplamTahsilat" fill="#22c55e" radius={[4, 4, 0, 0]} opacity={0.9} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                Bu yıl için henüz veri yok.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-base">Para Birimi Dağılımı</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {ozet?.paraBirimiOzetleri?.map((pb, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-mono font-bold">{pb.paraBirimi}</span>
                    <span className="text-green-600">{fmt(pb.toplamAlacak, pb.paraBirimi)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Tahsilat: {fmt(pb.toplamTahsilat, pb.paraBirimi)}</span>
                    <span className={pb.kalanBakiye < 0 ? "text-red-500" : ""}>
                      Kalan: {fmt(pb.kalanBakiye, pb.paraBirimi)}
                    </span>
                  </div>
                </div>
              ))}
              {(!ozet?.paraBirimiOzetleri || ozet.paraBirimiOzetleri.length === 0) && (
                <div className="text-sm text-muted-foreground text-center py-4">Veri bulunamadı.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {sonIslemler && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="font-display text-base">Son Faturalar</CardTitle>
              <Link href="/faturalar" className="text-xs text-primary hover:underline">Tümü →</Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {sonIslemler.sonFaturalar?.slice(0, 5).map((f) => (
                  <div key={f.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                    <div className="min-w-0">
                      <Link href={`/faturalar/${f.id}`} className="font-medium hover:text-primary truncate block">{f.faturaNo}</Link>
                      <p className="text-xs text-muted-foreground">{f.faturaTarihi}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${DURUM_RENK[f.durum] ?? ""}`}>{DURUM_ETK[f.durum] ?? f.durum}</span>
                      <span className="font-semibold">{fmt(f.genelToplam, f.paraBirimi)}</span>
                    </div>
                  </div>
                ))}
                {(!sonIslemler.sonFaturalar || sonIslemler.sonFaturalar.length === 0) && (
                  <p className="text-center text-muted-foreground text-sm py-4">Fatura yok.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="font-display text-base">Son Ödemeler</CardTitle>
              <Link href="/odemeler" className="text-xs text-primary hover:underline">Tümü →</Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {sonIslemler.sonOdemeler?.slice(0, 5).map((o) => (
                  <div key={o.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{o.aciklama ?? (o.tip === "tahsilat" ? "Tahsilat" : "Ödeme")}</p>
                      <p className="text-xs text-muted-foreground">{o.tarih}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {o.tip === "tahsilat"
                        ? <TrendingUp className="h-4 w-4 text-green-500" />
                        : <TrendingDown className="h-4 w-4 text-red-500" />}
                      <span className={`font-semibold ${o.tip === "tahsilat" ? "text-green-600" : "text-red-500"}`}>
                        {fmt(o.tutar, o.paraBirimi)}
                      </span>
                    </div>
                  </div>
                ))}
                {(!sonIslemler.sonOdemeler || sonIslemler.sonOdemeler.length === 0) && (
                  <p className="text-center text-muted-foreground text-sm py-4">Ödeme yok.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
