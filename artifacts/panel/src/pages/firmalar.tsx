import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListFirmalar, getListFirmalarQueryKey,
  useCreateFirma, useUpdateFirma, useDeleteFirma,
  useGetFirmaEpostaAyarlari, getGetFirmaEpostaAyarlariQueryKey, useUpsertFirmaEpostaAyarlari,
  useGetFirmaEkstre, getGetFirmaEkstreQueryKey,
} from "@workspace/api-client-react";
import type { Firma } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useYetki } from "@/hooks/use-yetki";
import {
  Plus, Pencil, Trash2, Building2, ChevronDown, ChevronRight,
  Mail, FileBarChart, Users, Download,
} from "lucide-react";

const apiBase = () => {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api`;
};

async function ekstrePdfIndir(firmaId: number, firmaAd: string, baslangic: string, bitis: string) {
  const token = localStorage.getItem("panel_token");
  const params = new URLSearchParams({ baslangicTarihi: baslangic, bitisTarihi: bitis });
  const resp = await fetch(`${apiBase()}/firmalar/${firmaId}/ekstre/pdf?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) throw new Error("PDF indirilemedi");
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${firmaAd.replace(/\s+/g, "-")}-ekstre.pdf`; a.click();
  URL.revokeObjectURL(url);
}

async function ekstreExcelIndir(firmaId: number, firmaAd: string, baslangic: string, bitis: string) {
  const token = localStorage.getItem("panel_token");
  const params = new URLSearchParams({ baslangicTarihi: baslangic, bitisTarihi: bitis });
  const resp = await fetch(`${apiBase()}/firmalar/${firmaId}/ekstre/excel?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) throw new Error("Excel indirilemedi");
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${firmaAd.replace(/\s+/g, "-")}-ekstre.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

