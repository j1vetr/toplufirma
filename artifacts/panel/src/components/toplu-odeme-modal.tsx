import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDagitFaturaTahsilati, useListOdemeler, getListOdemelerQueryKey,
  useListBankaHesaplari, getListBankaHesaplariQueryKey,
  type TahsilatDagitimInput,
} from "@workspace/api-client-react";
import type { OdemeModalFatura } from "./odeme-modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { hesapParaBirimleri } from "@/lib/banka-para-birimleri";
import TahsilatIslemBilgisi from "./tahsilat-islem-bilgisi";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  faturalar: OdemeModalFatura[];
  onSuccess?: () => void;
  initialMode?: "yeni" | "tahsilat";
}
const kalan = (f: OdemeModalFatura) => f.kalanTutar ?? f.genelToplam;
const para = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kurus = (s: string) => {
  if (!s.trim()) return null;
  const n = Number(s), k = Math.round(n * 100);
  return Number.isSafeInteger(k) && k > 0 && Math.abs(n * 100 - k) < 1e-6 ? k : null;
};
const yontemler = {
  banka_havalesi: "Banka Havalesi", eft: "EFT", nakit: "Nakit", kredi_karti: "Kredi Kartı",
  wise: "Wise", paypal: "PayPal", diger: "Diğer",
};

