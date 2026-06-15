import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOdemeler, getListOdemelerQueryKey,
  useListSirketler, getListSirketlerQueryKey,
  useListCariler, getListCarilerQueryKey,
  useListBankaHesaplari, getListBankaHesaplariQueryKey,
  useCreateOdeme, useDeleteOdeme,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Wallet, TrendingUp, TrendingDown, Search } from "lucide-react";

const YONTEM_ETIKET: Record<string, string> = {
  banka_havalesi: "Banka Havalesi", eft: "EFT", nakit: "Nakit",
  kredi_karti: "Kredi Karti", wise: "Wise", paypal: "PayPal", diger: "Diger",
};

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

export default function Odemeler() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [arama, setArama] = useState("");
  const [tipFiltre, setTipFiltre] = useState("tumu");
  const [modalAcik, setModalAcik] = useState(false);
  const [silId, setSilId] = useState<number | null>(null);

  const [sirketId, setSirketId] = useState("");
  const [cariId, setCariId] = useState("");
  const [tip, setTip] = useState("tahsilat");
  const [tarih, setTarih] = useState(new Date().toISOString().split("T")[0]);
  const [tutar, setTutar] = useState("");
  const [paraBirimi, setParaBirimi] = useState("USD");
  const [yontem, setYontem] = useState("banka_havalesi");
  const [bankaId, setBankaId] = useState("");
  const [aciklama, setAciklama] = useState("");

  const { data: odemeler = [], isLoading } = useListOdemeler(undefined, { query: { queryKey: getListOdemelerQueryKey() } });
  const { data: sirketler = [] } = useListSirketler({ query: { queryKey: getListSirketlerQueryKey() } });
  const { data: cariler = [] } = useListCariler(undefined, { query: { queryKey: getListCarilerQueryKey() } });
  const { data: bankaHesaplari = [] } = useListBankaHesaplari(undefined, { query: { queryKey: getListBankaHesaplariQueryKey() } });
  const createOdeme = useCreateOdeme();
  const deleteOdeme = useDeleteOdeme();

  const filtrelenmis = odemeler.filter(o => {
    const aramaUyum = !arama || o.cariAd?.toLowerCase().includes(arama.toLowerCase()) || o.aciklama?.toLowerCase().includes(arama.toLowerCase());
    const tipUyum = tipFiltre === "tumu" || o.tip === tipFiltre;
    return aramaUyum && tipUyum;
  });

  const toplamTahsilat = filtrelenmis.filter(o => o.tip === "tahsilat").reduce((s, o) => s + o.tutar, 0);
  const toplamOdeme = filtrelenmis.filter(o => o.tip === "odeme").reduce((s, o) => s + o.tutar, 0);

  function kaydet() {
    if (!sirketId || !cariId || !tarih || !tutar) {
      toast({ title: "Hata", description: "Zorunlu alanlari doldurun", variant: "destructive" });
      return;
    }
    createOdeme.mutate({
      data: {
        sirketId: Number(sirketId), cariId: Number(cariId),
        tip: tip as import("@workspace/api-client-react").OdemeInputTip, tarih, tutar: Number(tutar), paraBirimi, odemeYontemi: yontem as import("@workspace/api-client-react").OdemeInputOdemeYontemi,
        bankaHesabiId: bankaId ? Number(bankaId) : undefined,
        aciklama,
      },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListOdemelerQueryKey() });
        setModalAcik(false); setTutar(""); setAciklama(""); setBankaId("");
        toast({ title: "Odeme kaydedildi" });
      },
      onError: () => toast({ title: "Hata", variant: "destructive" }),
    });
  }

  if (isLoading) return <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted rounded-lg" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card><CardContent className="p-5 flex items-center gap-3">
          <div className="p-3 rounded-full bg-green-500/10"><TrendingUp className="h-5 w-5 text-green-500" /></div>
          <div><p className="text-xs text-muted-foreground">Toplam Tahsilat</p><p className="text-xl font-display font-bold text-green-600">+{fmt(toplamTahsilat)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-5 flex items-center gap-3">
          <div className="p-3 rounded-full bg-red-500/10"><TrendingDown className="h-5 w-5 text-red-500" /></div>
          <div><p className="text-xs text-muted-foreground">Toplam Odeme</p><p className="text-xl font-display font-bold text-red-500">-{fmt(toplamOdeme)}</p></div>
        </CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Cari veya aciklama ara..." value={arama} onChange={e => setArama(e.target.value)} data-testid="input-odeme-ara" />
        </div>
        <Select value={tipFiltre} onValueChange={setTipFiltre}>
          <SelectTrigger className="w-40" data-testid="select-odeme-tip-filtre"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tumu">Tumu</SelectItem>
            <SelectItem value="tahsilat">Tahsilat</SelectItem>
            <SelectItem value="odeme">Odeme</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setModalAcik(true)} className="rounded-full" data-testid="button-odeme-yeni">
          <Plus className="mr-2 h-4 w-4" /> Yeni Islem
        </Button>
      </div>

      <div className="space-y-2">
        {filtrelenmis.map(o => (
          <Card key={o.id} className="hover:shadow-sm transition-shadow" data-testid={`card-odeme-${o.id}`}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`p-2 rounded-full ${o.tip === "tahsilat" ? "bg-green-500/10" : "bg-red-500/10"}`}>
                {o.tip === "tahsilat" ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{o.cariAd}</p>
                <p className="text-sm text-muted-foreground">{o.aciklama} - {YONTEM_ETIKET[o.odemeYontemi] ?? o.odemeYontemi}</p>
                <p className="text-xs text-muted-foreground">{o.tarih}</p>
              </div>
              <span className={`font-bold text-lg ${o.tip === "tahsilat" ? "text-green-600" : "text-red-500"}`}>
                {o.tip === "tahsilat" ? "+" : "-"}{fmt(o.tutar, o.paraBirimi)}
              </span>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setSilId(o.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </CardContent>
          </Card>
        ))}
        {filtrelenmis.length === 0 && (
          <div className="text-center text-muted-foreground py-16">
            <Wallet className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Islem bulunamadi.</p>
          </div>
        )}
      </div>

      <Dialog open={modalAcik} onOpenChange={setModalAcik}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Yeni Odeme / Tahsilat</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Islem Tipi *</Label>
              <Select value={tip} onValueChange={setTip}>
                <SelectTrigger data-testid="select-yeni-odeme-tip"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tahsilat">Tahsilat</SelectItem>
                  <SelectItem value="odeme">Odeme</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sirket *</Label>
              <Select value={sirketId} onValueChange={v => { setSirketId(v); setCariId(""); }}>
                <SelectTrigger data-testid="select-yeni-odeme-sirket"><SelectValue placeholder="Sirket" /></SelectTrigger>
                <SelectContent>{sirketler.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.ad}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cari *</Label>
              <Select value={cariId} onValueChange={setCariId}>
                <SelectTrigger data-testid="select-yeni-odeme-cari"><SelectValue placeholder="Cari" /></SelectTrigger>
                <SelectContent>{cariler.filter(c => !sirketId || c.sirketId === Number(sirketId)).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.ad}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tutar *</Label>
              <Input type="number" value={tutar} onChange={e => setTutar(e.target.value)} step="0.01" data-testid="input-yeni-odeme-tutar" />
            </div>
            <div className="space-y-1.5">
              <Label>Para Birimi</Label>
              <Select value={paraBirimi} onValueChange={setParaBirimi}>
                <SelectTrigger data-testid="select-yeni-odeme-pb"><SelectValue /></SelectTrigger>
                <SelectContent>{["USD","EUR","TRY","GBP"].map(pb => <SelectItem key={pb} value={pb}>{pb}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tarih *</Label>
              <Input type="date" value={tarih} onChange={e => setTarih(e.target.value)} data-testid="input-yeni-odeme-tarih" />
            </div>
            <div className="space-y-1.5">
              <Label>Odeme Yontemi</Label>
              <Select value={yontem} onValueChange={setYontem}>
                <SelectTrigger data-testid="select-yeni-odeme-yontem"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(YONTEM_ETIKET).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Banka Hesabi</Label>
              <Select value={bankaId} onValueChange={setBankaId}>
                <SelectTrigger data-testid="select-yeni-odeme-banka"><SelectValue placeholder="Secin (opsiyonel)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Secilmedi</SelectItem>
                  {bankaHesaplari.map(h => <SelectItem key={h.id} value={String(h.id)}>{h.bankaAdi} - {h.hesapAdi}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Aciklama</Label>
              <Input value={aciklama} onChange={e => setAciklama(e.target.value)} data-testid="input-yeni-odeme-aciklama" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAcik(false)} className="rounded-full">Iptal</Button>
            <Button onClick={kaydet} disabled={createOdeme.isPending} className="rounded-full" data-testid="button-yeni-odeme-kaydet">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!silId} onOpenChange={o => !o && setSilId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Islemi sil</AlertDialogTitle><AlertDialogDescription>Bu islem geri alinamaz.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Iptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (!silId) return; deleteOdeme.mutate({ id: silId }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListOdemelerQueryKey() }); setSilId(null); } }); }}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
