import { useState, useMemo } from "react";
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
import { useYetki } from "@/hooks/use-yetki";
import { Plus, Trash2, RefreshCw, Pencil, Repeat, ChevronDown, ChevronUp, Calendar } from "lucide-react";

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

const trTarih = (dateStr: string) => {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
};

function sonrakiAyGunuHesapla(mevcutTarih: string, ayinGunu: number): string {
  const gun = Math.min(Math.max(ayinGunu, 1), 28);
  const d = new Date(mevcutTarih + "T12:00:00");
  const nextMonth = d.getMonth() + 1;
  const nextYear = nextMonth > 11 ? d.getFullYear() + 1 : d.getFullYear();
  const normalizedMonth = nextMonth > 11 ? 0 : nextMonth;
  const maxDay = new Date(nextYear, normalizedMonth + 1, 0).getDate();
  const day = Math.min(gun, maxDay);
  return `${nextYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function onumuzEkiTarih(sonrakiTarih: string, ayinGunu: number, n = 3): string[] {
  const dates: string[] = [];
  let current = sonrakiTarih;
  for (let i = 0; i < n; i++) {
    dates.push(current);
    current = sonrakiAyGunuHesapla(current, ayinGunu);
  }
  return dates;
}

interface KalemForm {
  aciklama: string;
  miktar: string;
  birimFiyat: string;
  kdvOrani: string;
}

const BOSH_KALEM: KalemForm = { aciklama: "", miktar: "1", birimFiyat: "", kdvOrani: "0" };

const BOSH_FORM = {
  catiFirmaId: "",
  bagliFirmaId: "",
  grupFirmaId: "",
  gemiId: "",
  paraBirimi: "USD",
  sonrakiTarih: new Date().toISOString().split("T")[0],
  ayinGunu: String(new Date().getDate()),
  aktif: true,
  kalemler: [{ ...BOSH_KALEM }] as KalemForm[],
};

const kalemGenelToplam = (k: { miktar: number; birimFiyat: number; kdvOrani: number }) =>
  k.miktar * k.birimFiyat * (1 + k.kdvOrani / 100);

function trToplam(tr: TekrarlayanFatura): number {
  if (tr.kalemler && tr.kalemler.length) {
    return tr.kalemler.reduce((s, k) => s + kalemGenelToplam(k), 0);
  }
  return kalemGenelToplam({ miktar: 1, birimFiyat: tr.birimFiyat, kdvOrani: tr.kdvOrani });
}

export default function TekrarlayanFaturalar() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { aktifSirketId } = useSirket();
  const { canWrite } = useYetki();

  const [modal, setModal] = useState(false);
  const [duzenleId, setDuzenleId] = useState<number | null>(null);
  const [silId, setSilId] = useState<number | null>(null);
  const [form, setForm] = useState(BOSH_FORM);
  const [acikKalemler, setAcikKalemler] = useState<Set<number>>(new Set());

  function kalemToggle(id: number) {
    setAcikKalemler(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const params = aktifSirketId ? { catiFirmaId: aktifSirketId } : undefined;
  const { data: liste = [], isLoading } = useListTekrarlayanFaturalar(
    params,
    { query: { queryKey: [...getListTekrarlayanFaturalarQueryKey(params), aktifSirketId] } },
  );
  const { data: catiFirmalar = [] } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );
  const { data: filtreliBagli = [] } = useListFirmalar(
    form.catiFirmaId ? { tip: "bagli", catiFirmaId: Number(form.catiFirmaId) } : { tip: "bagli" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "bagli", form.catiFirmaId] } },
  );
  const { data: grupFirmalar = [] } = useListFirmalar(
    { tip: "grup" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "grup"] } },
  );
  const gemilerParams = form.catiFirmaId ? { catiFirmaId: Number(form.catiFirmaId) } : (aktifSirketId ? { catiFirmaId: aktifSirketId } : undefined);
  const { data: gemilerData = [] } = useListGemiler(
    gemilerParams,
    { query: { queryKey: [...getListGemilerQueryKey(gemilerParams), form.catiFirmaId ?? aktifSirketId] } },
  );
  const filtreliGemiler = gemilerData.filter(g => !form.bagliFirmaId || g.firmaId === Number(form.bagliFirmaId));

  const create = useCreateTekrarlayanFatura();
  const update = useUpdateTekrarlayanFatura();
  const del = useDeleteTekrarlayanFatura();
  const uret = useUretTekrarlayanFatura();

  const onizlemeTarihleri = useMemo(() => {
    const gun = Number(form.ayinGunu);
    if (!form.sonrakiTarih || !gun || gun < 1 || gun > 28) return [];
    return onumuzEkiTarih(form.sonrakiTarih, gun, 3);
  }, [form.sonrakiTarih, form.ayinGunu]);

  function acModal(tr?: TekrarlayanFatura) {
    if (tr) {
      setDuzenleId(tr.id);
      const gun = tr.ayinGunu ?? Math.min(new Date(tr.sonrakiTarih + "T12:00:00").getDate(), 28);
      setForm({
        catiFirmaId: String(tr.catiFirmaId),
        bagliFirmaId: String(tr.bagliFirmaId),
        grupFirmaId: tr.grupFirmaId ? String(tr.grupFirmaId) : "",
        gemiId: tr.gemiId ? String(tr.gemiId) : "",
        paraBirimi: tr.paraBirimi,
        sonrakiTarih: tr.sonrakiTarih,
        ayinGunu: String(gun),
        aktif: tr.aktif,
        kalemler: tr.kalemler && tr.kalemler.length
          ? tr.kalemler.map(k => ({ aciklama: k.aciklama, miktar: String(k.miktar), birimFiyat: String(k.birimFiyat), kdvOrani: String(k.kdvOrani) }))
          : [{ aciklama: tr.aciklama, miktar: "1", birimFiyat: String(tr.birimFiyat), kdvOrani: String(tr.kdvOrani) }],
      });
    } else {
      setDuzenleId(null);
      const today = new Date().toISOString().split("T")[0];
      setForm({
        ...BOSH_FORM,
        catiFirmaId: aktifSirketId ? String(aktifSirketId) : "",
        sonrakiTarih: today,
        ayinGunu: String(new Date().getDate()),
      });
    }
    setModal(true);
  }

  function kaydet() {
    const kalemler = form.kalemler.map(k => ({
      aciklama: k.aciklama,
      miktar: Number(k.miktar) || 1,
      birimFiyat: Number(k.birimFiyat),
      kdvOrani: Number(k.kdvOrani) || 0,
    }));
    const ilk = kalemler[0];
    const ayinGunuVal = Math.min(Math.max(Number(form.ayinGunu) || 1, 1), 28);
    const data = {
      catiFirmaId: Number(form.catiFirmaId),
      bagliFirmaId: Number(form.bagliFirmaId),
      grupFirmaId: form.grupFirmaId ? Number(form.grupFirmaId) : null,
      gemiId: form.gemiId ? Number(form.gemiId) : undefined,
      aciklama: ilk?.aciklama ?? "",
      birimFiyat: ilk?.birimFiyat ?? 0,
      kdvOrani: ilk?.kdvOrani ?? 0,
      paraBirimi: form.paraBirimi,
      sonrakiTarih: form.sonrakiTarih,
      ayinGunu: ayinGunuVal,
      aktif: form.aktif,
      kalemler,
    };
    if (!data.catiFirmaId || !data.bagliFirmaId || kalemler.some(k => !k.aciklama || !k.birimFiyat)) {
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

  function kalemGuncelle(idx: number, alan: keyof KalemForm, deger: string) {
    setForm(f => ({ ...f, kalemler: f.kalemler.map((k, i) => i === idx ? { ...k, [alan]: deger } : k) }));
  }
  function kalemEkle() {
    setForm(f => ({ ...f, kalemler: [...f.kalemler, { ...BOSH_KALEM, kdvOrani: f.kalemler[0]?.kdvOrani ?? "0" }] }));
  }
  function kalemSil(idx: number) {
    setForm(f => ({ ...f, kalemler: f.kalemler.length > 1 ? f.kalemler.filter((_, i) => i !== idx) : f.kalemler }));
  }

  const filtreli = aktifSirketId
    ? liste.filter(t => t.catiFirmaId === aktifSirketId)
    : liste;

  const aktifSayisi = filtreli.filter(t => t.aktif).length;
  const pasifSayisi = filtreli.filter(t => !t.aktif).length;

  if (isLoading) return <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-none" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">{filtreli.length} kayıt</p>
          {aktifSayisi > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">{aktifSayisi} aktif</span>
          )}
          {pasifSayisi > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{pasifSayisi} pasif</span>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => acModal()} data-testid="button-tekrar-yeni">
            <Plus className="mr-2 h-4 w-4" /> Yeni Tanım
          </Button>
        )}
      </div>

      {filtreli.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
          <Repeat className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Henüz tekrarlayan fatura tanımı yok.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtreli.map(tr => {
            const expanded = acikKalemler.has(tr.id);
            const kalemler = tr.kalemler && tr.kalemler.length
              ? tr.kalemler
              : [{ aciklama: tr.aciklama, miktar: 1, birimFiyat: tr.birimFiyat, kdvOrani: tr.kdvOrani }];
            const gun = tr.ayinGunu ?? Math.min(new Date(tr.sonrakiTarih + "T12:00:00").getDate(), 28);
            return (
              <Card key={tr.id} className={`${!tr.aktif ? "opacity-60" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-sm ${tr.aktif ? "bg-primary/10" : "bg-muted"}`}>
                      <RefreshCw className={`h-4 w-4 ${tr.aktif ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{tr.aciklama}</p>
                        {tr.aktif ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Aktif</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">Pasif</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {tr.catiFirmaAd ?? `Firma #${tr.catiFirmaId}`} → {tr.bagliFirmaAd ?? `Firma #${tr.bagliFirmaId}`}
                        {tr.gemiAd ? ` (${tr.gemiAd})` : ""}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">
                          Sonraki: <span className="font-medium text-foreground">{trTarih(tr.sonrakiTarih)}</span>
                          {" · "}her ayın <span className="font-medium text-foreground">{gun}.</span> günü
                          {kalemler.length > 1 ? ` · ${kalemler.length} kalem` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-sm">{fmt(trToplam(tr), tr.paraBirimi)}</p>
                      <p className="text-xs text-muted-foreground">KDV dahil</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {canWrite && (
                        <Button
                          size="icon" variant="ghost" className="h-8 w-8 text-green-600"
                          title="Şimdi Fatura Üret"
                          disabled={!tr.aktif || uret.isPending}
                          onClick={() => uretFatura(tr.id)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canWrite && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Düzenle" onClick={() => acModal(tr)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canWrite && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Sil" onClick={() => setSilId(tr.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground"
                        title={expanded ? "Kalemleri Gizle" : "Kalemleri Göster"}
                        onClick={() => kalemToggle(tr.id)}
                      >
                        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Kalemler</p>
                      <div className="grid grid-cols-12 gap-1.5 text-[10px] text-muted-foreground mb-1 px-1">
                        <span className="col-span-5">Açıklama</span>
                        <span className="col-span-2 text-right">Miktar</span>
                        <span className="col-span-2 text-right">Birim Fiyat</span>
                        <span className="col-span-1 text-right">KDV %</span>
                        <span className="col-span-2 text-right">Toplam</span>
                      </div>
                      <div className="space-y-1">
                        {kalemler.map((k, i) => (
                          <div key={i} className="grid grid-cols-12 gap-1.5 text-xs px-1 py-1 rounded bg-muted/40">
                            <span className="col-span-5 truncate">{k.aciklama}</span>
                            <span className="col-span-2 text-right">{k.miktar}</span>
                            <span className="col-span-2 text-right">{fmt(k.birimFiyat, tr.paraBirimi)}</span>
                            <span className="col-span-1 text-right">%{k.kdvOrani}</span>
                            <span className="col-span-2 text-right font-medium">{fmt(kalemGenelToplam(k), tr.paraBirimi)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-end mt-2 text-xs font-semibold">
                        <span className="text-muted-foreground mr-2">Genel Toplam:</span>
                        <span>{fmt(trToplam(tr), tr.paraBirimi)}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={modal} onOpenChange={o => { setModal(o); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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
              <Label className="text-xs">Çatı / Grup Firma</Label>
              <Select value={form.grupFirmaId || "none"} onValueChange={v => setForm(f => ({ ...f, grupFirmaId: v === "none" ? "" : v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Yok" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Yok</SelectItem>
                  {grupFirmalar.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.ad}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Kalemler *</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={kalemEkle} data-testid="button-tekrar-kalem-ekle">
                  <Plus className="mr-1 h-3 w-3" /> Kalem Ekle
                </Button>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-1.5 text-[10px] text-muted-foreground px-1">
                  <span className="col-span-5">Açıklama</span>
                  <span className="col-span-2 text-right">Miktar</span>
                  <span className="col-span-2 text-right">Birim Fiyat</span>
                  <span className="col-span-2 text-right">KDV %</span>
                  <span className="col-span-1" />
                </div>
                {form.kalemler.map((k, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                    <Input className="col-span-5 h-8 text-sm" value={k.aciklama} onChange={e => kalemGuncelle(i, "aciklama", e.target.value)} placeholder="Hizmet açıklaması" data-testid={`input-tekrar-kalem-aciklama-${i}`} />
                    <Input className="col-span-2 h-8 text-sm text-right" type="number" step="0.01" value={k.miktar} onChange={e => kalemGuncelle(i, "miktar", e.target.value)} data-testid={`input-tekrar-kalem-miktar-${i}`} />
                    <Input className="col-span-2 h-8 text-sm text-right" type="number" step="0.01" value={k.birimFiyat} onChange={e => kalemGuncelle(i, "birimFiyat", e.target.value)} data-testid={`input-tekrar-kalem-fiyat-${i}`} />
                    <Input className="col-span-2 h-8 text-sm text-right" type="number" step="1" value={k.kdvOrani} onChange={e => kalemGuncelle(i, "kdvOrani", e.target.value)} data-testid={`input-tekrar-kalem-kdv-${i}`} />
                    <Button type="button" size="icon" variant="ghost" className="col-span-1 h-7 w-7 text-destructive" onClick={() => kalemSil(i)} disabled={form.kalemler.length === 1} data-testid={`button-tekrar-kalem-sil-${i}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
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
              <Select value={form.gemiId || "none"} onValueChange={v => setForm(f => ({ ...f, gemiId: v === "none" ? "" : v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {filtreliGemiler.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.ad}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sonraki Fatura Tarihi *</Label>
              <Input
                className="h-8 text-sm"
                type="date"
                value={form.sonrakiTarih}
                onChange={e => {
                  const tarih = e.target.value;
                  const gun = tarih ? Math.min(new Date(tarih + "T12:00:00").getDate(), 28) : Number(form.ayinGunu);
                  setForm(f => ({ ...f, sonrakiTarih: tarih, ayinGunu: String(gun) }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ayın Kaçında Oluşsun (1-28)</Label>
              <Input
                className="h-8 text-sm"
                type="number"
                min={1}
                max={28}
                step={1}
                value={form.ayinGunu}
                onChange={e => setForm(f => ({ ...f, ayinGunu: e.target.value }))}
                placeholder="örn. 1"
                data-testid="input-tekrar-ayin-gunu"
              />
            </div>
            {onizlemeTarihleri.length > 0 && (
              <div className="col-span-2">
                <div className="rounded bg-muted/50 border border-dashed p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Tahmini Oluşturma Tarihleri
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {onizlemeTarihleri.map((t, i) => (
                      <div key={t} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${i === 0 ? "bg-primary/10 border-primary/30 text-primary font-semibold" : "bg-background text-muted-foreground"}`}>
                        <span className="text-[10px] font-bold">{i + 1}.</span>
                        {trTarih(t)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
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
            <Button variant="outline" onClick={() => setModal(false)}>İptal</Button>
            <Button onClick={kaydet} disabled={create.isPending || update.isPending}>Kaydet</Button>
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
