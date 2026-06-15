import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListBankaHesaplari, getListBankaHesaplariQueryKey,
  useListSirketler, getListSirketlerQueryKey,
  useCreateBankaHesabi, useUpdateBankaHesabi, useDeleteBankaHesabi,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Pencil, Trash2, Landmark, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";

interface HesapForm {
  sirketId: string;
  bankaAdi: string;
  hesapAdi: string;
  iban: string;
  paraBirimi: string;
  subeAdi: string;
  aciklama: string;
}

const BOSH: HesapForm = { sirketId: "", bankaAdi: "", hesapAdi: "", iban: "", paraBirimi: "TRY", subeAdi: "", aciklama: "" };

const fmt = (n: number, pb = "TRY") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

export default function BankaHesaplari() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modalAcik, setModalAcik] = useState(false);
  const [duzenleId, setDuzenleId] = useState<number | null>(null);
  const [form, setForm] = useState<HesapForm>(BOSH);
  const [silId, setSilId] = useState<number | null>(null);

  const { data: hesaplar = [], isLoading } = useListBankaHesaplari(undefined, { query: { queryKey: getListBankaHesaplariQueryKey() } });
  const { data: sirketler = [] } = useListSirketler({ query: { queryKey: getListSirketlerQueryKey() } });
  const createHesap = useCreateBankaHesabi();
  const updateHesap = useUpdateBankaHesabi();
  const deleteHesap = useDeleteBankaHesabi();

  function ac(id?: number) {
    if (id) {
      const h = hesaplar.find(h => h.id === id);
      if (!h) return;
      setForm({ sirketId: String(h.sirketId), bankaAdi: h.bankaAdi, hesapAdi: h.hesapAdi, iban: h.iban ?? "", paraBirimi: h.paraBirimi, subeAdi: h.subeAdi ?? "", aciklama: h.aciklama ?? "" });
      setDuzenleId(id);
    } else {
      setForm({ ...BOSH, sirketId: sirketler[0] ? String(sirketler[0].id) : "" });
      setDuzenleId(null);
    }
    setModalAcik(true);
  }

  function kapat() { setModalAcik(false); setDuzenleId(null); setForm(BOSH); }

  function kaydet() {
    const data = { ...form, sirketId: Number(form.sirketId), aktif: true };
    if (duzenleId) {
      updateHesap.mutate({ id: duzenleId, data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListBankaHesaplariQueryKey() }); kapat(); toast({ title: "Hesap guncellendi" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    } else {
      createHesap.mutate({ data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListBankaHesaplariQueryKey() }); kapat(); toast({ title: "Hesap olusturuldu" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    }
  }

  if (isLoading) return <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted rounded-lg" />)}</div>;

  const toplamlar = hesaplar.reduce((acc, h) => {
    const pb = h.paraBirimi;
    if (!acc[pb]) acc[pb] = 0;
    acc[pb] += h.bakiye ?? 0;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          {Object.entries(toplamlar).map(([pb, toplam]) => (
            <div key={pb} className="flex items-center gap-1.5 text-sm bg-primary/10 text-primary px-3 py-1.5 rounded-full">
              {toplam >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              <span className="font-semibold">{fmt(toplam, pb)}</span>
            </div>
          ))}
        </div>
        <Button onClick={() => ac()} className="rounded-full" data-testid="button-hesap-ekle">
          <Plus className="mr-2 h-4 w-4" /> Yeni Hesap
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {hesaplar.map(h => (
          <Card key={h.id} className="hover:shadow-md transition-shadow" data-testid={`card-hesap-${h.id}`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Landmark className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{h.bankaAdi}</h3>
                    <p className="text-xs text-muted-foreground">{h.hesapAdi}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => ac(h.id)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setSilId(h.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-display font-bold">{fmt(h.bakiye ?? 0, h.paraBirimi)}</p>
                <p className="text-xs text-muted-foreground mt-1">{h.sirketAd}</p>
                {h.iban && <p className="text-xs text-muted-foreground font-mono mt-0.5">{h.iban}</p>}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant={h.aktif ? "default" : "secondary"}>{h.aktif ? "Aktif" : "Pasif"}</Badge>
                <Link href={`/banka-hesaplari/${h.id}`} className="ml-auto"><Button size="icon" variant="ghost" className="h-7 w-7"><ChevronRight className="h-4 w-4" /></Button></Link>
              </div>
            </CardContent>
          </Card>
        ))}
        {hesaplar.length === 0 && (
          <div className="col-span-3 text-center text-muted-foreground py-16">
            <Landmark className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Banka hesabi bulunamadi.</p>
          </div>
        )}
      </div>

      <Dialog open={modalAcik} onOpenChange={setModalAcik}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{duzenleId ? "Hesabi Duzenle" : "Yeni Banka Hesabi"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Sirket *</Label>
              <Select value={form.sirketId} onValueChange={v => setForm(f => ({...f, sirketId: v}))}>
                <SelectTrigger data-testid="select-hesap-sirket"><SelectValue placeholder="Sirket secin" /></SelectTrigger>
                <SelectContent>{sirketler.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.ad}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Banka Adi *</Label>
              <Input value={form.bankaAdi} onChange={e => setForm(f => ({...f, bankaAdi: e.target.value}))} data-testid="input-hesap-banka-adi" />
            </div>
            <div className="space-y-1.5">
              <Label>Hesap Adi *</Label>
              <Input value={form.hesapAdi} onChange={e => setForm(f => ({...f, hesapAdi: e.target.value}))} data-testid="input-hesap-ad" />
            </div>
            <div className="space-y-1.5">
              <Label>Para Birimi</Label>
              <Select value={form.paraBirimi} onValueChange={v => setForm(f => ({...f, paraBirimi: v}))}>
                <SelectTrigger data-testid="select-hesap-pb"><SelectValue /></SelectTrigger>
                <SelectContent>{["TRY","USD","EUR","GBP"].map(pb => <SelectItem key={pb} value={pb}>{pb}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sube</Label>
              <Input value={form.subeAdi} onChange={e => setForm(f => ({...f, subeAdi: e.target.value}))} data-testid="input-hesap-sube" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>IBAN</Label>
              <Input value={form.iban} onChange={e => setForm(f => ({...f, iban: e.target.value.toUpperCase()}))} placeholder="TR00 0000 0000 0000 0000 0000 00" data-testid="input-hesap-iban" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={kapat} className="rounded-full">Iptal</Button>
            <Button onClick={kaydet} disabled={!form.sirketId || !form.bankaAdi || !form.hesapAdi} className="rounded-full" data-testid="button-hesap-kaydet">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!silId} onOpenChange={o => !o && setSilId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hesabi sil</AlertDialogTitle><AlertDialogDescription>Bu islem geri alinamaz.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Iptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (!silId) return; deleteHesap.mutate({ id: silId }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListBankaHesaplariQueryKey() }); setSilId(null); } }); }}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
