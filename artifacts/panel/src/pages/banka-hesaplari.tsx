import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListBankaHesaplari, getListBankaHesaplariQueryKey,
  useListFirmalar, getListFirmalarQueryKey,
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
import { Plus, Pencil, Trash2, Landmark, ChevronRight, TrendingUp, TrendingDown, FileText } from "lucide-react";
import { useSirket } from "@/contexts/sirket-context";
import { useYetki } from "@/hooks/use-yetki";

interface HesapForm {
  catiFirmaId: string;
  bankaAdi: string;
  hesapAdi: string;
  iban: string;
  paraBirimi: string;
  subeAdi: string;
  aciklama: string;
  faturadaGoster: boolean;
}

const BOSH: HesapForm = { catiFirmaId: "", bankaAdi: "", hesapAdi: "", iban: "", paraBirimi: "TRY", subeAdi: "", aciklama: "", faturadaGoster: true };

const fmt = (n: number, pb = "TRY") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

export default function BankaHesaplari() {
  const { aktifSirketId } = useSirket();
  const { canWrite } = useYetki();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modalAcik, setModalAcik] = useState(false);
  const [duzenleId, setDuzenleId] = useState<number | null>(null);
  const [form, setForm] = useState<HesapForm>(BOSH);
  const [silId, setSilId] = useState<number | null>(null);

  const { data: hesaplar = [], isLoading } = useListBankaHesaplari(
    aktifSirketId ? { catiFirmaId: aktifSirketId } : undefined,
    { query: { queryKey: [...getListBankaHesaplariQueryKey(), aktifSirketId] } },
  );
  const { data: catiFirmalar = [] } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );
  const createHesap = useCreateBankaHesabi();
  const updateHesap = useUpdateBankaHesabi();
  const deleteHesap = useDeleteBankaHesabi();

  function ac(id?: number) {
    if (id) {
      const h = hesaplar.find(h => h.id === id);
      if (!h) return;
      setForm({ catiFirmaId: String(h.catiFirmaId), bankaAdi: h.bankaAdi, hesapAdi: h.hesapAdi, iban: h.iban ?? "", paraBirimi: h.paraBirimi, subeAdi: h.subeAdi ?? "", aciklama: h.aciklama ?? "", faturadaGoster: h.faturadaGoster ?? true });
      setDuzenleId(id);
    } else {
      setForm({ ...BOSH, catiFirmaId: catiFirmalar[0] ? String(catiFirmalar[0].id) : "" });
      setDuzenleId(null);
    }
    setModalAcik(true);
  }

  function kapat() { setModalAcik(false); setDuzenleId(null); setForm(BOSH); }

  function kaydet() {
    const data = { catiFirmaId: Number(form.catiFirmaId), bankaAdi: form.bankaAdi, hesapAdi: form.hesapAdi, iban: form.iban || undefined, paraBirimi: form.paraBirimi, subeAdi: form.subeAdi || undefined, aciklama: form.aciklama || undefined, aktif: true, faturadaGoster: form.faturadaGoster };
    if (duzenleId) {
      updateHesap.mutate({ id: duzenleId, data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListBankaHesaplariQueryKey() }); kapat(); toast({ title: "Hesap güncellendi" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    } else {
      createHesap.mutate({ data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListBankaHesaplariQueryKey() }); kapat(); toast({ title: "Hesap oluşturuldu" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    }
  }

  if (isLoading) return <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted rounded-none" />)}</div>;

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
            <div key={pb} className="flex items-center gap-1.5 text-sm bg-primary/10 text-primary px-3 py-1.5 rounded-sm">
              {toplam >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              <span className="font-semibold">{fmt(toplam, pb)}</span>
            </div>
          ))}
        </div>
        {canWrite && (
          <Button onClick={() => ac()} data-testid="button-hesap-ekle">
            <Plus className="mr-2 h-4 w-4" /> Yeni Hesap
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {hesaplar.map(h => (
          <Card key={h.id} className="" data-testid={`card-hesap-${h.id}`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-sm bg-green-500/10 flex items-center justify-center">
                    <Landmark className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{h.bankaAdi}</h3>
                    <p className="text-xs text-muted-foreground">{h.hesapAdi}</p>
                  </div>
                </div>
                {canWrite && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => ac(h.id)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setSilId(h.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
              <div className="mt-3">
                <p className="text-2xl font-display font-bold">{fmt(h.bakiye ?? 0, h.paraBirimi)}</p>
                <p className="text-xs text-muted-foreground mt-1">{h.catiFirmaAd}</p>
                {h.iban && <p className="text-xs text-muted-foreground font-mono mt-0.5">{h.iban}</p>}
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <Badge variant={h.aktif ? "default" : "secondary"}>{h.aktif ? "Aktif" : "Pasif"}</Badge>
                {h.faturadaGoster !== false && (
                  <span className="flex items-center gap-1 text-xs text-green-600 bg-green-500/10 px-2 py-0.5 rounded-sm">
                    <FileText className="h-3 w-3" /> Faturada Göster
                  </span>
                )}
                <Link href={`/banka-hesaplari/${h.id}`} className="ml-auto"><Button size="icon" variant="ghost" className="h-7 w-7"><ChevronRight className="h-4 w-4" /></Button></Link>
              </div>
            </CardContent>
          </Card>
        ))}
        {hesaplar.length === 0 && (
          <div className="col-span-3 text-center text-muted-foreground py-16">
            <Landmark className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Banka hesabı bulunamadı.</p>
          </div>
        )}
      </div>

      <Dialog open={modalAcik} onOpenChange={setModalAcik}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{duzenleId ? "Hesabı Düzenle" : "Yeni Banka Hesabı"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Çatı Firma *</Label>
              <Select value={form.catiFirmaId} onValueChange={v => setForm(f => ({...f, catiFirmaId: v}))}>
                <SelectTrigger data-testid="select-hesap-sirket"><SelectValue placeholder="Firma seçin" /></SelectTrigger>
                <SelectContent>{catiFirmalar.map(f => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    <span className="flex items-center gap-2">
                      <span>{f.ad}</span>
                      {(f as unknown as Record<string, unknown>).etiket && (
                        <span className="text-[10px] font-bold bg-[#ffed00] text-black px-1.5 py-0.5 leading-none">{String((f as unknown as Record<string, unknown>).etiket)}</span>
                      )}
                    </span>
                  </SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Banka Adı *</Label>
              <Input value={form.bankaAdi} onChange={e => setForm(f => ({...f, bankaAdi: e.target.value}))} data-testid="input-hesap-banka-adi" />
            </div>
            <div className="space-y-1.5">
              <Label>Hesap Adı *</Label>
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
              <Label>Şube</Label>
              <Input value={form.subeAdi} onChange={e => setForm(f => ({...f, subeAdi: e.target.value}))} data-testid="input-hesap-sube" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>IBAN</Label>
              <Input value={form.iban} onChange={e => setForm(f => ({...f, iban: e.target.value.toUpperCase()}))} placeholder="TR00 0000 0000 0000 0000 0000 00" data-testid="input-hesap-iban" />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.faturadaGoster}
                  onChange={e => setForm(f => ({...f, faturadaGoster: e.target.checked}))}
                  className="h-4 w-4 rounded"
                  data-testid="checkbox-faturada-goster"
                />
                <div>
                  <p className="text-sm font-medium">Faturada göster</p>
                  <p className="text-xs text-muted-foreground">Bu hesap fatura PDF ve detay sayfasında ödeme bilgisi olarak görünür</p>
                </div>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={kapat}>İptal</Button>
            <Button onClick={kaydet} disabled={!form.catiFirmaId || !form.bankaAdi || !form.hesapAdi} data-testid="button-hesap-kaydet">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!silId} onOpenChange={o => !o && setSilId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hesabı sil</AlertDialogTitle><AlertDialogDescription>Bu işlem geri alınamaz.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (!silId) return; deleteHesap.mutate({ id: silId }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListBankaHesaplariQueryKey() }); setSilId(null); } }); }}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
