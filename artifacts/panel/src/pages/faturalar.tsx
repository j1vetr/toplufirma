import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListFaturalar, getListFaturalarQueryKey,
  useListSirketler, getListSirketlerQueryKey,
  useDeleteFatura,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, FileText, Search, ChevronRight, AlertCircle } from "lucide-react";

const DURUM_RENK: Record<string, string> = {
  acik: "bg-orange-500/10 text-orange-600",
  kismi_odendi: "bg-yellow-500/10 text-yellow-600",
  odendi: "bg-green-500/10 text-green-600",
  iptal: "bg-gray-500/10 text-gray-500",
};
const DURUM_ETIKET: Record<string, string> = {
  acik: "Acik", kismi_odendi: "Kismi Odendi", odendi: "Odendi", iptal: "Iptal",
};

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

export default function Faturalar() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [arama, setArama] = useState("");
  const [durumFiltre, setDurumFiltre] = useState("tumu");
  const [silId, setSilId] = useState<number | null>(null);

  const { data: faturalar = [], isLoading } = useListFaturalar({ query: { queryKey: getListFaturalarQueryKey() } });
  const { data: sirketler = [] } = useListSirketler({ query: { queryKey: getListSirketlerQueryKey() } });
  const deleteFatura = useDeleteFatura();

  const bugun = new Date().toISOString().split("T")[0];
  const filtrelenmis = faturalar.filter(f => {
    const aramaUyum = !arama || f.faturaNo?.toLowerCase().includes(arama.toLowerCase()) || f.cariAd?.toLowerCase().includes(arama.toLowerCase());
    const durumUyum = durumFiltre === "tumu" || f.durum === durumFiltre;
    return aramaUyum && durumUyum;
  });

  if (isLoading) return <div className="animate-pulse space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-muted rounded-lg" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Fatura no veya cari ara..." value={arama} onChange={e => setArama(e.target.value)} data-testid="input-fatura-ara" />
        </div>
        <Select value={durumFiltre} onValueChange={setDurumFiltre}>
          <SelectTrigger className="w-44" data-testid="select-fatura-durum">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tumu">Tum Durumlar</SelectItem>
            {Object.entries(DURUM_ETIKET).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Link href="/faturalar/yeni">
          <Button className="rounded-full" data-testid="button-fatura-yeni">
            <Plus className="mr-2 h-4 w-4" /> Yeni Fatura
          </Button>
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">{filtrelenmis.length} fatura</p>

      <div className="space-y-2">
        {filtrelenmis.map(f => {
          const vadesiGecmis = f.vadeTarihi < bugun && (f.durum === "acik" || f.durum === "kismi_odendi");
          return (
            <Card key={f.id} className={`hover:shadow-sm transition-shadow ${vadesiGecmis ? "border-red-300" : ""}`} data-testid={`card-fatura-${f.id}`}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`p-2 rounded-full ${vadesiGecmis ? "bg-red-500/10" : "bg-orange-500/10"}`}>
                  {vadesiGecmis ? <AlertCircle className="h-4 w-4 text-red-500" /> : <FileText className="h-4 w-4 text-orange-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/faturalar/${f.id}`} className="font-semibold hover:text-primary" data-testid={`link-fatura-${f.id}`}>{f.faturaNo}</Link>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DURUM_RENK[f.durum]}`}>{DURUM_ETIKET[f.durum]}</span>
                    {vadesiGecmis && <span className="text-xs text-red-500 font-medium">Vadesi Gecmis</span>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{f.cariAd} {f.gemiAd ? `- ${f.gemiAd}` : ""}</p>
                  <p className="text-xs text-muted-foreground">{f.faturaTarihi} - Vade: {f.vadeTarihi}</p>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  <p className="font-semibold">{fmt(f.genelToplam, f.paraBirimi)}</p>
                  {f.kalanTutar > 0 && f.durum !== "odendi" && (
                    <p className="text-xs text-muted-foreground">Kalan: {fmt(f.kalanTutar, f.paraBirimi)}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setSilId(f.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  <Link href={`/faturalar/${f.id}`}><Button size="icon" variant="ghost" className="h-8 w-8"><ChevronRight className="h-4 w-4" /></Button></Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtrelenmis.length === 0 && (
          <div className="text-center text-muted-foreground py-16">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Fatura bulunamadi.</p>
          </div>
        )}
      </div>

      <AlertDialog open={!!silId} onOpenChange={o => !o && setSilId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Faturay sil</AlertDialogTitle><AlertDialogDescription>Bu islem geri alinamaz.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Iptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (!silId) return; deleteFatura.mutate({ id: silId }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListFaturalarQueryKey() }); setSilId(null); toast({ title: "Fatura silindi" }); } }); }}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
