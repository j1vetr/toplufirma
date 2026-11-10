import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListBankaHesaplari, getListBankaHesaplariQueryKey,
  useCreateOdeme,
  useGetFaturaTahsilatEslesmeleri, getGetFaturaTahsilatEslesmeleriQueryKey, useKarsilaFaturaTahsilattan,
} from "@workspace/api-client-react";
import type { OdemeInputOdemeYontemi } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { hesapParaBirimleri } from "@/lib/banka-para-birimleri";
import TahsilatIslemBilgisi from "@/components/tahsilat-islem-bilgisi";

const YONTEM_ETIKET: Record<string, string> = {
  banka_havalesi: "Banka Havalesi",
  eft: "EFT",
  nakit: "Nakit",
  kredi_karti: "Kredi Kartı",
  wise: "Wise",
  paypal: "PayPal",
  diger: "Diğer",
};

const apiHataMesaji = (e: unknown, varsayilan: string) =>
  (e as { data?: { error?: string } })?.data?.error ?? varsayilan;

/** Hesabın kayıtlı para birimlerinden (ana + IBAN'lar) biri pb ile uyumlu mu? */
const hesapPbUyumlu = (h: { paraBirimi?: string | null; ibanlar?: Record<string, string> | null }, pb: string) =>
  hesapParaBirimleri(h).includes(pb);

function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface OdemeModalFatura {
  id: number;
  faturaNo: string;
  catiFirmaId: number;
  bagliFirmaId?: number | null;
  paraBirimi: string;
  kalanTutar?: number | null;
  genelToplam: number;
}

interface OdemeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fatura: OdemeModalFatura | null;
  onSuccess?: () => void;
  initialMode?: "yeni" | "tahsilat";
}

