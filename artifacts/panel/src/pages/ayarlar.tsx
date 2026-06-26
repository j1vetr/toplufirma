import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListFirmalar, getListFirmalarQueryKey,
  useCreateFirma, useUpdateFirma, useDeleteFirma,
  useGetFirmaEpostaAyarlari, getGetFirmaEpostaAyarlariQueryKey, useUpsertFirmaEpostaAyarlari,
  useListBankaHesaplari, getListBankaHesaplariQueryKey,
  useCreateBankaHesabi, useUpdateBankaHesabi, useDeleteBankaHesabi,
  useListKdvOranlari, getListKdvOranlariQueryKey,
  useCreateKdvOrani, useUpdateKdvOrani, useDeleteKdvOrani,
  useListFaturaSerileri, getListFaturaSerileriQueryKey,
  useCreateFaturaSeri, useUpdateFaturaSeri, useDeleteFaturaSeri,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useSirket } from "@/contexts/sirket-context";
import {
  Plus, Pencil, Trash2, Building2, Mail, Landmark, FileText,
  Download, Upload, ShieldAlert, DatabaseBackup, CheckCircle2, Loader2,
  Copy, Check, CopyPlus, ChevronRight, X,
} from "lucide-react";

function getToken() {
  return localStorage.getItem("panel_token") ?? "";
}

interface FirmaForm {
  ad: string; vergiNo: string; vergiDairesi: string;
  adres: string; telefon: string; eposta: string; seriOneki: string; logoUrl: string;
  etiket: string;
}
const BOSH_FIRMA: FirmaForm = { ad: "", vergiNo: "", vergiDairesi: "", adres: "", telefon: "", eposta: "", seriOneki: "", logoUrl: "", etiket: "" };

interface SmtpForm {
  smtpHost: string; smtpPort: string; smtpGuvenlik: string;
  smtpKullanici: string; smtpSifre: string; gonderenAd: string; gonderenAdres: string;
}
const BOSH_SMTP: SmtpForm = { smtpHost: "", smtpPort: "587", smtpGuvenlik: "starttls", smtpKullanici: "", smtpSifre: "", gonderenAd: "", gonderenAdres: "" };

const PARA_BIRIMLERI = ["TRY", "USD", "EUR", "GBP", "CHF", "JPY", "CAD", "AUD", "NOK", "SEK", "DKK"];

interface IbanGiris { pb: string; iban: string; }

interface HesapForm {
  catiFirmaId: string; bankaAdi: string; hesapAdi: string;
  swift: string; subeAdi: string; aciklama: string;
  faturadaGoster: boolean; ibanGirisler: IbanGiris[];
}
const BOSH_HESAP: HesapForm = { catiFirmaId: "", bankaAdi: "", hesapAdi: "", swift: "", subeAdi: "", aciklama: "", faturadaGoster: true, ibanGirisler: [{ pb: "TRY", iban: "" }] };

function hesapIbanGirisler(ibanlar?: Record<string, string> | null, legacyIban?: string | null, legacyPb?: string | null): IbanGiris[] {
  if (ibanlar && Object.keys(ibanlar).length > 0) return Object.entries(ibanlar).map(([pb, iban]) => ({ pb, iban }));
  if (legacyIban && legacyPb) return [{ pb: legacyPb, iban: legacyIban }];
  return [{ pb: "TRY", iban: "" }];
}