function ekstreCsvIndir(ekstreData: { kalemler?: Array<{ tarih: string; tip: string; aciklama?: string | null; referansNo?: string | null; borc?: number | null; alacak?: number | null; tutar?: number | null; paraBirimi?: string | null }> | null }, firmaAd: string) {
  const kalemler = ekstreData.kalemler ?? [];
  const satirlar = [
    ["Tarih", "Tip", "Açıklama", "Referans No", "Borç", "Alacak", "Para Birimi"],
    ...kalemler.map(k => [
      k.tarih,
      k.tip === "fatura" ? "Fatura" : "Ödeme",
      k.aciklama ?? "",
      k.referansNo ?? "",
      k.tip === "fatura" ? String(k.borc ?? k.tutar ?? 0) : "",
      k.tip !== "fatura" ? String(k.alacak ?? k.tutar ?? 0) : "",
      k.paraBirimi ?? "",
    ]),
  ];
  const csv = satirlar.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${firmaAd.replace(/\s+/g, "-")}-ekstre.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

interface FirmaForm {
  ad: string; vergiNo: string; vergiDairesi: string;
  adres: string; telefon: string; eposta: string; seriOneki: string; logoUrl: string;
  etiket: string; grupFirmaId: string;
}
const BOSH_FORMA: FirmaForm = { ad: "", vergiNo: "", vergiDairesi: "", adres: "", telefon: "", eposta: "", seriOneki: "", logoUrl: "", etiket: "", grupFirmaId: "" };

interface SmtpForm {
  smtpHost: string; smtpPort: string; smtpGuvenlik: string;
  smtpKullanici: string; smtpSifre: string; gonderenAd: string; gonderenAdres: string;
}
const BOSH_SMTP: SmtpForm = { smtpHost: "", smtpPort: "587", smtpGuvenlik: "starttls", smtpKullanici: "", smtpSifre: "", gonderenAd: "", gonderenAdres: "" };

export default function Firmalar() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { canWrite } = useYetki();

  const [acikGrupFirmaId, setAcikGrupFirmaId] = useState<number | null>(null);
  const [firmaModal, setFirmaModal] = useState(false);
  const [duzenleId, setDuzenleId] = useState<number | null>(null);
  const [modalTip, setModalTip] = useState<"cati" | "grup" | "bagli">("grup");
  const [form, setForm] = useState<FirmaForm>(BOSH_FORMA);
  const [silId, setSilId] = useState<number | null>(null);

  const [smtpFirmaId, setSmtpFirmaId] = useState<number | null>(null);
  const [smtpForm, setSmtpForm] = useState<SmtpForm>(BOSH_SMTP);

  const [ekstreFirmaId, setEkstreFirmaId] = useState<number | null>(null);
  const [ekstreFirmaAd, setEkstreFirmaAd] = useState("");
  const [ekstreBaslangic, setEkstreBaslangic] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [ekstreBitis, setEkstreBitis] = useState(new Date().toISOString().split("T")[0]);

  const { data: catiFirmalar = [], isLoading } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );
  const { data: bagliFirmalar = [] } = useListFirmalar(
    { tip: "bagli" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "bagli"] } },
  );
  const { data: grupFirmalar = [] } = useListFirmalar(
    { tip: "grup" as import("@workspace/api-client-react").ListFirmalarTip },
    { query: { queryKey: [...getListFirmalarQueryKey(), "grup"] } },
  );

  const { data: smtpData } = useGetFirmaEpostaAyarlari(smtpFirmaId!, {
    query: { enabled: !!smtpFirmaId, queryKey: getGetFirmaEpostaAyarlariQueryKey(smtpFirmaId!) },
  });

  useEffect(() => {
    if (smtpData) {
      setSmtpForm({
        smtpHost: smtpData.smtpHost ?? "",
        smtpPort: String(smtpData.smtpPort ?? 587),
        smtpGuvenlik: smtpData.smtpGuvenlik ?? "starttls",
        smtpKullanici: smtpData.smtpKullanici ?? "",
        smtpSifre: "",
        gonderenAd: smtpData.gonderenAd ?? "",
        gonderenAdres: smtpData.gonderenAdres ?? "",
      });
    }
  }, [smtpData]);

  const upsertSmtp = useUpsertFirmaEpostaAyarlari();

  const { data: ekstreData, isLoading: ekstreYukleniyor } = useGetFirmaEkstre(
    ekstreFirmaId!,
    { baslangicTarihi: ekstreBaslangic, bitisTarihi: ekstreBitis },
    { query: { enabled: !!ekstreFirmaId, queryKey: getGetFirmaEkstreQueryKey(ekstreFirmaId!, { baslangicTarihi: ekstreBaslangic, bitisTarihi: ekstreBitis }) } },
  );

  const createFirma = useCreateFirma();
  const updateFirma = useUpdateFirma();
  const deleteFirma = useDeleteFirma();

  function acFirmaModal(tip: "cati" | "grup" | "bagli", preGrupId?: number, id?: number) {
    setModalTip(tip);
    if (id) {
      const tum = [...catiFirmalar, ...bagliFirmalar, ...grupFirmalar];
      const f = tum.find(x => x.id === id);
      if (!f) return;
      setForm({
        ad: f.ad, vergiNo: f.vergiNo ?? "", vergiDairesi: f.vergiDairesi ?? "",
        adres: f.adres ?? "", telefon: f.telefon ?? "", eposta: f.eposta ?? "",
        seriOneki: f.seriOneki ?? "",
        etiket: (f as unknown as Record<string, unknown>).etiket as string ?? "",
        logoUrl: (f as unknown as Record<string, unknown>).logoUrl as string ?? "",
        grupFirmaId: (f as unknown as Record<string, unknown>).grupFirmaId != null
          ? String((f as unknown as Record<string, unknown>).grupFirmaId) : "",
      });
      setDuzenleId(id);
    } else {
      setForm({ ...BOSH_FORMA, grupFirmaId: preGrupId ? String(preGrupId) : "" });
      setDuzenleId(null);
    }
    setFirmaModal(true);
  }

  function logoDosyaSec(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Lütfen bir resim dosyası seçin", variant: "destructive" });
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      toast({ title: "Logo 1.5 MB'den küçük olmalı", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, logoUrl: reader.result as string }));
    reader.readAsDataURL(file);
  }

  function kaydetFirma() {
    if (!form.ad) return;
    const data = {
      tip: modalTip as import("@workspace/api-client-react").FirmaInputTip,
      ad: form.ad,
      ...(form.vergiNo && { vergiNo: form.vergiNo }),
      ...(form.vergiDairesi && { vergiDairesi: form.vergiDairesi }),
      ...(form.adres && { adres: form.adres }),
      ...(form.telefon && { telefon: form.telefon }),
      ...(form.eposta && { eposta: form.eposta }),
      ...(form.seriOneki && { seriOneki: form.seriOneki }),
      ...(form.etiket && { etiket: form.etiket }),
      ...(form.logoUrl && { logoUrl: form.logoUrl }),
      ...(modalTip === "bagli" && form.grupFirmaId && { grupFirmaId: Number(form.grupFirmaId) }),
      aktif: true,
    };
    if (duzenleId) {
      updateFirma.mutate({ id: duzenleId, data }, {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListFirmalarQueryKey() });
          setFirmaModal(false);
          toast({ title: "Firma güncellendi" });
        },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    } else {
      createFirma.mutate({ data }, {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListFirmalarQueryKey() });
          setFirmaModal(false);
          toast({ title: "Firma oluşturuldu" });
        },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    }
  }

  function acSmtpModal(firma: Firma) {
    setSmtpFirmaId(firma.id);
    setSmtpForm(BOSH_SMTP);
  }

  function kaydetSmtp() {
    if (!smtpFirmaId) return;
    upsertSmtp.mutate({
      id: smtpFirmaId,
      data: {
        smtpHost: smtpForm.smtpHost,
        smtpPort: Number(smtpForm.smtpPort),
        smtpGuvenlik: smtpForm.smtpGuvenlik as import("@workspace/api-client-react").FirmaEpostaAyarlariInputSmtpGuvenlik,
        smtpKullanici: smtpForm.smtpKullanici,
        smtpSifre: smtpForm.smtpSifre || undefined,
        gonderenAd: smtpForm.gonderenAd,
        gonderenAdres: smtpForm.gonderenAdres,
        aktif: true,
      },
    }, {
      onSuccess: () => {
        setSmtpFirmaId(null);
        toast({ title: "SMTP ayarları kaydedildi" });
      },
      onError: () => toast({ title: "Hata", variant: "destructive" }),
    });
  }

  const bagliFirmaFor = (grupId: number) =>
    bagliFirmalar.filter(b => (b as unknown as Record<string, unknown>).grupFirmaId === grupId);

  if (isLoading) return (
    <div className="animate-pulse space-y-4">
      {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted rounded-none" />)}
    </div>
  );

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end gap-2">
          <Button onClick={() => acFirmaModal("cati")} variant="outline" data-testid="button-cati-firma-ekle">
            <Plus className="mr-2 h-4 w-4" /> Firmanız Ekle
          </Button>
          <Button onClick={() => acFirmaModal("grup")} data-testid="button-grup-firma-ekle">
            <Plus className="mr-2 h-4 w-4" /> Çatı Firma Ekle
          </Button>
        </div>
      )}

      {/* Firmanız (cati) — faturayı kesen, ayrı basit bölüm */}
      {catiFirmalar.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> Firmanız
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 border-t">
            <div className="divide-y">
              {catiFirmalar.map(cati => (
                <div key={cati.id} className="flex items-center gap-3 px-4 py-3" data-testid={`card-cati-${cati.id}`}>
                  <div className="w-9 h-9 rounded-sm bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                    {cati.logoUrl ? <img src={cati.logoUrl} alt={cati.ad} className="w-full h-full object-contain" /> : <Building2 className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{cati.ad}</p>
                      <Badge variant="outline" className="text-xs">Firmanız</Badge>
                      {(cati as unknown as Record<string, unknown>).etiket && <Badge className="text-xs bg-[#ffed00] text-black border-0 hover:bg-[#ffed00]">{String((cati as unknown as Record<string, unknown>).etiket)}</Badge>}
                      {!cati.aktif && <Badge variant="secondary" className="text-xs">Pasif</Badge>}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                      {cati.vergiNo && <span>VKN: {cati.vergiNo}</span>}
                      {cati.eposta && <span>{cati.eposta}</span>}
                      {cati.seriOneki && <span>Seri: {cati.seriOneki}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {canWrite && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="SMTP Ayarları" onClick={() => acSmtpModal(cati)}>
                        <Mail className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canWrite && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => acFirmaModal("cati", undefined, cati.id)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canWrite && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setSilId(cati.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Çatı Firma (grup) — expandable, altında Bağlı Firmalar */}
      {grupFirmalar.length === 0 && catiFirmalar.length === 0 && (
        <div className="text-center text-muted-foreground py-20">
          <Building2 className="h-14 w-14 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">Henüz firma eklenmemiş.</p>
          <p className="text-sm mt-1">Çatı firma ekleyerek başlayın.</p>
        </div>
      )}

      {grupFirmalar.map(grup => {
        const bagliler = bagliFirmaFor(grup.id);
        const acik = acikGrupFirmaId === grup.id;
        return (
          <Card key={grup.id} className="overflow-hidden" data-testid={`card-grup-${grup.id}`}>
            <CardHeader className="p-0">
              <div className="flex items-center gap-3 p-4">
                <button
                  onClick={() => setAcikGrupFirmaId(acik ? null : grup.id)}
                  className="flex items-center gap-3 flex-1 text-left"
                >
                  <div className="w-10 h-10 rounded-sm bg-amber-500/10 flex items-center justify-center shrink-0 overflow-hidden">
                    {grup.logoUrl ? <img src={grup.logoUrl} alt={grup.ad} className="w-full h-full object-contain" /> : <Building2 className="h-5 w-5 text-amber-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-base">{grup.ad}</h3>
                      <Badge variant="outline" className="text-xs">Çatı Firma</Badge>
                      {(grup as unknown as Record<string, unknown>).etiket && <Badge className="text-xs bg-[#ffed00] text-black border-0 hover:bg-[#ffed00]">{String((grup as unknown as Record<string, unknown>).etiket)}</Badge>}
                      {!grup.aktif && <Badge variant="secondary">Pasif</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {grup.vergiNo && <span>VKN: {grup.vergiNo}</span>}
                      {grup.eposta && <span>{grup.eposta}</span>}
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{bagliler.length} bağlı firma</span>
                    </div>
                  </div>
                  {acik ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
                <div className="flex gap-1 shrink-0">
                  {canWrite && (
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => acFirmaModal("grup", undefined, grup.id)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {canWrite && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setSilId(grup.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            {acik && (
              <CardContent className="p-0 border-t bg-muted/30">
                <div className="px-4 py-3 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Bağlı Firmalar</p>
                  {canWrite && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => acFirmaModal("bagli", grup.id)}>
                      <Plus className="mr-1 h-3 w-3" /> Bağlı Firma Ekle
                    </Button>
                  )}
                </div>
                {bagliler.length === 0 ? (
                  <div className="px-4 pb-4 text-sm text-muted-foreground">Henüz bağlı firma yok.</div>
                ) : (
                  <div className="divide-y">
                    {bagliler.map(b => (
                      <div key={b.id} className="flex items-center gap-3 px-4 py-3" data-testid={`card-bagli-${b.id}`}>
                        <div className="w-8 h-8 rounded-sm bg-blue-500/10 flex items-center justify-center shrink-0 overflow-hidden">
                          {b.logoUrl ? <img src={b.logoUrl} alt={b.ad} className="w-full h-full object-contain" /> : <Building2 className="h-4 w-4 text-blue-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm">{b.ad}</p>
                            {(b as unknown as Record<string, unknown>).etiket && <Badge className="text-xs bg-[#ffed00] text-black border-0 hover:bg-[#ffed00]">{String((b as unknown as Record<string, unknown>).etiket)}</Badge>}
                          </div>
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            {b.vergiNo && <span>VKN: {b.vergiNo}</span>}
                            {b.eposta && <span>{b.eposta}</span>}
                            {b.telefon && <span>{b.telefon}</span>}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs text-blue-600 border-blue-200">Bağlı Firma</Badge>
                        {!b.aktif && <Badge variant="secondary" className="text-xs">Pasif</Badge>}
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Ekstre" onClick={() => { setEkstreFirmaId(b.id); setEkstreFirmaAd(b.ad); }}>
                            <FileBarChart className="h-3.5 w-3.5" />
                          </Button>
                          {canWrite && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => acFirmaModal("bagli", grup.id, b.id)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canWrite && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setSilId(b.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      <Dialog open={firmaModal} onOpenChange={setFirmaModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{duzenleId ? "Firmayı Düzenle" : modalTip === "cati" ? "Yeni Firmanız" : modalTip === "grup" ? "Yeni Çatı Firma" : "Yeni Bağlı Firma"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Firma Adı *</Label>
              <Input value={form.ad} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))} data-testid="input-firma-ad" />
            </div>
            <div className="space-y-1.5">
              <Label>Vergi No</Label>
              <Input value={form.vergiNo} onChange={e => setForm(f => ({ ...f, vergiNo: e.target.value }))} data-testid="input-firma-vkn" />
            </div>
            <div className="space-y-1.5">
              <Label>Vergi Dairesi</Label>
              <Input value={form.vergiDairesi} onChange={e => setForm(f => ({ ...f, vergiDairesi: e.target.value }))} data-testid="input-firma-vd" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefon</Label>
              <Input value={form.telefon} onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))} data-testid="input-firma-telefon" />
            </div>
            <div className="space-y-1.5">
              <Label>E-posta</Label>
              <Input type="email" value={form.eposta} onChange={e => setForm(f => ({ ...f, eposta: e.target.value }))} data-testid="input-firma-eposta" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Adres</Label>
              <Input value={form.adres} onChange={e => setForm(f => ({ ...f, adres: e.target.value }))} data-testid="input-firma-adres" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Etiket <span className="text-xs text-muted-foreground">(opsiyonel — ülke, bölge vb.)</span></Label>
              <Input value={form.etiket} onChange={e => setForm(f => ({ ...f, etiket: e.target.value }))} placeholder="Örn: İngiltere, Kıbrıs, Hollanda" data-testid="input-firma-etiket" />
            </div>
            {modalTip === "cati" && (
              <div className="space-y-1.5">
                <Label>Fatura Seri Öneki</Label>
                <Input value={form.seriOneki} onChange={e => setForm(f => ({ ...f, seriOneki: e.target.value.toUpperCase() }))} maxLength={6} placeholder="LAC" data-testid="input-firma-seri" />
              </div>
            )}
            {modalTip === "bagli" && (
              <div className="col-span-2 space-y-1.5">
                <Label>Çatı Firma <span className="text-xs text-muted-foreground">(opsiyonel)</span></Label>
                <Select
                  value={form.grupFirmaId || "none"}
                  onValueChange={v => setForm(f => ({ ...f, grupFirmaId: v === "none" ? "" : v }))}
                >
                  <SelectTrigger data-testid="select-grup-firma"><SelectValue placeholder="Seçiniz" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Yok —</SelectItem>
                    {grupFirmalar.map(g => (
                      <SelectItem key={g.id} value={String(g.id)}>{g.ad}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {modalTip === "cati" && (
              <div className="col-span-2 space-y-1.5">
                <Label>Logo <span className="text-xs text-muted-foreground">(faturada görünür)</span></Label>
                <div className="flex items-center gap-3">
                  {form.logoUrl && (
                    <img src={form.logoUrl} alt="logo" className="h-12 w-12 rounded object-contain border bg-white" />
                  )}
                  <Input type="file" accept="image/*" onChange={e => logoDosyaSec(e.target.files?.[0])} className="flex-1" data-testid="input-firma-logo-dosya" />
                  {form.logoUrl && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, logoUrl: "" }))}>Kaldır</Button>
                  )}
                </div>
                <Input value={form.logoUrl.startsWith("data:") ? "" : form.logoUrl} onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))} placeholder="veya logo URL'si: https://..." className="mt-1.5" data-testid="input-firma-logo" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFirmaModal(false)}>İptal</Button>
            <Button onClick={kaydetFirma} disabled={!form.ad || createFirma.isPending || updateFirma.isPending} data-testid="button-firma-kaydet">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!smtpFirmaId} onOpenChange={o => !o && setSmtpFirmaId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>SMTP / E-posta Ayarları</DialogTitle></DialogHeader>
          {smtpData && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-none border p-3 mb-2">
              Mevcut: {smtpData.smtpHost}:{smtpData.smtpPort} — {smtpData.gonderenAdres}
            </div>
          )}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">SMTP Host *</Label>
                <Input className="h-8 text-sm" value={smtpForm.smtpHost} onChange={e => setSmtpForm(f => ({ ...f, smtpHost: e.target.value }))} placeholder="mail.example.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Port</Label>
                <Input className="h-8 text-sm" type="number" value={smtpForm.smtpPort} onChange={e => setSmtpForm(f => ({ ...f, smtpPort: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Güvenlik</Label>
              <Select value={smtpForm.smtpGuvenlik} onValueChange={v => setSmtpForm(f => ({ ...f, smtpGuvenlik: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="starttls">STARTTLS</SelectItem>
                  <SelectItem value="ssl">SSL/TLS</SelectItem>
                  <SelectItem value="none">Yok</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Kullanıcı *</Label>
                <Input className="h-8 text-sm" value={smtpForm.smtpKullanici} onChange={e => setSmtpForm(f => ({ ...f, smtpKullanici: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Şifre</Label>
                <Input className="h-8 text-sm" type="password" value={smtpForm.smtpSifre} onChange={e => setSmtpForm(f => ({ ...f, smtpSifre: e.target.value }))} placeholder="Değiştirmek için girin" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Gönderen Ad *</Label>
                <Input className="h-8 text-sm" value={smtpForm.gonderenAd} onChange={e => setSmtpForm(f => ({ ...f, gonderenAd: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Gönderen Adres *</Label>
                <Input className="h-8 text-sm" type="email" value={smtpForm.gonderenAdres} onChange={e => setSmtpForm(f => ({ ...f, gonderenAdres: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSmtpFirmaId(null)}>İptal</Button>
            <Button
              onClick={kaydetSmtp}
              disabled={!smtpForm.smtpHost || !smtpForm.smtpKullanici || !smtpForm.gonderenAd || !smtpForm.gonderenAdres || upsertSmtp.isPending}
            >Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ekstreFirmaId} onOpenChange={o => !o && setEkstreFirmaId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{ekstreFirmaAd} — Cari Ekstre</DialogTitle></DialogHeader>
          <div className="flex gap-3 items-end pb-2 border-b flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">Başlangıç</Label>
              <Input type="date" className="h-8 text-sm w-36" value={ekstreBaslangic} onChange={e => setEkstreBaslangic(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bitiş</Label>
              <Input type="date" className="h-8 text-sm w-36" value={ekstreBitis} onChange={e => setEkstreBitis(e.target.value)} />
            </div>
            {ekstreData && (ekstreData.kalemler ?? []).length > 0 && (
              <div className="ml-auto flex gap-1.5 flex-wrap">
                <Button
                  size="sm" variant="outline"
                  className="gap-1.5 text-xs h-8"
                  onClick={() => ekstreCsvIndir(ekstreData, ekstreFirmaAd ?? "ekstre")}
                >
                  <Download className="h-3.5 w-3.5" />CSV İndir
                </Button>
                <Button
                  size="sm" variant="outline"
                  className="gap-1.5 text-xs h-8"
                  onClick={() => {
                    if (!ekstreFirmaId) return;
                    ekstreExcelIndir(ekstreFirmaId, ekstreFirmaAd ?? "ekstre", ekstreBaslangic, ekstreBitis)
                      .catch(() => {});
                  }}
                >
                  <Download className="h-3.5 w-3.5" />Excel İndir
                </Button>
                <Button
                  size="sm" variant="outline"
                  className="gap-1.5 text-xs h-8"
                  onClick={() => {
                    if (!ekstreFirmaId) return;
                    ekstrePdfIndir(ekstreFirmaId, ekstreFirmaAd ?? "ekstre", ekstreBaslangic, ekstreBitis)
                      .catch(() => {});
                  }}
                >
                  <Download className="h-3.5 w-3.5" />PDF İndir
                </Button>
              </div>
            )}
          </div>
          {ekstreYukleniyor ? (
            <div className="animate-pulse space-y-2 mt-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-muted rounded" />)}</div>
          ) : ekstreData ? (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Toplam Borç</p><p className="font-bold text-red-500">{fmt(ekstreData.toplamBorc)}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Toplam Alacak</p><p className="font-bold text-green-600">{fmt(ekstreData.toplamAlacak)}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Kalan Bakiye</p><p className={`font-bold ${ekstreData.kalanBakiye > 0 ? "text-red-500" : "text-blue-600"}`}>{fmt(ekstreData.kalanBakiye)}</p></CardContent></Card>
              </div>
              <div className="space-y-1">
                {(ekstreData.kalemler ?? []).map((k, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                    <div>
                      <p className="font-medium">{k.aciklama ?? k.referansNo ?? "-"}</p>
                      <p className="text-xs text-muted-foreground">{k.tarih} {k.referansNo && k.aciklama ? `• ${k.referansNo}` : ""}</p>
                    </div>
                    <span className={`font-semibold ${k.tip === "fatura" ? "text-red-500" : "text-green-600"}`}>
                      {k.tip === "fatura" ? "-" : "+"}{fmt(k.borc ?? k.alacak ?? k.tutar, k.paraBirimi)}
                    </span>
                  </div>
                ))}
                {(ekstreData.kalemler ?? []).length === 0 && (
                  <p className="text-center text-muted-foreground py-6 text-sm">Bu dönemde hareket yok.</p>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!silId} onOpenChange={o => !o && setSilId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Firmayı sil</AlertDialogTitle>
            <AlertDialogDescription>Bu işlem geri alınamaz. Firmaya bağlı tüm veriler de silinebilir.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!silId) return;
              deleteFirma.mutate({ id: silId }, {
                onSuccess: () => { qc.invalidateQueries({ queryKey: getListFirmalarQueryKey() }); setSilId(null); toast({ title: "Firma silindi" }); },
                onError: () => toast({ title: "Silinemedi", variant: "destructive" }),
              });
            }}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