export default function TopluOdemeModal({ open, onOpenChange, faturalar, onSuccess, initialMode = "yeni" }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const ilk = faturalar[0];
  const [mode, setMode] = useState<"yeni" | "tahsilat">(initialMode);
  const [tutarlar, setTutarlar] = useState<Record<number, string>>({});
  const [tahsilatId, setTahsilatId] = useState("");
  const [tarih, setTarih] = useState("");
  const [yontem, setYontem] = useState<NonNullable<TahsilatDagitimInput["odemeYontemi"]>>("banka_havalesi");
  const [bankaId, setBankaId] = useState("none");
  const [aciklama, setAciklama] = useState("");
  const mutation = useDagitFaturaTahsilati();
  const params = { catiFirmaId: ilk.catiFirmaId, bagliFirmaId: ilk.bagliFirmaId ?? undefined, tip: "tahsilat" as const };
  const mevcut = useListOdemeler(params, {
    query: { queryKey: getListOdemelerQueryKey(params), enabled: open && mode === "tahsilat", staleTime: 0, refetchOnMount: "always" },
  });
  const bankalar = useListBankaHesaplari(undefined, {
    query: { queryKey: getListBankaHesaplariQueryKey(), enabled: open, staleTime: 0 },
  });
  const hesaplar = (bankalar.data ?? []).filter(b => b.catiFirmaId === ilk.catiFirmaId && hesapParaBirimleri(b).includes(ilk.paraBirimi));
  const kaynaklar = (mevcut.data ?? []).filter(o =>
    o.bagliFirmaId === ilk.bagliFirmaId && o.paraBirimi === ilk.paraBirimi && !o.faturaId && (o.kullanilmamisTutar ?? 0) > 0,
  );
  const kaynak = kaynaklar.find(o => String(o.id) === tahsilatId);
  const secimKey = faturalar.map(f => f.id).join(",");
  useEffect(() => {
    if (!open) return;
    setTutarlar(Object.fromEntries(faturalar.map(f => [f.id, String(kalan(f))])));
    setMode(initialMode);
    setTahsilatId("");
    const now = new Date();
    setTarih(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
    setYontem("banka_havalesi");
    setBankaId("none");
    setAciklama("");
  }, [open, secimKey, initialMode]);

  const amounts = faturalar.map(f => kurus(tutarlar[f.id] ?? ""));
  const toplamKurus = amounts.reduce<number>((s, k) => s + (k ?? 0), 0);
  const toplam = toplamKurus / 100;
  const uyumlu = faturalar.every(f => f.catiFirmaId === ilk.catiFirmaId && f.bagliFirmaId === ilk.bagliFirmaId && f.paraBirimi === ilk.paraBirimi);
  const hataliTutar = amounts.some((k, i) => k == null || k > Math.round(kalan(faturalar[i]) * 100));
  const kaynakYetersiz = !kaynak || toplamKurus > Math.round((kaynak.kullanilmamisTutar ?? 0) * 100);
  const disabled = mutation.isPending || !uyumlu || hataliTutar || (
    mode === "tahsilat" ? mevcut.isFetching || mevcut.isError || kaynakYetersiz : !tarih
  );

  function kaydet() {
    if (disabled) return;
    const data: TahsilatDagitimInput = {
      catiFirmaId: ilk.catiFirmaId, kaynak: mode,
      dagitimlar: faturalar.map((f, i) => ({ faturaId: f.id, tutar: amounts[i]! / 100 })),
      ...(mode === "tahsilat" ? { tahsilatId: Number(tahsilatId) } : {
        tarih, odemeYontemi: yontem, bankaHesabiId: bankaId === "none" ? undefined : Number(bankaId), aciklama: aciklama || undefined,
      }),
    };
    mutation.mutate({ data }, {
      onSuccess: () => {
        void qc.invalidateQueries();
        onOpenChange(false);
        onSuccess?.();
        toast({ title: mode === "yeni" ? "Tek tahsilat kaydedildi ve faturalara dağıtıldı" : "Mevcut tahsilat dağıtıldı. Yeni para girişi oluşturulmadı." });
      },
      onError: (e: unknown) => toast({
        title: "Dağıtım kaydedilemedi",
        description: (e as { data?: { error?: string } })?.data?.error ?? "Hiçbir değişiklik yapılmadı. Tekrar deneyin.",
        variant: "destructive",
      }),
    });
  }

  return <Dialog open={open} onOpenChange={v => { if (!mutation.isPending) onOpenChange(v); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-testid="toplu-odeme-modal">
      <DialogHeader><DialogTitle>Ödeme Kaydet - {faturalar.length} Faturaya Dağıt</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-1"><Label>İşlem</Label><TahsilatIslemBilgisi /></div>
          <Select value={mode} onValueChange={v => setMode(v === "tahsilat" ? "tahsilat" : "yeni")} disabled={mutation.isPending}>
            <SelectTrigger data-testid="select-toplu-kaynak"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="yeni">Yeni Tahsilat Kaydet</SelectItem><SelectItem value="tahsilat">Tahsilattan Ödendi</SelectItem></SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{mode === "yeni"
            ? "Dağıtılan toplam için yalnızca bir yeni para girişi kaydedilir."
            : "Seçtiğiniz mevcut tahsilat kullanılır. Yeni tahsilat veya kasa hareketi oluşturulmaz."}</p>
        </div>
        {mode === "tahsilat" && <div className="space-y-2">
          <Label>Mevcut Tahsilat</Label>
          {mevcut.isLoading ? <p>Tahsilatlar yükleniyor...</p> : mevcut.isError
            ? <p>Tahsilatlar alınamadı. <Button type="button" variant="link" onClick={() => void mevcut.refetch()}>Tekrar Dene</Button></p>
            : kaynaklar.length ? <Select value={tahsilatId} onValueChange={setTahsilatId} disabled={mutation.isPending}>
              <SelectTrigger data-testid="select-toplu-tahsilat"><SelectValue placeholder="Kullanılacak tahsilatı seçin" /></SelectTrigger>
              <SelectContent>{kaynaklar.map(o => <SelectItem key={o.id} value={String(o.id)}>
                #{o.id} - {o.tarih} - Kullanılabilir: {para(o.kullanilmamisTutar ?? 0)} {o.paraBirimi}{o.aciklama ? ` (${o.aciklama})` : ""}
              </SelectItem>)}</SelectContent>
            </Select> : <p className="text-sm text-muted-foreground">Bu firma ve para biriminde kullanılmamış tahsilat yok.</p>}
        </div>}
        {!uyumlu && <p role="alert" className="text-destructive">Faturalar aynı bağlı firma ve para biriminde olmalı.</p>}
        <fieldset disabled={mutation.isPending} className="space-y-3">
          <legend className="mb-2 text-sm font-medium">Faturalara Ayrılacak Tutarlar ({ilk.paraBirimi})</legend>
          {faturalar.map((f, i) => <div key={f.id} className="flex flex-wrap items-center gap-2 border p-3">
            <div className="min-w-40 flex-1">
              <Label htmlFor={`dagitim-${f.id}`}>{f.faturaNo}</Label>
              <p className="text-xs text-muted-foreground">Kalan borç: {para(kalan(f))} {f.paraBirimi}</p>
              {amounts[i] != null && amounts[i]! <= Math.round(kalan(f) * 100) && <p className="text-xs text-muted-foreground">
                İşlem sonrası: {para((Math.round(kalan(f) * 100) - amounts[i]!) / 100)} {f.paraBirimi}
              </p>}
            </div>
            <Input id={`dagitim-${f.id}`} className="w-36" type="number" min="0.01" step="0.01" max={kalan(f)}
              value={tutarlar[f.id] ?? ""} onChange={e => setTutarlar(t => ({ ...t, [f.id]: e.target.value }))} />
          </div>)}
        </fieldset>
        {hataliTutar && <p role="alert" className="text-sm text-destructive">Her faturaya sıfırdan büyük, kalan borcu aşmayan ve en fazla iki ondalıklı tutar girin.</p>}
        <div className="border bg-muted p-3 text-sm font-medium" data-testid="toplu-dagitim-toplami">
          {mode === "yeni" ? "Tek Yeni Tahsilat" : "Mevcut Tahsilattan Kullanılacak"}: {para(toplam)} {ilk.paraBirimi}
          {mode === "tahsilat" && kaynak && <p className="mt-1 font-normal">
            Tahsilatta kalan: {para((kaynak.kullanilmamisTutar ?? 0) - toplam)} {ilk.paraBirimi}
          </p>}
        </div>
        {mode === "tahsilat" && kaynak && kaynakYetersiz && <p role="alert" className="text-sm text-destructive">Dağıtım toplamı seçilen tahsilatın kullanılabilir tutarını aşıyor.</p>}
        {mode === "yeni" && <fieldset disabled={mutation.isPending} className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="toplu-tarih">Tarih</Label><Input id="toplu-tarih" type="date" value={tarih} onChange={e => setTarih(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Ödeme Yöntemi</Label>
            <Select value={yontem} onValueChange={v => setYontem(v as typeof yontem)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(yontemler).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Banka Hesabı (isteğe bağlı)</Label>
            <Select value={bankaId} onValueChange={setBankaId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Belirtilmedi</SelectItem>
                {hesaplar.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.bankaAdi} - {b.hesapAdi}</SelectItem>)}
              </SelectContent>
            </Select>
            {bankalar.isError && <p className="text-xs text-destructive">Banka hesapları alınamadı. <Button type="button" variant="link" onClick={() => void bankalar.refetch()}>Tekrar Dene</Button></p>}
          </div>
          <div className="space-y-1.5"><Label htmlFor="toplu-aciklama">Açıklama (isteğe bağlı)</Label><Input id="toplu-aciklama" value={aciklama} onChange={e => setAciklama(e.target.value)} /></div>
        </fieldset>}
      </div>
      <DialogFooter>
        <Button variant="outline" disabled={mutation.isPending} onClick={() => onOpenChange(false)}>İptal</Button>
        <Button disabled={disabled} onClick={kaydet} data-testid="button-toplu-dagitim-kaydet">
          {mutation.isPending ? "Kaydediliyor..." : mode === "yeni" ? "Tek Tahsilat Kaydet ve Dağıt" : "Mevcut Tahsilattan Dağıt"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