export default function OdemeModal({ open, onOpenChange, fatura, onSuccess, initialMode = "yeni" }: OdemeModalProps) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [odemeTutar, setOdemeTutar] = useState("");
  const [odemeParaBirimi, setOdemeParaBirimi] = useState("USD");
  const [odemeTarih, setOdemeTarih] = useState(localToday());
  const [odemeYontemi, setOdemeYontemi] = useState("banka_havalesi");
  const [odemeBankaId, setOdemeBankaId] = useState("none");
  const [odemeAciklama, setOdemeAciklama] = useState("");
  const [mode, setMode] = useState(initialMode);
  const eslesme = useKarsilaFaturaTahsilattan();
  const mevcut = useGetFaturaTahsilatEslesmeleri(fatura?.id ?? 0, {
    query: { queryKey: getGetFaturaTahsilatEslesmeleriQueryKey(fatura?.id ?? 0), enabled: open && !!fatura, staleTime: 0, refetchOnMount: "always" },
  });

  const { data: bankaHesaplari = [] } = useListBankaHesaplari(undefined, {
    query: { queryKey: getListBankaHesaplariQueryKey(), enabled: open && !!fatura },
  });

  const faturaHesaplari = bankaHesaplari.filter(
    b => b.catiFirmaId === fatura?.catiFirmaId && b.faturadaGoster !== false
      && (!fatura || hesapPbUyumlu(b, fatura.paraBirimi))
  );

  const createOdeme = useCreateOdeme();

  useEffect(() => {
    if (!open || !fatura) return;
    const kalan = fatura.kalanTutar ?? fatura.genelToplam;
    setOdemeTutar(String(kalan > 0 ? kalan : fatura.genelToplam));
    setOdemeParaBirimi(fatura.paraBirimi);
    setOdemeTarih(localToday());
    setOdemeYontemi("banka_havalesi");
    setOdemeBankaId("none");
    setOdemeAciklama("");
    setMode(initialMode);
  }, [open, fatura?.id, initialMode]);

  function basarili(mesaj: string) {
    qc.invalidateQueries();
    onOpenChange(false);
    toast({ title: mesaj });
    onSuccess?.();
  }

  function odemeKaydet() {
    if (!fatura || !odemeTutar || !odemeTarih) return;
    if (mode === "tahsilat") {
      eslesme.mutate({ id: fatura.id, data: { tutar: Number(odemeTutar) } }, {
        onSuccess: () => basarili("Mevcut tahsilattan karşılandı. Yeni para girişi oluşturulmadı."),
        onError: (e: unknown) => toast({ title: "Tahsilattan karşılanamadı", description: apiHataMesaji(e, "Sunucu hatası"), variant: "destructive" }),
      });
      return;
    }
    createOdeme.mutate({
      data: {
        catiFirmaId: fatura.catiFirmaId,
        bagliFirmaId: fatura.bagliFirmaId ?? undefined,
        faturaId: fatura.id,
        tip: "tahsilat",
        tarih: odemeTarih,
        tutar: Number(odemeTutar),
        paraBirimi: odemeParaBirimi,
        odemeYontemi: odemeYontemi as OdemeInputOdemeYontemi,
        bankaHesabiId: odemeBankaId !== "none" ? Number(odemeBankaId) : undefined,
        aciklama: odemeAciklama || `Fatura ${fatura.faturaNo} ödemesi`,
      },
    }, {
      onSuccess: () => {
        basarili("Ödeme kaydedildi");
      },
      onError: (e: unknown) => toast({ title: "Ödeme kaydedilemedi", description: apiHataMesaji(e, "Sunucu hatası"), variant: "destructive" }),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ödeme Kaydet - {fatura?.faturaNo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label>İşlem</Label>
              <TahsilatIslemBilgisi />
            </div>
            <Select value={mode} onValueChange={v => setMode(v === "tahsilat" ? "tahsilat" : "yeni")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yeni">Yeni Tahsilat Kaydet</SelectItem>
                <SelectItem value="tahsilat">Tahsilattan Ödendi</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {mode === "yeni"
                ? "Yeni para girişi kaydedilir. Tutar borcun bir kısmını karşılıyorsa fatura Kısmi Ödendi olur."
                : "Daha önce aynı bağlı firma ve para birimi için girilmiş tahsilatlar kullanılır. Yeni tahsilat veya kasa hareketi oluşmaz. En eski tahsilattan başlanır."}
            </p>
          </div>
          {mode === "tahsilat" && (
            <div className="border p-3 text-sm">
              {mevcut.isLoading ? "Kullanılabilir tahsilatlar yükleniyor..." : mevcut.isError ? (
                <div>Tahsilatlar alınamadı. <Button variant="link" onClick={() => mevcut.refetch()}>Tekrar dene</Button></div>
              ) : <>Kullanılabilir tahsilat: <strong>{(mevcut.data?.kullanilabilirTutar ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {fatura?.paraBirimi}</strong></>}
            </div>
          )}
          <p className="text-sm text-muted-foreground">Fatura kalan borcu: {(fatura?.kalanTutar ?? fatura?.genelToplam ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {fatura?.paraBirimi}. Kısmi ödeme için karşılanan tutarı girin.</p>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label>Tutar *</Label>
              <Input
                type="number"
                value={odemeTutar}
                onChange={e => setOdemeTutar(e.target.value)}
                step="0.01"
                min="0.01"
                max={fatura?.kalanTutar ?? fatura?.genelToplam}
              />
            </div>
            <div className="w-28 space-y-1.5">
              <Label>Para Birimi</Label>
              <Select value={odemeParaBirimi} onValueChange={setOdemeParaBirimi} disabled>
                <SelectTrigger data-testid="select-odeme-modal-pb"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={fatura?.paraBirimi ?? odemeParaBirimi}>{fatura?.paraBirimi ?? odemeParaBirimi}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Fatura para birimi</p>
            </div>
          </div>

          {mode === "yeni" && <><div className="space-y-1.5">
            <Label>Tarih *</Label>
            <Input
              type="date"
              value={odemeTarih}
              onChange={e => setOdemeTarih(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Ödeme Yöntemi</Label>
            <Select value={odemeYontemi} onValueChange={setOdemeYontemi}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(YONTEM_ETIKET).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {faturaHesaplari.length > 0 && (
            <div className="space-y-1.5">
              <Label>
                Banka Hesabı{" "}
                <span className="text-xs text-muted-foreground">(opsiyonel)</span>
              </Label>
              <Select value={odemeBankaId} onValueChange={setOdemeBankaId}>
                <SelectTrigger><SelectValue placeholder="Belirtilmedi" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Belirtilmedi</SelectItem>
                  {faturaHesaplari.map(b => {
                    const pbs = hesapParaBirimleri(b);
                    return (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.bankaAdi ? `${b.bankaAdi} - ` : ""}
                        {b.hesapAdi}
                        {pbs.length > 0 ? ` (${pbs.join(", ")})` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>
              Açıklama{" "}
              <span className="text-xs text-muted-foreground">(opsiyonel)</span>
            </Label>
            <Input
              value={odemeAciklama}
              onChange={e => setOdemeAciklama(e.target.value)}
              placeholder={`Fatura ${fatura?.faturaNo ?? ""} ödemesi`}
            />
          </div></>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>İptal</Button>
          <Button
            onClick={odemeKaydet}
            disabled={!odemeTutar || Number(odemeTutar) <= 0 || Number(odemeTutar) > (fatura?.kalanTutar ?? fatura?.genelToplam ?? 0) || !odemeTarih || createOdeme.isPending || eslesme.isPending || (mode === "tahsilat" && (mevcut.isLoading || mevcut.isError || Number(odemeTutar) > (mevcut.data?.kullanilabilirTutar ?? 0)))}
          >
            {createOdeme.isPending || eslesme.isPending ? "Kaydediliyor..." : mode === "tahsilat" ? "Tahsilattan karşıla" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
