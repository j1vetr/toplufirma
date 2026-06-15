import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTekrarlayanFaturalar, getListTekrarlayanFaturalarQueryKey,
  useCreateTekrarlayanFatura, useUpdateTekrarlayanFatura,
  useDeleteTekrarlayanFatura, useUretTekrarlayanFatura,
  useListFirmalar, getListFirmalarQueryKey,
  useListGemiler, getListGemilerQueryKey,
  getListFaturalarQueryKey,
} from "@workspace/api-client-react";
import type { TekrarlayanFatura } from "@workspace/api-client-react";
import { useSirket } from "@/contexts/sirket-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, RefreshCw, Pencil, Repeat } from "lucide-react";

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

const BOSH_FORM = {
  catiFirmaId: "",
  bagliFirmaId: "",
  gemiId: "",
  aciklama: "",
  birimFiyat: "",
  kdvOrani: "0",
  paraBirimi: "USD",
  sonrakiTarih: new Date().toISOString().split("T")[0],
  aktif: true,
};

export default function TekrarlayanFaturalar() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { aktifSirketId } = useSirket();

  const [modal, setModal] = useState(false);
  const [duzenleId, setDuzenleId] = useState<number | null>(null);
  const [silId, setSilId] = useState<number | null>(null);
  const [form, setForm] = useState(BOSH_FORM);

  const params = aktifSirketId ? { catiFirmaId: aktifSirketId } : undefined;
  const { data: liste = [], isLoading } = useListTekrarlayanFaturalar(
    params,
    { query: { queryKey: [...getListTekrarlayanFaturalarQueryKey(params), aktifSirketId] } },
  );
  const { data: catiFirmalar = [] } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );
  const { data: bagliFirmalar = [] } = useListFirmalar(
    { tip: "bagli" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "bagli"] } },
  );
  const { data: gemilerData = [] } = useListGemiler(
    params,
    { query: { queryKey: [...getListGemilerQueryKey(params), aktifSirketId] } },
  );

  const create = useCreateTekrarlayanFatura();
  const update = useUpdateTekrarlayanFatura();
  const del = useDeleteTekrarlayanFatura();
  const uret = useUretTekrarlayanFatura();

  function acModal(tr?: TekrarlayanFatura) {
    if (tr) {
      setDuzenleId(tr.id);
      setForm({
        catiFirmaId: String(tr.catiFirmaId),
        bagliFirmaId: String(tr.bagliFirmaId),
        gemiId: tr.gemiId ? String(tr.gemiId) : "",
        aciklama: tr.aciklama,
        birimFiyat: String(tr.birimFiyat),
        kdvOrani: String(tr.kdvOrani),
        paraBirimi: tr.paraBirimi,
        sonrakiTarih: tr.sonrakiTarih,
        aktif: tr.aktif,
      });
    } else {
      setDuzenleId(null);
      setForm({
        ...BOSH_FORM,
        catiFirmaId: aktifSirketId ? String(aktifSirketId) : "",
        sonrakiTarih: new Date().toISOString().split("T")[0],
      });
    }
    setModal(true);
  }

  function kaydet() {
    const data = {
      catiFirmaId: Number(form.catiFirmaId),
      bagliFirmaId: Number(form.bagliFirmaId),
      gemiId: form.gemiId ? Number(form.gemiId) : undefined,
      aciklama: form.aciklama,
      birimFiyat: Number(form.birimFiyat),
      kdvOrani: Number(form.kdvOrani),
      paraBirimi: form.paraBirimi,
      sonrakiTarih: form.sonrakiTarih,
      aktif: form.aktif,
    };
    if (!data.catiFirmaId || !data.bagliFirmaId || !data.aciklama || !data.birimFiyat) {
      toast({ title: "Zorunlu alanları doldurun", variant: "destructive" }); return;
    }

    if (duzenleId) {
      update.mutate(
        { id: duzenleId, data },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getListTekrarlayanFaturalarQueryKey() });
            setModal(false);
            toast({ title: "Güncellendi" });
          },
          onError: () => toast({ title: "Hata", variant: "destructive" }),
        }
      );
    } else {
      create.mutate(
        { data },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getListTekrarlayanFaturalarQueryKey() });
            setModal(false);
            toast({ title: "Tekrarlayan fatura oluşturuldu" });
          },
          onError: () => toast({ title: "Hata", variant: "destructive" }),
        }
      );
    }
  }

  function silindir(id: number) {
    del.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListTekrarlayanFaturalarQueryKey() });
          setSilId(null);
          toast({ title: "Silindi" });
        },
        onError: () => toast({ title: "Silinemedi", variant: "destructive" }),
      }
    );
  }

  function uretFatura(id: number) {
    uret.mutate(
      { id },
      {
        onSuccess: (fatura) => {
          qc.invalidateQueries({ queryKey: getListTekrarlayanFaturalarQueryKey() });
          qc.invalidateQueries({ queryKey: getListFaturalarQueryKey() });
          toast({ title: `Fatura üretildi: ${fatura.faturaNo}` });
        },
        onError: () => toast({ title: "Fatura üretilemedi", variant: "destructive" }),
      }
    );
  }

  const filtreli = aktifSirketId
    ? liste.filter(t => t.catiFirmaId === aktifSirketId)
    : liste;

  const filtreliBagli = form.catiFirmaId
    ? bagliFirmalar.filter(f => f.ustFirmaId === Number(form.catiFirmaId))
    : bagliFirmalar;

  if (isLoading) return <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted rounded-lg" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{filtreli.length} kayıt</p>
        <Button className="rounded-full" onClick={() => acModal()}>
          <Plus className="mr-2 h-4 w-4" /> Yeni Tanım
        </Button>
      </div>

      {filtreli.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
          <Repeat className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Henüz tekrarlayan fatura tanımı yok.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtreli.map(tr => (
            <Card key={tr.id} className={`hover:shadow-sm transition-shadow ${!tr.aktif ? "opacity-50" : ""}`}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-2 rounded-full bg-primary/10">
                  <RefreshCw className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{tr.aciklama}</p>
                    {!tr.aktif && <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Pasif</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tr.catiFirmaAd ?? `Firma #${tr.catiFirmaId}`} → {tr.bagliFirmaAd ?? `Firma #${tr.bagliFirmaId}`}
                    {tr.gemiAd ? ` (${tr.gemiAd})` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">Sonraki: {tr.sonrakiTarih}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-sm">{fmt(tr.birimFiyat, tr.paraBirimi)}</p>
                  <p className="text-xs text-muted-foreground">KDV: %{tr.kdvOrani}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8 text-green-600"
                    title="Şimdi Fatura Üret"
                    disabled={!tr.aktif || uret.isPending}
                    onClick={() => uretFatura(tr.id)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" title="Düzenle" onClick={() => acModal(tr)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Sil" onClick={() => setSilId(tr.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={modal} onOpenChange={o => { setModal(o); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{duzenleId ? "Tekrarlayan Fatura Düzenle" : "Yeni Tekrarlayan Fatura"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Çatı Firma *</Label>
              <Select value={form.catiFirmaId} onValueChange={v => setForm(f => ({ ...f, catiFirmaId: v, bagliFirmaId: "" }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seçin" /></SelectTrigger>
                <SelectContent>
                  {catiFirmalar.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.ad}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bağlı Firma *</Label>
              <Select value={form.bagliFirmaId} onValueChange={v => setForm(f => ({ ...f, bagliFirmaId: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seçin" /></SelectTrigger>
                <SelectContent>
                  {filtreliBagli.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.ad}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Açıklama *</Label>
              <Input className="h-8 text-sm" value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} placeholder="Hizmet açıklaması" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Birim Fiyat *</Label>
              <Input className="h-8 text-sm" type="number" step="0.01" value={form.birimFiyat} onChange={e => setForm(f => ({ ...f, birimFiyat: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">KDV Oranı (%)</Label>
              <Input className="h-8 text-sm" type="number" step="1" value={form.kdvOrani} onChange={e => setForm(f => ({ ...f, kdvOrani: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Para Birimi</Label>
              <Select value={form.paraBirimi} onValueChange={v => setForm(f => ({ ...f, paraBirimi: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["USD", "EUR", "TRY", "GBP"].map(pb => <SelectItem key={pb} value={pb}>{pb}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Gemi (opsiyonel)</Label>
              <Select value={form.gemiId} onValueChange={v => setForm(f => ({ ...f, gemiId: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">—</SelectItem>
                  {gemilerData.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.ad}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Sonraki Fatura Tarihi *</Label>
              <Input className="h-8 text-sm" type="date" value={form.sonrakiTarih} onChange={e => setForm(f => ({ ...f, sonrakiTarih: e.target.value }))} />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="aktif-cb"
                checked={form.aktif}
                onChange={e => setForm(f => ({ ...f, aktif: e.target.checked }))}
                className="h-4 w-4"
              />
              <Label htmlFor="aktif-cb" className="text-sm cursor-pointer">Aktif</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)} className="rounded-full">İptal</Button>
            <Button onClick={kaydet} disabled={create.isPending || update.isPending} className="rounded-full">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!silId} onOpenChange={o => !o && setSilId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tekrarlayan faturayı sil</AlertDialogTitle>
            <AlertDialogDescription>Bu tanım silinecek, gelecekte otomatik fatura üretilmeyecek.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => silId && silindir(silId)}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
