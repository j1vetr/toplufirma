import { useState } from "react";
import { useRoute } from "wouter";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetFatura, getGetFaturaQueryKey,
  useListBankaHesaplari, getListBankaHesaplariQueryKey,
  useCreateOdeme, getListOdemelerQueryKey, getListFaturalarQueryKey,
  useUpdateFatura,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Printer } from "lucide-react";

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

const DURUM_RENK: Record<string, string> = {
  acik: "bg-orange-500/10 text-orange-600",
  kismi_odendi: "bg-yellow-500/10 text-yellow-600",
  odendi: "bg-green-500/10 text-green-600",
  iptal: "bg-gray-500/10 text-gray-500",
};
const DURUM_ETIKET: Record<string, string> = {
  acik: "Açık", kismi_odendi: "Kısmi Ödendi", odendi: "Ödendi", iptal: "İptal",
};

const YONTEM_ETIKET: Record<string, string> = {
  banka_havalesi: "Banka Havalesi", eft: "EFT", nakit: "Nakit",
  kredi_karti: "Kredi Kartı", wise: "Wise", paypal: "PayPal", diger: "Diğer",
};

export default function FaturaDetay() {
  const [, params] = useRoute("/faturalar/:id");
  const id = Number(params?.id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [odemeModal, setOdemeModal] = useState(false);
  const [odemeTutar, setOdemeTutar] = useState("");
  const [odemeTarih, setOdemeTarih] = useState(new Date().toISOString().split("T")[0]);
  const [odemeYontemi, setOdemeYontemi] = useState("banka_havalesi");
  const [odemeBankaId, setOdemeBankaId] = useState("");
  const [odemeAciklama, setOdemeAciklama] = useState("");

  const { data: fatura, isLoading } = useGetFatura(id, { query: { enabled: !!id, queryKey: getGetFaturaQueryKey(id) } });
  const { data: bankaHesaplari = [] } = useListBankaHesaplari(undefined, { query: { queryKey: getListBankaHesaplariQueryKey() } });
  const createOdeme = useCreateOdeme();
  const updateFatura = useUpdateFatura();

  function odemeKaydet() {
    if (!fatura || !odemeTutar || !odemeTarih) return;
    createOdeme.mutate({
      data: {
        catiFirmaId: fatura.catiFirmaId, bagliFirmaId: fatura.bagliFirmaId, faturaId: id,
        tip: "tahsilat", tarih: odemeTarih, tutar: Number(odemeTutar),
        paraBirimi: fatura.paraBirimi, odemeYontemi: odemeYontemi as import("@workspace/api-client-react").OdemeInputOdemeYontemi,
        bankaHesabiId: odemeBankaId && odemeBankaId !== "none" ? Number(odemeBankaId) : undefined,
        aciklama: odemeAciklama || `Fatura ${fatura.faturaNo} ödemesi`,
      },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetFaturaQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListOdemelerQueryKey() });
        qc.invalidateQueries({ queryKey: getListFaturalarQueryKey() });
        setOdemeModal(false); setOdemeTutar(""); toast({ title: "Ödeme kaydedildi" });
      },
      onError: () => toast({ title: "Hata", variant: "destructive" }),
    });
  }

  function durumGuncelle(durum: string) {
    updateFatura.mutate({ id, data: { durum } }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetFaturaQueryKey(id) }); toast({ title: "Durum güncellendi" }); },
      onError: () => toast({ title: "Hata", variant: "destructive" }),
    });
  }

  if (isLoading) return <div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded-xl" /><div className="h-64 bg-muted rounded-xl" /></div>;
  if (!fatura) return <div className="text-center py-16 text-muted-foreground">Fatura bulunamadı.</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/faturalar"><Button variant="ghost" size="icon" className="rounded-full"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-display font-semibold">{fatura.faturaNo}</h2>
            <span className={`text-sm px-2.5 py-0.5 rounded-full font-medium ${DURUM_RENK[fatura.durum]}`}>{DURUM_ETIKET[fatura.durum]}</span>
          </div>
          <p className="text-sm text-muted-foreground">{fatura.bagliFirmaAd} {fatura.gemiAd ? `- ${fatura.gemiAd}` : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" /> Yazdır</Button>
          {(fatura.durum === "acik" || fatura.durum === "kismi_odendi") && (
            <Button size="sm" className="rounded-full" onClick={() => setOdemeModal(true)} data-testid="button-odeme-ekle">
              <Plus className="mr-1 h-4 w-4" /> Ödeme Kaydet
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        {[
          ["Fatura Tarihi", fatura.faturaTarihi],
          ["Vade Tarihi", fatura.vadeTarihi],
          ["Para Birimi", fatura.paraBirimi],
          ["Çatı Firma", fatura.catiFirmaAd],
        ].map(([e, d]) => d ? (
          <Card key={e}><CardContent className="p-3"><p className="text-muted-foreground text-xs">{e}</p><p className="font-medium mt-0.5">{d}</p></CardContent></Card>
        ) : null)}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Fatura Kalemleri</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {fatura.kalemler?.map(k => (
              <div key={k.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <div className="flex-1">
                  <p className="font-medium">{k.aciklama}</p>
                  <p className="text-xs text-muted-foreground">{k.miktar} x {fmt(k.birimFiyat, fatura.paraBirimi)} + KDV %{k.kdvOrani}</p>
                </div>
                <span className="font-semibold">{fmt(k.genelToplam, fatura.paraBirimi)}</span>
              </div>
            ))}
          </div>
          <div className="border-t pt-3 mt-3 text-right space-y-1 text-sm">
            <div className="flex justify-end gap-8">
              <span className="text-muted-foreground">Ara Toplam</span>
              <span className="w-32 text-right">{fmt(fatura.toplamTutar, fatura.paraBirimi)}</span>
            </div>
            <div className="flex justify-end gap-8">
              <span className="text-muted-foreground">KDV</span>
              <span className="w-32 text-right">{fmt(fatura.kdvTutari, fatura.paraBirimi)}</span>
            </div>
            <div className="flex justify-end gap-8 text-base font-bold">
              <span>Genel Toplam</span>
              <span className="w-32 text-right">{fmt(fatura.genelToplam, fatura.paraBirimi)}</span>
            </div>
            {(fatura.odenenTutar ?? 0) > 0 && <>
              <div className="flex justify-end gap-8 text-green-600">
                <span>Ödenen</span>
                <span className="w-32 text-right">-{fmt(fatura.odenenTutar ?? 0, fatura.paraBirimi)}</span>
              </div>
              <div className="flex justify-end gap-8 font-bold text-orange-600">
                <span>Kalan</span>
                <span className="w-32 text-right">{fmt(fatura.kalanTutar ?? 0, fatura.paraBirimi)}</span>
              </div>
            </>}
          </div>
        </CardContent>
      </Card>

      {fatura.odemeler && fatura.odemeler.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Ödeme Kayıtları</CardTitle></CardHeader>
          <CardContent>
            {fatura.odemeler.map(o => (
              <div key={o.id} className="flex items-center justify-between py-3 border-b last:border-0 text-sm">
                <div>
                  <p className="font-medium">{YONTEM_ETIKET[o.odemeYontemi] ?? o.odemeYontemi}</p>
                  <p className="text-xs text-muted-foreground">{o.tarih} {o.aciklama ? `- ${o.aciklama}` : ""}</p>
                </div>
                <span className="font-semibold text-green-600">+{fmt(o.tutar, o.paraBirimi)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={odemeModal} onOpenChange={setOdemeModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ödeme Kaydet</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tutar *</Label>
              <Input type="number" value={odemeTutar} onChange={e => setOdemeTutar(e.target.value)} placeholder={String(fatura.kalanTutar)} step="0.01" data-testid="input-odeme-tutar" />
            </div>
            <div className="space-y-1.5">
              <Label>Tarih *</Label>
              <Input type="date" value={odemeTarih} onChange={e => setOdemeTarih(e.target.value)} data-testid="input-odeme-tarih" />
            </div>
            <div className="space-y-1.5">
              <Label>Ödeme Yöntemi</Label>
              <Select value={odemeYontemi} onValueChange={setOdemeYontemi}>
                <SelectTrigger data-testid="select-odeme-yontemi"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(YONTEM_ETIKET).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Banka Hesabı</Label>
              <Select value={odemeBankaId} onValueChange={setOdemeBankaId}>
                <SelectTrigger data-testid="select-odeme-banka"><SelectValue placeholder="Seçin (opsiyonel)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seçilmedi</SelectItem>
                  {bankaHesaplari.map(h => <SelectItem key={h.id} value={String(h.id)}>{h.bankaAdi} - {h.hesapAdi}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Açıklama</Label>
              <Input value={odemeAciklama} onChange={e => setOdemeAciklama(e.target.value)} data-testid="input-odeme-aciklama" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOdemeModal(false)} className="rounded-full">İptal</Button>
            <Button onClick={odemeKaydet} disabled={!odemeTutar || createOdeme.isPending} className="rounded-full" data-testid="button-odeme-kaydet">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