export default function Ayarlar() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { canWrite } = useYetki();
  const { aktifSirketId } = useSirket();

  const { data: catiFirmalar = [], isLoading: firmaYukleniyor } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );
  const { data: hesaplar = [], isLoading: hesapYukleniyor } = useListBankaHesaplari(
    aktifSirketId ? { catiFirmaId: aktifSirketId } : undefined,
    { query: { queryKey: [...getListBankaHesaplariQueryKey(), aktifSirketId] } },
  );
  const { data: kdvOranlari = [] } = useListKdvOranlari(undefined, { query: { queryKey: getListKdvOranlariQueryKey() } });
  const { data: faturaSerileri = [] } = useListFaturaSerileri(undefined, { query: { queryKey: getListFaturaSerileriQueryKey() } });

  const createFirma = useCreateFirma();
  const updateFirma = useUpdateFirma();
  const deleteFirma = useDeleteFirma();
  const createHesap = useCreateBankaHesabi();
  const updateHesap = useUpdateBankaHesabi();
  const deleteHesap = useDeleteBankaHesabi();
  const createKdv = useCreateKdvOrani();
  const updateKdv = useUpdateKdvOrani();
  const deleteKdv = useDeleteKdvOrani();
  const createSeri = useCreateFaturaSeri();
  const updateSeri = useUpdateFaturaSeri();
  const deleteSeri = useDeleteFaturaSeri();
  const upsertSmtp = useUpsertFirmaEpostaAyarlari();

  const [firmaModal, setFirmaModal] = useState(false);
  const [duzenleId, setDuzenleId] = useState<number | null>(null);
  const [firmaForm, setFirmaForm] = useState<FirmaForm>(BOSH_FIRMA);
  const [silFirmaId, setSilFirmaId] = useState<number | null>(null);

  const [smtpFirmaId, setSmtpFirmaId] = useState<number | null>(null);
  const [smtpForm, setSmtpForm] = useState<SmtpForm>(BOSH_SMTP);
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

  const [hesapModal, setHesapModal] = useState(false);
  const [duzenleHesapId, setDuzenleHesapId] = useState<number | null>(null);
  const [hesapForm, setHesapForm] = useState<HesapForm>(BOSH_HESAP);
  const [silHesapId, setSilHesapId] = useState<number | null>(null);
  const [kopyalandıId, setKopyalandıId] = useState<number | null>(null);
  const [kopyaModu, setKopyaModu] = useState(false);

  const [kdvModal, setKdvModal] = useState(false);
  const [kdvDuzenleId, setKdvDuzenleId] = useState<number | null>(null);
  const [kdvForm, setKdvForm] = useState({ catiFirmaId: "", ad: "", oran: "", varsayilan: "false" });
  const [kdvSilId, setKdvSilId] = useState<number | null>(null);

  const [seriModal, setSeriModal] = useState(false);
  const [seriDuzenleId, setSeriDuzenleId] = useState<number | null>(null);
  const [seriForm, setSeriForm] = useState({ catiFirmaId: "", ad: "", onek: "", sonrakiNo: "1", varsayilan: "false" });
  const [seriSilId, setSeriSilId] = useState<number | null>(null);

  const [yedekYukleniyor, setYedekYukleniyor] = useState(false);
  const [yuklemeYukleniyor, setYuklemeYukleniyor] = useState(false);
  const [silOnayAcik, setSilOnayAcik] = useState(false);
  const [silOnayKod, setSilOnayKod] = useState("");
  const [silSistemYukleniyor, setSilSistemYukleniyor] = useState(false);
  const dosyaInputRef = useRef<HTMLInputElement>(null);

  function acFirmaModal(id?: number) {
    if (id) {
      const f = catiFirmalar.find(x => x.id === id);
      if (!f) return;
      setFirmaForm({
        ad: f.ad, vergiNo: f.vergiNo ?? "", vergiDairesi: f.vergiDairesi ?? "",
        adres: f.adres ?? "", telefon: f.telefon ?? "", eposta: f.eposta ?? "",
        seriOneki: f.seriOneki ?? "",
        etiket: (f as unknown as Record<string, unknown>).etiket as string ?? "",
        logoUrl: (f as unknown as Record<string, unknown>).logoUrl as string ?? "",
      });
      setDuzenleId(id);
    } else {
      setFirmaForm(BOSH_FIRMA);
      setDuzenleId(null);
    }
    setFirmaModal(true);
  }

  function logoDosyaSec(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast({ title: "Lütfen bir resim dosyası seçin", variant: "destructive" }); return; }
    if (file.size > 1.5 * 1024 * 1024) { toast({ title: "Logo 1.5 MB'den küçük olmalı", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = () => setFirmaForm(f => ({ ...f, logoUrl: reader.result as string }));
    reader.readAsDataURL(file);
  }

  function kaydetFirma() {
    if (!firmaForm.ad) return;
    const data = {
      tip: "cati" as import("@workspace/api-client-react").FirmaInputTip,
      ad: firmaForm.ad,
      ...(firmaForm.vergiNo && { vergiNo: firmaForm.vergiNo }),
      ...(firmaForm.vergiDairesi && { vergiDairesi: firmaForm.vergiDairesi }),
      ...(firmaForm.adres && { adres: firmaForm.adres }),
      ...(firmaForm.telefon && { telefon: firmaForm.telefon }),
      ...(firmaForm.eposta && { eposta: firmaForm.eposta }),
      ...(firmaForm.seriOneki && { seriOneki: firmaForm.seriOneki }),
      ...(firmaForm.etiket && { etiket: firmaForm.etiket }),
      ...(firmaForm.logoUrl && { logoUrl: firmaForm.logoUrl }),
      aktif: true,
    };
    if (duzenleId) {
      updateFirma.mutate({ id: duzenleId, data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListFirmalarQueryKey() }); setFirmaModal(false); toast({ title: "Şirket güncellendi" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    } else {
      createFirma.mutate({ data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListFirmalarQueryKey() }); setFirmaModal(false); toast({ title: "Şirket oluşturuldu" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    }
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
      onSuccess: () => { setSmtpFirmaId(null); toast({ title: "SMTP ayarları kaydedildi" }); },
      onError: () => toast({ title: "Hata", variant: "destructive" }),
    });
  }

  function acHesap(id?: number) {
    setKopyaModu(false);
    if (id) {
      const h = hesaplar.find(h => h.id === id);
      if (!h) return;
      setHesapForm({
        catiFirmaId: String(h.catiFirmaId), bankaAdi: h.bankaAdi ?? "",
        hesapAdi: h.hesapAdi, swift: (h as unknown as Record<string, unknown>).swift as string ?? "",
        subeAdi: h.subeAdi ?? "", aciklama: h.aciklama ?? "",
        faturadaGoster: h.faturadaGoster ?? true,
        ibanGirisler: hesapIbanGirisler(h.ibanlar, h.iban, h.paraBirimi),
      });
      setDuzenleHesapId(id);
    } else {
      setHesapForm({ ...BOSH_HESAP, catiFirmaId: catiFirmalar[0] ? String(catiFirmalar[0].id) : "" });
      setDuzenleHesapId(null);
    }
    setHesapModal(true);
  }

  function acKopya(id: number) {
    const h = hesaplar.find(h => h.id === id);
    if (!h) return;
    setHesapForm({
      catiFirmaId: String(h.catiFirmaId), bankaAdi: h.bankaAdi ?? "",
      hesapAdi: h.hesapAdi + " (Kopya)", swift: (h as unknown as Record<string, unknown>).swift as string ?? "",
      subeAdi: h.subeAdi ?? "", aciklama: h.aciklama ?? "",
      faturadaGoster: h.faturadaGoster ?? true,
      ibanGirisler: hesapIbanGirisler(h.ibanlar, h.iban, h.paraBirimi),
    });
    setDuzenleHesapId(null);
    setKopyaModu(true);
    setHesapModal(true);
  }

  function kapatHesap() { setHesapModal(false); setDuzenleHesapId(null); setKopyaModu(false); setHesapForm(BOSH_HESAP); }

  function ibanEkle() { setHesapForm(f => ({ ...f, ibanGirisler: [...f.ibanGirisler, { pb: "USD", iban: "" }] })); }
  function ibanGuncelle(i: number, field: keyof IbanGiris, value: string) {
    setHesapForm(f => { const g = [...f.ibanGirisler]; g[i] = { ...g[i], [field]: value }; return { ...f, ibanGirisler: g }; });
  }
  function ibanSil(i: number) { setHesapForm(f => ({ ...f, ibanGirisler: f.ibanGirisler.filter((_, idx) => idx !== i) })); }

  function kaydetHesap() {
    const ibanlar: Record<string, string> = {};
    for (const g of hesapForm.ibanGirisler) { if (g.pb && g.iban.trim()) ibanlar[g.pb] = g.iban.trim(); }
    const data = { catiFirmaId: Number(hesapForm.catiFirmaId), bankaAdi: hesapForm.bankaAdi || undefined, hesapAdi: hesapForm.hesapAdi, swift: hesapForm.swift || undefined, subeAdi: hesapForm.subeAdi || undefined, aciklama: hesapForm.aciklama || undefined, aktif: true, faturadaGoster: hesapForm.faturadaGoster, ibanlar };
    if (duzenleHesapId) {
      updateHesap.mutate({ id: duzenleHesapId, data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListBankaHesaplariQueryKey() }); kapatHesap(); toast({ title: "Hesap güncellendi" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    } else {
      createHesap.mutate({ data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListBankaHesaplariQueryKey() }); kapatHesap(); toast({ title: "Hesap oluşturuldu" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    }
  }

  function kdvAc(id?: number) {
    if (id) {
      const k = kdvOranlari.find(k => k.id === id);
      if (!k) return;
      setKdvForm({ catiFirmaId: String(k.catiFirmaId), ad: k.ad, oran: String(k.oran), varsayilan: String(k.varsayilan) });
      setKdvDuzenleId(id);
    } else {
      setKdvForm({ catiFirmaId: catiFirmalar[0] ? String(catiFirmalar[0].id) : "", ad: "", oran: "", varsayilan: "false" });
      setKdvDuzenleId(null);
    }
    setKdvModal(true);
  }

  function kdvKaydet() {
    const data = { catiFirmaId: Number(kdvForm.catiFirmaId), ad: kdvForm.ad, oran: Number(kdvForm.oran), varsayilan: kdvForm.varsayilan === "true" };
    if (kdvDuzenleId) {
      updateKdv.mutate({ id: kdvDuzenleId, data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListKdvOranlariQueryKey() }); setKdvModal(false); toast({ title: "KDV oranı güncellendi" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    } else {
      createKdv.mutate({ data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListKdvOranlariQueryKey() }); setKdvModal(false); toast({ title: "KDV oranı eklendi" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    }
  }

  function seriAc(id?: number) {
    if (id) {
      const s = faturaSerileri.find(s => s.id === id);
      if (!s) return;
      setSeriForm({ catiFirmaId: String(s.catiFirmaId), ad: s.ad, onek: s.onek, sonrakiNo: String(s.sonrakiNo), varsayilan: String(s.varsayilan) });
      setSeriDuzenleId(id);
    } else {
      setSeriForm({ catiFirmaId: catiFirmalar[0] ? String(catiFirmalar[0].id) : "", ad: "", onek: "", sonrakiNo: "1", varsayilan: "false" });
      setSeriDuzenleId(null);
    }
    setSeriModal(true);
  }

  function seriKaydet() {
    const data = { catiFirmaId: Number(seriForm.catiFirmaId), ad: seriForm.ad, onek: seriForm.onek, sonrakiNo: Number(seriForm.sonrakiNo), varsayilan: seriForm.varsayilan === "true" };
    if (seriDuzenleId) {
      updateSeri.mutate({ id: seriDuzenleId, data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListFaturaSerileriQueryKey() }); setSeriModal(false); toast({ title: "Seri güncellendi" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    } else {
      createSeri.mutate({ data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListFaturaSerileriQueryKey() }); setSeriModal(false); toast({ title: "Seri eklendi" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    }
  }

  async function yedegiIndir() {
    setYedekYukleniyor(true);
    try {
      const r = await fetch("/api/admin/yedek", { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!r.ok) { const j = await r.json().catch(() => ({})); toast({ title: "Hata", description: j.error ?? "Yedek alınamadı", variant: "destructive" }); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = r.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? "yedek.sql"; a.href = url; a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Yedek indirildi", description: a.download });
    } catch { toast({ title: "Hata", description: "Yedek indirilemedi", variant: "destructive" }); }
    finally { setYedekYukleniyor(false); }
  }

  async function yedegiYukle(e: React.ChangeEvent<HTMLInputElement>) {
    const dosya = e.target.files?.[0];
    if (!dosya) return;
    e.target.value = "";
    setYuklemeYukleniyor(true);
    try {
      const r = await fetch("/api/admin/yedek-yukle", { method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/octet-stream" }, body: dosya });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) toast({ title: "Hata", description: j.error ?? "İçe aktarma başarısız", variant: "destructive" });
      else toast({ title: "Başarılı", description: j.mesaj ?? "Yedek içe aktarıldı" });
    } catch { toast({ title: "Hata", description: "Sunucuya bağlanılamadı", variant: "destructive" }); }
    finally { setYuklemeYukleniyor(false); }
  }

  async function tumuSil() {
    if (silOnayKod !== "EVET_SIL") { toast({ title: "Onay kodu yanlış", description: '"EVET_SIL" yazmanız gerekiyor', variant: "destructive" }); return; }
    setSilSistemYukleniyor(true);
    try {
      const r = await fetch("/api/admin/tum-verileri-sil", { method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ onay: silOnayKod }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) toast({ title: "Hata", description: j.error ?? "Silinemedi", variant: "destructive" });
      else { toast({ title: "Tüm veriler silindi", description: j.mesaj }); setSilOnayAcik(false); setSilOnayKod(""); }
    } catch { toast({ title: "Hata", description: "Sunucuya bağlanılamadı", variant: "destructive" }); }
    finally { setSilSistemYukleniyor(false); }
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="sirketlerimiz">
        <TabsList className="rounded-none">
          <TabsTrigger value="sirketlerimiz" className="rounded-none">Şirketlerimiz</TabsTrigger>
          <TabsTrigger value="banka-hesaplari" className="rounded-none">Banka Hesapları</TabsTrigger>
          <TabsTrigger value="tanimlar" className="rounded-none">Tanımlar</TabsTrigger>
          <TabsTrigger value="sistem" className="rounded-none">Sistem</TabsTrigger>
        </TabsList>

        {/* ── ŞİRKETLERİMİZ ── */}
        <TabsContent value="sirketlerimiz" className="mt-6 space-y-4">
          {canWrite && (
            <div className="flex justify-end">
              <Button onClick={() => acFirmaModal()} data-testid="button-cati-firma-ekle">
                <Plus className="mr-2 h-4 w-4" /> Şirket Ekle
              </Button>
            </div>
          )}
          {firmaYukleniyor ? (
            <div className="animate-pulse space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-muted rounded-none" />)}</div>
          ) : catiFirmalar.length === 0 ? (
            <div className="text-center text-muted-foreground py-16">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p>Henüz şirket eklenmemiş.</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {catiFirmalar.map(cati => (
                    <div key={cati.id} className="flex items-center gap-3 px-4 py-3" data-testid={`card-cati-${cati.id}`}>
                      <div className="w-10 h-10 rounded-sm bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                        {cati.logoUrl ? <img src={cati.logoUrl} alt={cati.ad} className="w-full h-full object-contain" /> : <Building2 className="h-5 w-5 text-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold">{cati.ad}</p>
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
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="SMTP Ayarları" onClick={() => { setSmtpFirmaId(cati.id); setSmtpForm(BOSH_SMTP); }}>
                            <Mail className="h-4 w-4" />
                          </Button>
                        )}
                        {canWrite && (
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => acFirmaModal(cati.id)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canWrite && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setSilFirmaId(cati.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── BANKA HESAPLARI ── */}
        <TabsContent value="banka-hesaplari" className="mt-6 space-y-6">
          <div className="flex items-center justify-end">
            {canWrite && (
              <Button onClick={() => acHesap()} data-testid="button-hesap-ekle">
                <Plus className="mr-2 h-4 w-4" /> Yeni Hesap
              </Button>
            )}
          </div>
          {hesapYukleniyor ? (
            <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted rounded-none" />)}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {hesaplar.map(h => {
                const ibanlar = (h.ibanlar && Object.keys(h.ibanlar).length > 0)
                  ? h.ibanlar
                  : (h.iban && h.paraBirimi ? { [h.paraBirimi]: h.iban } : {});
                const swift = (h as unknown as Record<string, unknown>).swift as string | undefined;
                const ibanGirisler = Object.entries(ibanlar);
                return (
                  <Card key={h.id} data-testid={`card-hesap-${h.id}`}>
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
                            <Button size="icon" variant="ghost" className="h-8 w-8" title="Düzenle" onClick={() => acHesap(h.id)}><Pencil className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Sil" onClick={() => setSilHesapId(h.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 space-y-0.5">
                        <p className="text-xs text-muted-foreground">{h.catiFirmaAd}</p>
                        {swift && <p className="text-xs text-muted-foreground font-mono">SWIFT: {swift}</p>}
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
                            const metin = [
                              h.bankaAdi ? `Banka: ${h.bankaAdi}` : null,
                              `Hesap Adı: ${h.hesapAdi}`,
                              ...Object.entries(ibanlar).map(([pb, iban]) => `${pb} IBAN: ${iban}`),
                              swift ? `SWIFT: ${swift}` : null,
                              h.subeAdi ? `Şube: ${h.subeAdi}` : null,
                            ].filter(Boolean).join("\n");
                            navigator.clipboard.writeText(metin);
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
                        <Link href={`/banka-hesaplari/${h.id}`} className="ml-auto">
                          <Button size="icon" variant="ghost" className="h-7 w-7"><ChevronRight className="h-4 w-4" /></Button>
                        </Link>
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
          )}
        </TabsContent>

        {/* ── TANIMLAR ── */}
        <TabsContent value="tanimlar" className="mt-6">
          <Tabs defaultValue="kdv">
            <TabsList className="rounded-none">
              <TabsTrigger value="kdv" className="rounded-none">KDV Oranları</TabsTrigger>
              <TabsTrigger value="seriler" className="rounded-none">Fatura Serileri</TabsTrigger>
            </TabsList>
            <TabsContent value="kdv" className="mt-6">
              {canWrite && (
                <div className="flex justify-end mb-4">
                  <Button onClick={() => kdvAc()} data-testid="button-kdv-ekle">
                    <Plus className="mr-2 h-4 w-4" /> KDV Oranı Ekle
                  </Button>
                </div>
              )}
              <div className="space-y-2">
                {kdvOranlari.map(k => (
                  <Card key={k.id} data-testid={`card-kdv-${k.id}`}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{k.ad}</p>
                        <p className="text-sm text-muted-foreground">{catiFirmalar.find(f => f.id === k.catiFirmaId)?.ad}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-display font-bold">%{k.oran}</span>
                        {k.varsayilan && <Badge>Varsayılan</Badge>}
                        {canWrite && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => kdvAc(k.id)}><Pencil className="h-4 w-4" /></Button>}
                        {canWrite && <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setKdvSilId(k.id)}><Trash2 className="h-4 w-4" /></Button>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {kdvOranlari.length === 0 && <div className="text-center text-muted-foreground py-10">Henüz KDV oranı tanımlanmamış.</div>}
              </div>
            </TabsContent>
            <TabsContent value="seriler" className="mt-6">
              {canWrite && (
                <div className="flex justify-end mb-4">
                  <Button onClick={() => seriAc()} data-testid="button-seri-ekle">
                    <Plus className="mr-2 h-4 w-4" /> Seri Ekle
                  </Button>
                </div>
              )}
              <div className="space-y-2">
                {faturaSerileri.map(s => (
                  <Card key={s.id} data-testid={`card-seri-${s.id}`}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{s.ad}</p>
                        <p className="text-sm text-muted-foreground">{catiFirmalar.find(f => f.id === s.catiFirmaId)?.ad}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-mono font-bold">{s.onek}000001</p>
                          <p className="text-xs text-muted-foreground">Sonraki: #{s.sonrakiNo}</p>
                        </div>
                        {s.varsayilan && <Badge>Varsayılan</Badge>}
                        {canWrite && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => seriAc(s.id)}><Pencil className="h-4 w-4" /></Button>}
                        {canWrite && <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setSeriSilId(s.id)}><Trash2 className="h-4 w-4" /></Button>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {faturaSerileri.length === 0 && <div className="text-center text-muted-foreground py-10">Henüz fatura serisi tanımlanmamış.</div>}
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ── SİSTEM ── */}
        <TabsContent value="sistem" className="mt-6">
          <div className="max-w-2xl space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <DatabaseBackup className="h-5 w-5 text-primary" />
                  <CardTitle>Veritabanı Yedekleme</CardTitle>
                </div>
                <CardDescription>
                  Tüm veritabanını SQL formatında dışa aktarın veya daha önce aldığınız bir yedeği içe aktarın.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">Yedek Al (Dışa Aktar)</p>
                  <p className="text-xs text-muted-foreground">Tüm tablo verilerini içeren bir <code>.sql</code> dosyası indirilir.</p>
                  <Button onClick={yedegiIndir} disabled={yedekYukleniyor} className="w-fit" variant="outline">
                    {yedekYukleniyor ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                    Yedeği İndir
                  </Button>
                </div>
                <div className="border-t pt-4 flex flex-col gap-2">
                  <p className="text-sm font-medium">Yedek Yükle (İçe Aktar)</p>
                  <p className="text-xs text-muted-foreground">Daha önce bu sistemden alınmış bir <code>.sql</code> yedek dosyasını seçin. Mevcut verilerle çakışabilir — önce yedek aldığınızdan emin olun.</p>
                  <input ref={dosyaInputRef} type="file" accept=".sql,text/plain,application/octet-stream" className="hidden" onChange={yedegiYukle} />
                  <Button onClick={() => dosyaInputRef.current?.click()} disabled={yuklemeYukleniyor} className="w-fit" variant="outline">
                    {yuklemeYukleniyor ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    Yedek Dosyası Seç
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card className="border-destructive/40">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                  <CardTitle className="text-destructive">Tehlikeli Bölge</CardTitle>
                </div>
                <CardDescription>Bu işlemler geri alınamaz. Devam etmeden önce yedek almanızı şiddetle öneririz.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-none border border-destructive/30 bg-destructive/5 p-4 flex flex-col gap-3">
                  <div>
                    <p className="text-sm font-semibold">Tüm İş Verilerini Sil</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Firmalar, gemiler, faturalar, ödemeler, ekipmanlar, banka hesapları ve tekrarlayan fatura şablonlarının <strong>tamamı silinir</strong>. Kullanıcı hesapları korunur.
                    </p>
                  </div>
                  <Button variant="destructive" className="w-fit" onClick={() => { setSilOnayKod(""); setSilOnayAcik(true); }}>
                    <Trash2 className="h-4 w-4 mr-2" /> Tüm Verileri Sil
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── MODALLER ── */}

      <Dialog open={firmaModal} onOpenChange={setFirmaModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{duzenleId ? "Şirketi Düzenle" : "Yeni Şirket"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Şirket Adı *</Label>
              <Input value={firmaForm.ad} onChange={e => setFirmaForm(f => ({ ...f, ad: e.target.value }))} data-testid="input-firma-ad" />
            </div>
            <div className="space-y-1.5">
              <Label>Vergi No</Label>
              <Input value={firmaForm.vergiNo} onChange={e => setFirmaForm(f => ({ ...f, vergiNo: e.target.value }))} data-testid="input-firma-vkn" />
            </div>
            <div className="space-y-1.5">
              <Label>Vergi Dairesi</Label>
              <Input value={firmaForm.vergiDairesi} onChange={e => setFirmaForm(f => ({ ...f, vergiDairesi: e.target.value }))} data-testid="input-firma-vd" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefon</Label>
              <Input value={firmaForm.telefon} onChange={e => setFirmaForm(f => ({ ...f, telefon: e.target.value }))} data-testid="input-firma-telefon" />
            </div>
            <div className="space-y-1.5">
              <Label>E-posta</Label>
              <Input type="email" value={firmaForm.eposta} onChange={e => setFirmaForm(f => ({ ...f, eposta: e.target.value }))} data-testid="input-firma-eposta" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Adres</Label>
              <Input value={firmaForm.adres} onChange={e => setFirmaForm(f => ({ ...f, adres: e.target.value }))} data-testid="input-firma-adres" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Etiket <span className="text-xs text-muted-foreground">(opsiyonel — ülke, bölge vb.)</span></Label>
              <Input value={firmaForm.etiket} onChange={e => setFirmaForm(f => ({ ...f, etiket: e.target.value }))} placeholder="Örn: Türkiye, İngiltere, Kıbrıs" data-testid="input-firma-etiket" />
            </div>
            <div className="space-y-1.5">
              <Label>Fatura Seri Öneki</Label>
              <Input value={firmaForm.seriOneki} onChange={e => setFirmaForm(f => ({ ...f, seriOneki: e.target.value.toUpperCase() }))} maxLength={6} placeholder="LAC" data-testid="input-firma-seri" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Logo <span className="text-xs text-muted-foreground">(faturada görünür)</span></Label>
              <div className="flex items-center gap-3">
                {firmaForm.logoUrl && <img src={firmaForm.logoUrl} alt="logo" className="h-12 w-12 rounded object-contain border bg-white" />}
                <Input type="file" accept="image/*" onChange={e => logoDosyaSec(e.target.files?.[0])} className="flex-1" data-testid="input-firma-logo-dosya" />
                {firmaForm.logoUrl && <Button type="button" variant="ghost" size="sm" onClick={() => setFirmaForm(f => ({ ...f, logoUrl: "" }))}>Kaldır</Button>}
              </div>
              <Input value={firmaForm.logoUrl.startsWith("data:") ? "" : firmaForm.logoUrl} onChange={e => setFirmaForm(f => ({ ...f, logoUrl: e.target.value }))} placeholder="veya logo URL'si: https://..." className="mt-1.5" data-testid="input-firma-logo" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFirmaModal(false)}>İptal</Button>
            <Button onClick={kaydetFirma} disabled={!firmaForm.ad || createFirma.isPending || updateFirma.isPending} data-testid="button-firma-kaydet">Kaydet</Button>
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
            <Button onClick={kaydetSmtp} disabled={!smtpForm.smtpHost || !smtpForm.smtpKullanici || !smtpForm.gonderenAd || !smtpForm.gonderenAdres || upsertSmtp.isPending}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={hesapModal} onOpenChange={setHesapModal}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{duzenleHesapId ? "Hesabı Düzenle" : kopyaModu ? "Hesabı Kopyala" : "Yeni Banka Hesabı"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Çatı Firma *</Label>
              <Select value={hesapForm.catiFirmaId} onValueChange={v => setHesapForm(f => ({ ...f, catiFirmaId: v }))}>
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
              <Input value={hesapForm.bankaAdi} onChange={e => setHesapForm(f => ({ ...f, bankaAdi: e.target.value }))} data-testid="input-hesap-banka-adi" />
            </div>
            <div className="space-y-1.5">
              <Label>Hesap Adı *</Label>
              <Input value={hesapForm.hesapAdi} onChange={e => setHesapForm(f => ({ ...f, hesapAdi: e.target.value }))} data-testid="input-hesap-ad" />
            </div>
            <div className="space-y-1.5">
              <Label>Şube</Label>
              <Input value={hesapForm.subeAdi} onChange={e => setHesapForm(f => ({ ...f, subeAdi: e.target.value }))} data-testid="input-hesap-sube" />
            </div>
            <div className="space-y-1.5">
              <Label>SWIFT / BIC Kodu</Label>
              <Input value={hesapForm.swift} onChange={e => setHesapForm(f => ({ ...f, swift: e.target.value.toUpperCase() }))} placeholder="GARAN2AXXX" data-testid="input-hesap-swift" />
            </div>
            <div className="col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label>IBAN&apos;lar</Label>
                <Button type="button" variant="outline" size="sm" onClick={ibanEkle}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> IBAN Ekle
                </Button>
              </div>
              <div className="space-y-2">
                {hesapForm.ibanGirisler.map((g, i) => (
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
                    {hesapForm.ibanGirisler.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => ibanSil(i)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Her banka hesabına birden fazla para birimi IBAN eklenebilir.</p>
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={hesapForm.faturadaGoster} onChange={e => setHesapForm(f => ({ ...f, faturadaGoster: e.target.checked }))} className="h-4 w-4 rounded" data-testid="checkbox-faturada-goster" />
                <div>
                  <p className="text-sm font-medium">Faturada göster</p>
                  <p className="text-xs text-muted-foreground">Bu hesap fatura PDF ve detay sayfasında ödeme bilgisi olarak görünür</p>
                </div>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={kapatHesap}>İptal</Button>
            <Button onClick={kaydetHesap} disabled={!hesapForm.catiFirmaId || !hesapForm.hesapAdi} data-testid="button-hesap-kaydet">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={kdvModal} onOpenChange={setKdvModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{kdvDuzenleId ? "KDV Oranı Düzenle" : "Yeni KDV Oranı"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Çatı Firma *</Label>
              <Select value={kdvForm.catiFirmaId} onValueChange={v => setKdvForm(f => ({ ...f, catiFirmaId: v }))}>
                <SelectTrigger data-testid="select-kdv-sirket"><SelectValue placeholder="Firma seçin" /></SelectTrigger>
                <SelectContent>{catiFirmalar.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.ad}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ad *</Label>
              <Input value={kdvForm.ad} onChange={e => setKdvForm(f => ({ ...f, ad: e.target.value }))} placeholder="KDV %20" data-testid="input-kdv-ad" />
            </div>
            <div className="space-y-1.5">
              <Label>Oran (%) *</Label>
              <Input type="number" value={kdvForm.oran} onChange={e => setKdvForm(f => ({ ...f, oran: e.target.value }))} min="0" max="100" step="0.01" data-testid="input-kdv-oran" />
            </div>
            <div className="space-y-1.5">
              <Label>Varsayılan</Label>
              <Select value={kdvForm.varsayilan} onValueChange={v => setKdvForm(f => ({ ...f, varsayilan: v }))}>
                <SelectTrigger data-testid="select-kdv-varsayilan"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="false">Hayır</SelectItem><SelectItem value="true">Evet</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKdvModal(false)}>İptal</Button>
            <Button onClick={kdvKaydet} disabled={!kdvForm.catiFirmaId || !kdvForm.ad || !kdvForm.oran} data-testid="button-kdv-kaydet">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={seriModal} onOpenChange={setSeriModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{seriDuzenleId ? "Seriyi Düzenle" : "Yeni Fatura Serisi"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Çatı Firma *</Label>
              <Select value={seriForm.catiFirmaId} onValueChange={v => setSeriForm(f => ({ ...f, catiFirmaId: v }))}>
                <SelectTrigger data-testid="select-seri-sirket"><SelectValue placeholder="Firma seçin" /></SelectTrigger>
                <SelectContent>{catiFirmalar.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.ad}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ad *</Label>
              <Input value={seriForm.ad} onChange={e => setSeriForm(f => ({ ...f, ad: e.target.value }))} placeholder="Ana Seri" data-testid="input-seri-ad" />
            </div>
            <div className="space-y-1.5">
              <Label>Önek *</Label>
              <Input value={seriForm.onek} onChange={e => setSeriForm(f => ({ ...f, onek: e.target.value.toUpperCase() }))} placeholder="LAC" maxLength={6} data-testid="input-seri-onek" />
            </div>
            <div className="space-y-1.5">
              <Label>Sonraki No</Label>
              <Input type="number" value={seriForm.sonrakiNo} onChange={e => setSeriForm(f => ({ ...f, sonrakiNo: e.target.value }))} min="1" data-testid="input-seri-no" />
            </div>
            <div className="space-y-1.5">
              <Label>Varsayılan</Label>
              <Select value={seriForm.varsayilan} onValueChange={v => setSeriForm(f => ({ ...f, varsayilan: v }))}>
                <SelectTrigger data-testid="select-seri-varsayilan"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="false">Hayır</SelectItem><SelectItem value="true">Evet</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeriModal(false)}>İptal</Button>
            <Button onClick={seriKaydet} disabled={!seriForm.catiFirmaId || !seriForm.ad || !seriForm.onek} data-testid="button-seri-kaydet">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!silFirmaId} onOpenChange={o => !o && setSilFirmaId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Şirketi sil</AlertDialogTitle>
            <AlertDialogDescription>Bu işlem geri alınamaz. Şirkete bağlı tüm veriler de silinebilir.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!silFirmaId) return;
              deleteFirma.mutate({ id: silFirmaId }, {
                onSuccess: () => { qc.invalidateQueries({ queryKey: getListFirmalarQueryKey() }); setSilFirmaId(null); toast({ title: "Şirket silindi" }); },
                onError: () => toast({ title: "Silinemedi", variant: "destructive" }),
              });
            }}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!silHesapId} onOpenChange={o => !o && setSilHesapId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hesabı sil</AlertDialogTitle><AlertDialogDescription>Bu işlem geri alınamaz.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (!silHesapId) return; deleteHesap.mutate({ id: silHesapId }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListBankaHesaplariQueryKey() }); setSilHesapId(null); } }); }}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!kdvSilId} onOpenChange={o => !o && setKdvSilId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>KDV oranını sil</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (!kdvSilId) return; deleteKdv.mutate({ id: kdvSilId }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListKdvOranlariQueryKey() }); setKdvSilId(null); } }); }}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!seriSilId} onOpenChange={o => !o && setSeriSilId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Seriyi sil</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (!seriSilId) return; deleteSeri.mutate({ id: seriSilId }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListFaturaSerileriQueryKey() }); setSeriSilId(null); } }); }}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={silOnayAcik} onOpenChange={setSilOnayAcik}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" /> Tüm verileri silmek istediğinizden emin misiniz?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">Bu işlem <strong>geri alınamaz</strong>. Firmalar, gemiler, faturalar, ödemeler ve tüm ilgili kayıtlar kalıcı olarak silinecektir.</span>
              <span className="block mt-3">Onaylamak için aşağıya <code className="font-bold text-destructive bg-destructive/10 px-1 rounded">EVET_SIL</code> yazın:</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2">
            <Input value={silOnayKod} onChange={e => setSilOnayKod(e.target.value)} placeholder="EVET_SIL" className="border-destructive focus-visible:ring-destructive" autoFocus />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSilOnayKod("")}>İptal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={e => { e.preventDefault(); tumuSil(); }}
              disabled={silOnayKod !== "EVET_SIL" || silSistemYukleniyor}
            >
              {silSistemYukleniyor ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Evet, Tüm Verileri Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
