import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListBankaHesaplari, getListBankaHesaplariQueryKey,
  useCreateOdeme, getListOdemelerQueryKey, getListFaturalarQueryKey, getGetFaturaQueryKey,
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

const YONTEM_ETIKET: Record<string, string> = {
  banka_havalesi: "Banka Havalesi",
  eft: "EFT",
  nakit: "Nakit",
  kredi_karti: "Kredi Kartı",
  wise: "Wise",
  paypal: "PayPal",
  diger: "Diğer",
};

const PARA_BIRIMLERI = ["USD", "EUR", "TRY", "GBP"];

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
}

export default function OdemeModal({ open, onOpenChange, fatura, onSuccess }: OdemeModalProps) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [odemeTutar, setOdemeTutar] = useState("");
  const [odemeParaBirimi, setOdemeParaBirimi] = useState("USD");
  const [odemeTarih, setOdemeTarih] = useState(localToday());
  const [odemeYontemi, setOdemeYontemi] = useState("banka_havalesi");
  const [odemeBankaId, setOdemeBankaId] = useState("none");
  const [odemeAciklama, setOdemeAciklama] = useState("");

  const { data: bankaHesaplari = [] } = useListBankaHesaplari(undefined, {
    query: { queryKey: getListBankaHesaplariQueryKey(), enabled: open && !!fatura },
  });

  const faturaHesaplari = bankaHesaplari.filter(
    b => b.catiFirmaId === fatura?.catiFirmaId && b.faturadaGoster !== false
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
  }, [open, fatura]);

  function onBankaChange(bankaId: string) {
    setOdemeBankaId(bankaId);
    if (bankaId && bankaId !== "none") {
      const banka = faturaHesaplari.find(b => String(b.id) === bankaId);
      if (banka?.paraBirimi) setOdemeParaBirimi(banka.paraBirimi);
    }
  }

  function odemeKaydet() {
    if (!fatura || !odemeTutar || !odemeTarih) return;
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
        qc.invalidateQueries({ queryKey: getListFaturalarQueryKey() });
        qc.invalidateQueries({ queryKey: getListOdemelerQueryKey() });
        qc.invalidateQueries({ queryKey: getGetFaturaQueryKey(fatura.id) });
        onOpenChange(false);
        toast({ title: "Ödeme kaydedildi" });
        onSuccess?.();
      },
      onError: () => toast({ title: "Ödeme kaydedilemedi", variant: "destructive" }),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ödeme Kaydet — {fatura?.faturaNo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label>Tutar *</Label>
              <Input
                type="number"
                value={odemeTutar}
                onChange={e => setOdemeTutar(e.target.value)}
                step="0.01"
                min="0"
              />
            </div>
            <div className="w-28 space-y-1.5">
              <Label>Para Birimi</Label>
              <Select value={odemeParaBirimi} onValueChange={setOdemeParaBirimi}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PARA_BIRIMLERI.map(pb => (
                    <SelectItem key={pb} value={pb}>{pb}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
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
              <Select value={odemeBankaId} onValueChange={onBankaChange}>
                <SelectTrigger><SelectValue placeholder="Belirtilmedi" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Belirtilmedi</SelectItem>
                  {faturaHesaplari.map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.bankaAdi ? `${b.bankaAdi} — ` : ""}
                      {b.hesapAdi}
                      {b.paraBirimi ? ` (${b.paraBirimi})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {odemeBankaId !== "none" && (
                <p className="text-xs text-muted-foreground">
                  Para birimi seçilen hesabın birimine ayarlandı; dilediğiniz gibi değiştirebilirsiniz.
                </p>
              )}
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
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>İptal</Button>
          <Button
            onClick={odemeKaydet}
            disabled={!odemeTutar || !odemeTarih || createOdeme.isPending}
          >
            {createOdeme.isPending ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
