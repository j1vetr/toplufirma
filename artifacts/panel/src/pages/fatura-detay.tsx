import { useState } from "react";
import { useRoute } from "wouter";
import { Link } from "wouter";
import { useQueryClient, useQuery } from "@tanstack/react-query";
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useYetki } from "@/hooks/use-yetki";
import { ArrowLeft, Plus, Download, Mail, CheckCircle2, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { useLocation } from "wouter";

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

const DURUM_RENK: Record<string, string> = {
  taslak: "bg-slate-500/10 text-slate-500",
  acik: "bg-orange-500/10 text-orange-600",
  kismi_odendi: "bg-yellow-500/10 text-yellow-600",
  odendi: "bg-green-500/10 text-green-600",
  iptal: "bg-gray-500/10 text-gray-500",
};
const DURUM_ETIKET: Record<string, string> = {
  taslak: "Taslak", acik: "Açık", kismi_odendi: "Kısmi Ödendi", odendi: "Ödendi", iptal: "İptal",
};

const YONTEM_ETIKET: Record<string, string> = {
  banka_havalesi: "Banka Havalesi", eft: "EFT", nakit: "Nakit",
  kredi_karti: "Kredi Kartı", wise: "Wise", paypal: "PayPal", diger: "Diğer",
};

const apiBase = () => {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api`;
};


async function pdfIndir(id: number, faturaNo: string) {
  const token = localStorage.getItem("panel_token");
  const resp = await fetch(`${apiBase()}/faturalar/${id}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) throw new Error("PDF indirilemedi");
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `fatura-${faturaNo}.pdf`; a.click();
  URL.revokeObjectURL(url);
}

