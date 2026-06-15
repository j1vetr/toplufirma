import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetDashboardOzet, getGetDashboardOzetQueryKey } from "@workspace/api-client-react";
import { FileText, Wallet, AlertCircle, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const { data: ozet, isLoading } = useGetDashboardOzet({ query: { queryKey: getGetDashboardOzetQueryKey() } });

  if (isLoading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-32 bg-muted rounded-xl"></div>
      <div className="h-64 bg-muted rounded-xl"></div>
    </div>;
  }

  const kpis = [
    {
      title: "Toplam Alacak",
      value: new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD' }).format(ozet?.toplamAlacak || 0),
      icon: TrendingUp,
      color: "text-blue-500",
      bg: "bg-blue-500/10"
    },
    {
      title: "Toplam Tahsilat",
      value: new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD' }).format(ozet?.toplamTahsilat || 0),
      icon: Wallet,
      color: "text-green-500",
      bg: "bg-green-500/10"
    },
    {
      title: "Açık Faturalar",
      value: ozet?.toplamFaturaSayisi || 0,
      icon: FileText,
      color: "text-orange-500",
      bg: "bg-orange-500/10"
    },
    {
      title: "Vadesi Yaklaşan",
      value: ozet?.vadesYaklasiyor || 0,
      icon: AlertCircle,
      color: "text-red-500",
      bg: "bg-red-500/10"
    }
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, i) => (
          <Card key={i} className="border-none shadow-sm bg-card hover:shadow-md transition-shadow">
            <CardContent className="p-6 flex items-center space-x-4">
              <div className={`p-4 rounded-full ${kpi.bg}`}>
                <kpi.icon className={`h-6 w-6 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{kpi.title}</p>
                <h3 className="text-2xl font-display font-semibold mt-1">{kpi.value}</h3>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle className="font-display">Son İşlemler</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground py-8 text-center">
              Yakında: Aylık gelir grafiği ve son işlemler akışı eklenecek.
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="font-display">Para Birimi Dağılımı</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {ozet?.paraBirimiOzetleri?.map((pb, i) => (
                <div key={i} className="flex justify-between items-center border-b pb-2 last:border-0">
                  <span className="font-medium">{pb.paraBirimi}</span>
                  <span className="text-muted-foreground">
                    {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: pb.paraBirimi }).format(pb.kalanBakiye)}
                  </span>
                </div>
              ))}
              {(!ozet?.paraBirimiOzetleri || ozet.paraBirimiOzetleri.length === 0) && (
                <div className="text-sm text-muted-foreground text-center py-4">Veri bulunamadı.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
