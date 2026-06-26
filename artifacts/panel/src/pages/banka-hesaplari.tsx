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
import { Plus, Pencil, Trash2, Landmark, ChevronRight, FileText, Copy, Check, CopyPlus, X } from "lucide-react";
import { useSirket } from "@/contexts/sirket-context";
import { useYetki } from "@/hooks/use-yetki";

const PARA_BIRIMLERI = ["TRY", "USD", "EUR", "GBP", "CHF", "JPY", "CAD", "AUD", "NOK", "SEK", "DKK"];

interface IbanGiris {
  pb: string;
  iban: string;
}

interface HesapForm {
  catiFirmaId: string;
  bankaAdi: string;
  hesapAdi: string;
  swift: string;
  subeAdi: string;
  aciklama: string;
  faturadaGoster: boolean;
  ibanGirisler: IbanGiris[];
}

const BOSH: HesapForm = {
  catiFirmaId: "", bankaAdi: "", hesapAdi: "", swift: "", subeAdi: "", aciklama: "",
  faturadaGoster: true, ibanGirisler: [{ pb: "TRY", iban: "" }],
};

function hesapIbanGirisler(ibanlar?: Record<string, string> | null, legacyIban?: string | null, legacyPb?: string | null): IbanGiris[] {
  if (ibanlar && Object.keys(ibanlar).length > 0) {
    return Object.entries(ibanlar).map(([pb, iban]) => ({ pb, iban }));
  }
  if (legacyIban && legacyPb) return [{ pb: legacyPb, iban: legacyIban }];
  return [{ pb: "TRY", iban: "" }];
}