export default function FaturaDetay() {
  const [, params] = useRoute("/faturalar/:id");
  const id = Number(params?.id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { canWrite } = useYetki();
  const [odemeModal, setOdemeModal] = useState(false);
  const [odemeTutar, setOdemeTutar] = useState("");
  const [odemeTarih, setOdemeTarih] = useState(new Date().toISOString().split("T")[0]);
  const [odemeYontemi, setOdemeYontemi] = useState("banka_havalesi");
  const [odemeBankaId, setOdemeBankaId] = useState("");
  const [odemeAciklama, setOdemeAciklama] = useState("");

  const [gonderModal, setGonderModal] = useState(false);
  const [aliciAdres, setAliciAdres] = useState("");
  const [aliciAd, setAliciAd] = useState("");
  const [gonderKonu, setGonderKonu] = useState("");
  const [gonderMesaj, setGonderMesaj] = useState("");
  const [gecmisAcik, setGecmisAcik] = useState(false);
  const [gonderiyor, setGonderiyor] = useState(false);
  const [pdfIndiriyor, setPdfIndiriyor] = useState(false);
  const [, navigate] = useLocation();

  const { data: fatura, isLoading } = useGetFatura(id, { query: { enabled: !!id, queryKey: getGetFaturaQueryKey(id) } });
  const { data: bankaHesaplari = [] } = useListBankaHesaplari(undefined, { query: { queryKey: getListBankaHesaplariQueryKey() } });

  interface GonderiGecmisiSatir { id: number; aliciEposta: string; gonderenAd: string | null; gonderilmeTarihi: string; }
  const { data: gonderiGecmisi = [] } = useQuery<GonderiGecmisiSatir[]>({
    queryKey: ["fatura-gonderi-gecmisi", id],
    queryFn: async () => {
      const token = localStorage.getItem("panel_token") ?? "";
      const r = await fetch(`${apiBase()}/faturalar/${id}/gonderi-gecmisi`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!id,
  });
  const createOdeme = useCreateOdeme();
  const updateFatura = useUpdateFatura();

  const faturaHesaplari = bankaHesaplari.filter(b => b.catiFirmaId === fatura?.catiFirmaId && b.faturadaGoster !== false);

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

  async function gonderFatura() {
    if (!aliciAdres) return;
    setGonderiyor(true);
    try {
      const token = localStorage.getItem("panel_token");
      const resp = await fetch(`${apiBase()}/faturalar/${id}/gonder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          aliciAdres,
          aliciAd: aliciAd || undefined,
          konu: gonderKonu || undefined,
          mesaj: gonderMesaj || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Gönderim başarısız");
      setGonderModal(false); setAliciAdres(""); setAliciAd("");
      qc.invalidateQueries({ queryKey: ["fatura-gonderi-gecmisi", id] });
      toast({ title: data.mesaj ?? "E-posta gönderildi" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Hata", variant: "destructive" });
    } finally {
      setGonderiyor(false);
    }
  }

  if (isLoading) return <div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded-none" /><div className="h-64 bg-muted rounded-none" /></div>;
  if (!fatura) return <div className="text-center py-16 text-muted-foreground">Fatura bulunamadı.</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/faturalar"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        {fatura.catiFirmaLogoUrl && (
          <img src={fatura.catiFirmaLogoUrl} alt={fatura.catiFirmaAd ?? ""} className="h-10 w-auto max-w-[100px] object-contain rounded" />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-display font-semibold">{fatura.faturaNo}</h2>
            <span className={`text-sm px-2.5 py-0.5 rounded-full font-medium ${DURUM_RENK[fatura.durum]}`}>{DURUM_ETIKET[fatura.durum]}</span>
          </div>
          <p className="text-sm text-muted-foreground">{fatura.bagliFirmaAd} {fatura.gemiAdImo ? `- ${fatura.gemiAdImo}` : ""}</p>
          <p className="text-xs text-muted-foreground">{fatura.catiFirmaAd}</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {canWrite && (
            <Button
              variant="outline" size="sm"
              onClick={() => {
                const kopya = {
                  catiFirmaId: fatura.catiFirmaId,
                  bagliFirmaId: fatura.bagliFirmaId,
                  grupFirmaId: fatura.grupFirmaId ?? null,
                  gemiId: fatura.gemiId ?? null,
                  faturaAdi: fatura.faturaAdi ?? "",
                  paraBirimi: fatura.paraBirimi,
                  notlar: fatura.notlar ?? "",
                  kalemler: fatura.kalemler?.map(k => ({
                    aciklama: k.aciklama, miktar: k.miktar, birimFiyat: k.birimFiyat, kdvOrani: k.kdvOrani,
                  })) ?? [],
                };
                sessionStorage.setItem("fatura_kopya", JSON.stringify(kopya));
                navigate("/faturalar/yeni");
              }}
            >
              <Copy className="mr-1 h-4 w-4" /> Kopyala
            </Button>
          )}
          <Button
            variant="outline" size="sm"
            disabled={pdfIndiriyor}
            onClick={async () => {
              setPdfIndiriyor(true);
              try { await pdfIndir(id, fatura.faturaNo); }
              catch { toast({ title: "PDF indirilemedi", variant: "destructive" }); }
              finally { setPdfIndiriyor(false); }
            }}
          >
            <Download className="mr-1 h-4 w-4" /> {pdfIndiriyor ? "İndiriliyor..." : "PDF"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setGonderModal(true)}>
            <Mail className="mr-1 h-4 w-4" /> E-posta
          </Button>
          {canWrite && fatura.durum === "taslak" && (
            <Button size="sm" onClick={() => durumGuncelle("acik")} disabled={updateFatura.isPending} data-testid="button-kesinlestir">
              <CheckCircle2 className="mr-1 h-4 w-4" /> Kesinleştir
            </Button>
          )}
          {canWrite && (fatura.durum === "acik" || fatura.durum === "kismi_odendi") && (
            <Button size="sm" onClick={() => setOdemeModal(true)} data-testid="button-odeme-ekle">
              <Plus className="mr-1 h-4 w-4" /> Ödeme Kaydet
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Müşteri Bilgileri</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            {([
              ["Müşteri Adı", fatura.bagliFirmaAd],
              ["Müşteri Adresi", fatura.bagliFirmaAdres],
              ["Fatura Adı", fatura.faturaAdi],
              ["Fatura Tarihi", fatura.faturaTarihi],
              ["Çatı / Grup Firma", fatura.grupFirmaAd],
              ["Gemi", fatura.gemiAdImo],
              ["Vade Tarihi", fatura.vadeTarihi],
              ["Para Birimi", fatura.paraBirimi],
              ["Kendi Firmamız", fatura.catiFirmaAd],
            ] as [string, string | null | undefined][]).map(([e, d]) => d ? (
              <div key={e}>
                <p className="text-muted-foreground text-xs">{e}</p>
                <p className="font-medium mt-0.5">{d}</p>
              </div>
            ) : null)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Fatura Kalemleri</CardTitle>
          {canWrite ? (
            <Select value={fatura.durum} onValueChange={durumGuncelle}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(DURUM_ETIKET).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${DURUM_RENK[fatura.durum]}`}>{DURUM_ETIKET[fatura.durum]}</span>
          )}
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
            <div className="flex justify-end gap-8 pt-1 border-t font-semibold">
              <span>Genel Toplam</span>
              <span className="w-32 text-right">{fmt(fatura.genelToplam, fatura.paraBirimi)}</span>
            </div>
            {(fatura.kalanTutar ?? 0) > 0 && fatura.durum !== "odendi" && (
              <div className="flex justify-end gap-8 text-orange-600">
                <span>Kalan Bakiye</span>
                <span className="w-32 text-right">{fmt(fatura.kalanTutar ?? 0, fatura.paraBirimi)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {fatura.notlar && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Notlar</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{fatura.notlar}</p></CardContent>
        </Card>
      )}

      {faturaHesaplari.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Ödeme Bilgileri</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {faturaHesaplari.map(b => {
              const ibanlar = (b.ibanlar && Object.keys(b.ibanlar).length > 0)
                ? b.ibanlar
                : (b.iban && b.paraBirimi ? { [b.paraBirimi]: b.iban } : {});
              const swift = (b as unknown as Record<string,unknown>).swift as string | undefined;
              return (
                <div key={b.id} className="text-sm p-3 bg-muted/50 rounded-none border">
                  {b.bankaAdi && <p className="font-medium">{b.bankaAdi}</p>}
                  <p className="text-muted-foreground text-xs">{b.hesapAdi}</p>
                  <div className="mt-1.5 space-y-0.5">
                    {Object.entries(ibanlar).map(([pb, iban]) => (
                      <p key={pb} className={`font-mono text-xs ${pb === fatura?.paraBirimi ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                        <span className="text-foreground">{pb} IBAN:</span> {iban}
                      </p>
                    ))}
                  </div>
                  {swift && <p className="font-mono text-xs text-muted-foreground mt-0.5">SWIFT: {swift}</p>}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Collapsible open={gecmisAcik} onOpenChange={setGecmisAcik}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-2 cursor-pointer select-none">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Gönderim Geçmişi
                  {gonderiGecmisi.length > 0 && (
                    <span className="text-xs font-normal text-muted-foreground">({gonderiGecmisi.length})</span>
                  )}
                </CardTitle>
                {gecmisAcik ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {gonderiGecmisi.length === 0 ? (
                <p className="text-sm text-muted-foreground">Henüz gönderim yapılmamış.</p>
              ) : (
                <div className="space-y-2">
                  {gonderiGecmisi.map(g => (
                    <div key={g.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                      <div>
                        <p className="font-medium">{g.aliciEposta}</p>
                        {g.gonderenAd && <p className="text-xs text-muted-foreground">Gönderen: {g.gonderenAd}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                        {new Date(g.gonderilmeTarihi).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={odemeModal} onOpenChange={setOdemeModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ödeme Kaydet — {fatura.faturaNo}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tutar *</Label>
              <Input type="number" value={odemeTutar} onChange={e => setOdemeTutar(e.target.value)} step="0.01" />
            </div>
            <div className="space-y-1.5">
              <Label>Tarih *</Label>
              <Input type="date" value={odemeTarih} onChange={e => setOdemeTarih(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ödeme Yöntemi</Label>
              <Select value={odemeYontemi} onValueChange={setOdemeYontemi}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(YONTEM_ETIKET).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {faturaHesaplari.length > 0 && (
              <div className="space-y-1.5">
                <Label>Banka Hesabı</Label>
                <Select value={odemeBankaId} onValueChange={setOdemeBankaId}>
                  <SelectTrigger><SelectValue placeholder="Seçiniz (opsiyonel)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Belirtilmedi</SelectItem>
                    {faturaHesaplari.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.bankaAdi} — {b.hesapAdi}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Açıklama</Label>
              <Input value={odemeAciklama} onChange={e => setOdemeAciklama(e.target.value)} placeholder="Opsiyonel" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOdemeModal(false)}>İptal</Button>
            <Button onClick={odemeKaydet} disabled={!odemeTutar || createOdeme.isPending}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={gonderModal} onOpenChange={o => { setGonderModal(o); if (!o) { setAliciAdres(""); setAliciAd(""); setGonderKonu(""); setGonderMesaj(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Mail className="h-4 w-4" />Faturayı E-posta ile Gönder</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              Fatura PDF eki ile çatı firmanın SMTP ayarları üzerinden gönderilir.
            </p>
            <div className="space-y-1.5">
              <Label>Alıcı E-posta <span className="text-destructive">*</span></Label>
              <Input type="email" value={aliciAdres} onChange={e => setAliciAdres(e.target.value)} placeholder="musteri@firma.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Alıcı Ad</Label>
              <Input value={aliciAd} onChange={e => setAliciAd(e.target.value)} placeholder="Firma / Kişi adı (opsiyonel)" />
            </div>
            <div className="space-y-1.5">
              <Label>E-posta Konusu</Label>
              <Input value={gonderKonu} onChange={e => setGonderKonu(e.target.value)} placeholder={`Fatura ${fatura?.faturaNo ?? ""} — ${fatura?.catiFirmaAd ?? ""}`} />
            </div>
            <div className="space-y-1.5">
              <Label>Özel Mesaj <span className="text-xs text-muted-foreground">(opsiyonel)</span></Label>
              <textarea
                className="flex min-h-[72px] w-full border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                value={gonderMesaj}
                onChange={e => setGonderMesaj(e.target.value)}
                placeholder="Fatura için ek bir notunuz varsa buraya yazın..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGonderModal(false)}>İptal</Button>
            <Button onClick={gonderFatura} disabled={!aliciAdres || gonderiyor}>
              {gonderiyor ? "Gönderiliyor..." : "Gönder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