export default function BankaHesaplari() {
  const { aktifSirketId } = useSirket();
  const { canWrite } = useYetki();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modalAcik, setModalAcik] = useState(false);
  const [duzenleId, setDuzenleId] = useState<number | null>(null);
  const [form, setForm] = useState<HesapForm>(BOSH);
  const [silId, setSilId] = useState<number | null>(null);
  const [kopyalandıId, setKopyalandıId] = useState<number | null>(null);
  const [kopyaModu, setKopyaModu] = useState(false);

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
    setKopyaModu(false);
    if (id) {
      const h = hesaplar.find(h => h.id === id);
      if (!h) return;
      setForm({
        catiFirmaId: String(h.catiFirmaId),
        bankaAdi: h.bankaAdi ?? "",
        hesapAdi: h.hesapAdi,
        swift: (h as unknown as Record<string,unknown>).swift as string ?? "",
        subeAdi: h.subeAdi ?? "",
        aciklama: h.aciklama ?? "",
        faturadaGoster: h.faturadaGoster ?? true,
        ibanGirisler: hesapIbanGirisler(h.ibanlar, h.iban, h.paraBirimi),
      });
      setDuzenleId(id);
    } else {
      setForm({ ...BOSH, catiFirmaId: catiFirmalar[0] ? String(catiFirmalar[0].id) : "" });
      setDuzenleId(null);
    }
    setModalAcik(true);
  }

  function acKopya(id: number) {
    const h = hesaplar.find(h => h.id === id);
    if (!h) return;
    setForm({
      catiFirmaId: String(h.catiFirmaId),
      bankaAdi: h.bankaAdi ?? "",
      hesapAdi: h.hesapAdi + " (Kopya)",
      swift: (h as unknown as Record<string,unknown>).swift as string ?? "",
      subeAdi: h.subeAdi ?? "",
      aciklama: h.aciklama ?? "",
      faturadaGoster: h.faturadaGoster ?? true,
      ibanGirisler: hesapIbanGirisler(h.ibanlar, h.iban, h.paraBirimi),
    });
    setDuzenleId(null);
    setKopyaModu(true);
    setModalAcik(true);
  }

  function kapat() { setModalAcik(false); setDuzenleId(null); setKopyaModu(false); setForm(BOSH); }

  function ibanEkle() {
    setForm(f => ({ ...f, ibanGirisler: [...f.ibanGirisler, { pb: "USD", iban: "" }] }));
  }

  function ibanGuncelle(i: number, field: keyof IbanGiris, value: string) {
    setForm(f => {
      const g = [...f.ibanGirisler];
      g[i] = { ...g[i], [field]: value };
      return { ...f, ibanGirisler: g };
    });
  }

  function ibanSil(i: number) {
    setForm(f => ({ ...f, ibanGirisler: f.ibanGirisler.filter((_, idx) => idx !== i) }));
  }

  function kaydet() {
    const ibanlar: Record<string, string> = {};
    for (const g of form.ibanGirisler) {
      if (g.pb && g.iban.trim()) ibanlar[g.pb] = g.iban.trim();
    }
    const data = {
      catiFirmaId: Number(form.catiFirmaId),
      bankaAdi: form.bankaAdi || undefined,
      hesapAdi: form.hesapAdi,
      swift: form.swift || undefined,
      subeAdi: form.subeAdi || undefined,
      aciklama: form.aciklama || undefined,
      aktif: true,
      faturadaGoster: form.faturadaGoster,
      ibanlar,
    };
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        {canWrite && (
          <Button onClick={() => ac()} data-testid="button-hesap-ekle">
            <Plus className="mr-2 h-4 w-4" /> Yeni Hesap
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {hesaplar.map(h => {
          const ibanlar = (h.ibanlar && Object.keys(h.ibanlar).length > 0)
            ? h.ibanlar
            : (h.iban && h.paraBirimi ? { [h.paraBirimi]: h.iban } : {});
          const swift = (h as unknown as Record<string,unknown>).swift as string | undefined;
          const ibanGirisler = Object.entries(ibanlar);

          return (
            <Card key={h.id} className="" data-testid={`card-hesap-${h.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-sm bg-green-500/10 flex items-center justify-center">
                      <Landmark className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{h.bankaAdi || "—"}</h3>
                      <p className="text-xs text-muted-foreground">{h.hesapAdi}</p>
                    </div>
                  </div>
                  {canWrite && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Kopyala" onClick={() => acKopya(h.id)}><CopyPlus className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Düzenle" onClick={() => ac(h.id)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Sil" onClick={() => setSilId(h.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  )}
                </div>
                <div className="mt-3 space-y-0.5">
                  <p className="text-xs text-muted-foreground">{h.catiFirmaAd}</p>
                  {swift && (
                    <p className="text-xs text-muted-foreground font-mono">SWIFT: {swift}</p>
                  )}
                  {ibanGirisler.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {ibanGirisler.map(([pb, iban]) => (
                        <p key={pb} className="text-xs font-mono text-muted-foreground">
                          <span className="font-semibold text-foreground">{pb}</span> {iban}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <button
                    onClick={() => {
                      const satirlar = [
                        h.bankaAdi ? `Banka: ${h.bankaAdi}` : null,
                        `Hesap Adı: ${h.hesapAdi}`,
                        ...Object.entries(ibanlar).map(([pb, iban]) => `${pb} IBAN: ${iban}`),
                        swift ? `SWIFT: ${swift}` : null,
                        h.subeAdi ? `Şube: ${h.subeAdi}` : null,
                      ].filter(Boolean).join("\n");
                      navigator.clipboard.writeText(satirlar);
                      setKopyalandıId(h.id);
                      setTimeout(() => setKopyalandıId(null), 2000);
                    }}
                    className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="Hesap bilgilerini kopyala"
                  >
                    {kopyalandıId === h.id
                      ? <><Check className="h-3.5 w-3.5 text-green-500" /> Kopyalandı</>
                      : <><Copy className="h-3.5 w-3.5" /> Kopyala</>}
                  </button>
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
          );
        })}
        {hesaplar.length === 0 && (
          <div className="col-span-3 text-center text-muted-foreground py-16">
            <Landmark className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Banka hesabı bulunamadı.</p>
          </div>
        )}
      </div>

      <Dialog open={modalAcik} onOpenChange={setModalAcik}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{duzenleId ? "Hesabı Düzenle" : kopyaModu ? "Hesabı Kopyala" : "Yeni Banka Hesabı"}</DialogTitle></DialogHeader>
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
              <Label>Banka Adı</Label>
              <Input value={form.bankaAdi} onChange={e => setForm(f => ({...f, bankaAdi: e.target.value}))} data-testid="input-hesap-banka-adi" />
            </div>
            <div className="space-y-1.5">
              <Label>Hesap Adı *</Label>
              <Input value={form.hesapAdi} onChange={e => setForm(f => ({...f, hesapAdi: e.target.value}))} data-testid="input-hesap-ad" />
            </div>
            <div className="space-y-1.5">
              <Label>Şube</Label>
              <Input value={form.subeAdi} onChange={e => setForm(f => ({...f, subeAdi: e.target.value}))} data-testid="input-hesap-sube" />
            </div>
            <div className="space-y-1.5">
              <Label>SWIFT / BIC Kodu</Label>
              <Input value={form.swift} onChange={e => setForm(f => ({...f, swift: e.target.value.toUpperCase()}))} placeholder="GARAN2AXXX" data-testid="input-hesap-swift" />
            </div>

            <div className="col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label>IBAN&apos;lar</Label>
                <Button type="button" variant="outline" size="sm" onClick={ibanEkle}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> IBAN Ekle
                </Button>
              </div>
              <div className="space-y-2">
                {form.ibanGirisler.map((g, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Select value={g.pb} onValueChange={v => ibanGuncelle(i, "pb", v)}>
                      <SelectTrigger className="w-24 shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>{PARA_BIRIMLERI.map(pb => <SelectItem key={pb} value={pb}>{pb}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input
                      value={g.iban}
                      onChange={e => ibanGuncelle(i, "iban", e.target.value.toUpperCase())}
                      placeholder="TR00 0000 0000 0000 0000 0000 00"
                      className="flex-1 font-mono text-sm"
                      data-testid={`input-iban-${i}`}
                    />
                    {form.ibanGirisler.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => ibanSil(i)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Her banka hesabına birden fazla para birimi IBAN eklenebilir.</p>
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label>Açıklama</Label>
              <Input value={form.aciklama} onChange={e => setForm(f => ({...f, aciklama: e.target.value}))} />
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
            <Button onClick={kaydet} disabled={!form.catiFirmaId || !form.hesapAdi} data-testid="button-hesap-kaydet">Kaydet</Button>
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
