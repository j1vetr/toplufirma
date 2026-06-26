import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useYetki } from "@/hooks/use-yetki";
import { useSirket } from "@/contexts/sirket-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  FileDown,
  CheckCircle2,
  SendHorizonal,
  XCircle,
  FileText,
  Building2,
  Ship,
  Calendar,
  DollarSign,
  Receipt,
  Mail,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useListFirmalar, getListFirmalarQueryKey } from "@workspace/api-client-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Teklif {
  id: number;
  catiFirmaId: number;
  catiFirmaAd: string | null;
  gemiId: number | null;
  gemiAd: string | null;
  teklifNo: string;
  tarih: string;
  gecerlilikTarihi: string | null;
  aliciAd: string;
  aliciAdres: string | null;
  aliciTelefon: string | null;
  paraBirimi: string;
  kurNotu: string | null;
  notlar: string | null;
  kosullar: string | null;
  durum: "taslak" | "gonderildi" | "onaylandi" | "reddedildi";
  olusturmaTarihi: string;
}

interface TeklifKalem {
  id?: number;
  aciklama: string;
  miktar: number;
  birimFiyat: number;
  birim: string;
  opsiyonel: boolean;
}

interface TeklifBankaHesabi {
  id: number;
  bankaAdi: string | null;
  hesapAdi: string;
  iban: string | null;
  paraBirimi: string | null;
  swift: string | null;
  ibanlar: Record<string, string>;
}

interface Gemi {
  id: number;
  firmaId: number;
  catiFirmaId: number | null;
  ad: string;
}

const DURUM_ETIKET: Record<string, string> = {
  taslak: "Taslak",
  gonderildi: "Gönderildi",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
};

const DURUM_RENK: Record<string, string> = {
  taslak: "secondary",
  gonderildi: "outline",
  onaylandi: "default",
  reddedildi: "destructive",
};

const PARA_BIRIMLERI = ["USD", "EUR", "GBP", "TRY"];

function bosTeklifKalem(): TeklifKalem {
  return { aciklama: "", miktar: 1, birimFiyat: 0, birim: "Adet", opsiyonel: false };
}

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("panel_token") ?? "";
  const r = await fetch(`${API_BASE}/api${path}`, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
    ...opts,
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error ?? "İstek başarısız");
  }
  return r.json();
}

export default function Teklifler() {
  const { aktifSirketId } = useSirket();
  const { canWrite } = useYetki();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const [durumFiltre, setDurumFiltre] = useState<string>("tumu");
  const [modalAcik, setModalAcik] = useState(false);
  const [duzenleId, setDuzenleId] = useState<number | null>(null);
  const [silOnay, setSilOnay] = useState<number | null>(null);
  const [durumDegistirTeklif, setDurumDegistirTeklif] = useState<Teklif | null>(null);
  const [pdfYukleniyor, setPdfYukleniyor] = useState<number | null>(null);
  const [donusturTeklif, setDonusturTeklif] = useState<Teklif | null>(null);
  const [donusturBagliFirmaId, setDonusturBagliFirmaId] = useState<string>("");
  const [gonderTeklif, setGonderTeklif] = useState<Teklif | null>(null);
  const [gonderEposta, setGonderEposta] = useState<string>("");
  const [gonderKonu, setGonderKonu] = useState<string>("");
  const [gecmisAcik, setGecmisAcik] = useState(false);
  const [kurYukleniyor, setKurYukleniyor] = useState(false);
  const [teklifBankaHesaplari, setTeklifBankaHesaplari] = useState<TeklifBankaHesabi[]>([]);

  const [form, setForm] = useState({
    catiFirmaId: "" as string | number,
    gemiId: "" as string | number,
    tarih: new Date().toISOString().split("T")[0],
    gecerlilikTarihi: "",
    aliciAd: "",
    aliciAdres: "",
    aliciTelefon: "",
    paraBirimi: "USD",
    kurNotu: "",
    notlar: "",
    kosullar: "",
    kalemler: [bosTeklifKalem()],
  });

  const { data: teklifListesi = [], isLoading } = useQuery<Teklif[]>({
    queryKey: ["teklifler", aktifSirketId],
    queryFn: () => apiFetch(`/teklifler${aktifSirketId ? `?catiFirmaId=${aktifSirketId}` : ""}`),
  });

  const { data: firmalar = [] } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );

  const donusturCatiFirmaId = donusturTeklif?.catiFirmaId ?? null;
  const { data: donusturBagliFirmalar = [] } = useListFirmalar(
    donusturCatiFirmaId ? { tip: "bagli", catiFirmaId: donusturCatiFirmaId } : { tip: "bagli" },
    {
      query: {
        queryKey: [...getListFirmalarQueryKey(), "bagli-donustur", donusturCatiFirmaId],
        enabled: !!donusturTeklif,
      },
    },
  );

  const { data: gemiler = [] } = useQuery<Gemi[]>({
    queryKey: ["gemiler", form.catiFirmaId],
    queryFn: () => apiFetch(`/gemiler${form.catiFirmaId ? `?catiFirmaId=${form.catiFirmaId}` : ""}`),
  });

  const filtrelenmis = durumFiltre === "tumu" ? teklifListesi : teklifListesi.filter(t => t.durum === durumFiltre);
  const firmaGemileri = gemiler;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openId = params.get("open");
    if (!openId) return;
    navigate("/teklifler", { replace: true } as Parameters<typeof navigate>[1]);
    formAc({ id: Number(openId) } as Teklif);
  }, []);

  function formAc(teklif?: Teklif) {
    if (teklif) {
      setDuzenleId(teklif.id);
      apiFetch(`/teklifler/${teklif.id}`).then((d: Teklif & { kalemler: TeklifKalem[]; bankaHesaplari?: TeklifBankaHesabi[] }) => {
        setForm({
          catiFirmaId: d.catiFirmaId,
          gemiId: d.gemiId ?? "",
          tarih: d.tarih,
          gecerlilikTarihi: d.gecerlilikTarihi ?? "",
          aliciAd: d.aliciAd,
          aliciAdres: d.aliciAdres ?? "",
          aliciTelefon: d.aliciTelefon ?? "",
          paraBirimi: d.paraBirimi,
          kurNotu: d.kurNotu ?? "",
          notlar: d.notlar ?? "",
          kosullar: d.kosullar ?? "",
          kalemler: d.kalemler.length ? d.kalemler : [bosTeklifKalem()],
        });
        setTeklifBankaHesaplari((d.bankaHesaplari ?? []).filter(b => b));
        setModalAcik(true);
      });
    } else {
      setDuzenleId(null);
      setTeklifBankaHesaplari([]);
      const aktifFirma = firmalar.find(f => f.id === aktifSirketId);
      setForm({
        catiFirmaId: aktifSirketId ?? (firmalar[0]?.id ?? ""),
        gemiId: "",
        tarih: new Date().toISOString().split("T")[0],
        gecerlilikTarihi: "",
        aliciAd: "",
        aliciAdres: "",
        aliciTelefon: "",
        paraBirimi: (aktifFirma as { paraBirimi?: string } | undefined)?.paraBirimi ?? "USD",
        kurNotu: "",
        notlar: "",
        kosullar: "",
        kalemler: [bosTeklifKalem()],
      });
      setModalAcik(true);
    }
  }

  const kaydetMutasyon = useMutation({
    mutationFn: async () => {
      const body = {
        catiFirmaId: Number(form.catiFirmaId),
        gemiId: form.gemiId ? Number(form.gemiId) : null,
        tarih: form.tarih,
        gecerlilikTarihi: form.gecerlilikTarihi || null,
        aliciAd: form.aliciAd,
        aliciAdres: form.aliciAdres || null,
        aliciTelefon: form.aliciTelefon || null,
        paraBirimi: form.paraBirimi,
        kurNotu: form.kurNotu || null,
        notlar: form.notlar || null,
        kosullar: form.kosullar || null,
        kalemler: form.kalemler.filter(k => k.aciklama),
      };
      if (duzenleId) {
        return apiFetch(`/teklifler/${duzenleId}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      return apiFetch("/teklifler", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teklifler"] });
      toast({ title: duzenleId ? "Teklif güncellendi" : "Teklif oluşturuldu" });
      setModalAcik(false);
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const silMutasyon = useMutation({
    mutationFn: (id: number) => apiFetch(`/teklifler/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teklifler"] });
      toast({ title: "Teklif silindi" });
      setSilOnay(null);
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const durumMutasyon = useMutation({
    mutationFn: ({ id, durum }: { id: number; durum: string }) =>
      apiFetch(`/teklifler/${id}/durum`, { method: "PATCH", body: JSON.stringify({ durum }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teklifler"] });
      toast({ title: "Durum güncellendi" });
      setDurumDegistirTeklif(null);
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  interface GonderiGecmisiSatir { id: number; aliciEposta: string; gonderenAd: string | null; gonderilmeTarihi: string; }
  const { data: teklifGonderiGecmisi = [] } = useQuery<GonderiGecmisiSatir[]>({
    queryKey: ["teklif-gonderi-gecmisi", gonderTeklif?.id],
    queryFn: async () => {
      if (!gonderTeklif) return [];
      return apiFetch(`/teklifler/${gonderTeklif.id}/gonderi-gecmisi`);
    },
    enabled: !!gonderTeklif,
  });

  const gonderMutasyon = useMutation({
    mutationFn: ({ id, aliciAdres, aliciAd, konu }: { id: number; aliciAdres: string; aliciAd?: string; konu?: string }) =>
      apiFetch(`/teklifler/${id}/gonder`, { method: "POST", body: JSON.stringify({ aliciAdres, aliciAd, konu }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teklifler"] });
      qc.invalidateQueries({ queryKey: ["teklif-gonderi-gecmisi", gonderTeklif?.id] });
      toast({ title: "Teklif gönderildi", description: `${gonderTeklif?.teklifNo} teklifi e-posta ile gönderildi ve durumu güncellendi.` });
      setGonderTeklif(null);
      setGonderEposta("");
      setGonderKonu("");
    },
    onError: (e: Error) => toast({ title: "Gönderme hatası", description: e.message, variant: "destructive" }),
  });

  const donusturMutasyon = useMutation({
    mutationFn: ({ id, bagliFirmaId }: { id: number; bagliFirmaId: number }) =>
      apiFetch(`/teklifler/${id}/faturaya-donustur`, { method: "POST", body: JSON.stringify({ bagliFirmaId }) }),
    onSuccess: (data: { faturaId: number; faturaNo: string }) => {
      qc.invalidateQueries({ queryKey: ["teklifler"] });
      toast({ title: "Fatura oluşturuldu", description: `${data.faturaNo} numaralı fatura oluşturuldu` });
      setDonusturTeklif(null);
      setDonusturBagliFirmaId("");
      navigate(`/faturalar/${data.faturaId}`);
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  function pdfAc(teklif: Teklif) {
    const token = localStorage.getItem("panel_token") ?? "";
    const url = `${API_BASE}/api/teklifler/${teklif.id}/pdf`;
    setPdfYukleniyor(teklif.id);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const objUrl = URL.createObjectURL(blob);
        window.open(objUrl, "_blank");
        setTimeout(() => URL.revokeObjectURL(objUrl), 10000);
      })
      .catch(() => toast({ title: "PDF oluşturulamadı", variant: "destructive" }))
      .finally(() => setPdfYukleniyor(null));
  }

  async function tcmbKurGetir() {
    setKurYukleniyor(true);
    try {
      const data = await apiFetch("/tcmb-kur");
      const pb = form.paraBirimi;
      const kur = data.kurlar?.[pb];
      if (kur) {
        const kurStr = `1 ${pb} = ${Number(kur).toFixed(4)} TRY (TCMB, ${data.tarih})`;
        setForm(f => ({ ...f, kurNotu: kurStr }));
      }
    } catch {
    } finally {
      setKurYukleniyor(false);
    }
  }

  const kalemGuncelle = useCallback((i: number, field: keyof TeklifKalem, value: string | number | boolean) => {
    setForm(f => {
      const k = [...f.kalemler];
      k[i] = { ...k[i], [field]: value };
      return { ...f, kalemler: k };
    });
  }, []);

  const kalemEkle = (opsiyonel = false) =>
    setForm(f => ({ ...f, kalemler: [...f.kalemler, { ...bosTeklifKalem(), opsiyonel }] }));

  const kalemSil = (i: number) =>
    setForm(f => ({ ...f, kalemler: f.kalemler.filter((_, idx) => idx !== i) }));

  const zorunluKalemler = form.kalemler.filter(k => !k.opsiyonel);
  const opsKalemler = form.kalemler.filter(k => k.opsiyonel);
  const araToplam = zorunluKalemler.reduce((s, k) => s + k.miktar * k.birimFiyat, 0);
  const opsToplamTutar = opsKalemler.reduce((s, k) => s + k.miktar * k.birimFiyat, 0);

  const DURUMLAR = [
    { key: "tumu", label: "Tümü" },
    { key: "taslak", label: "Taslak" },
    { key: "gonderildi", label: "Gönderildi" },
    { key: "onaylandi", label: "Onaylandı" },
    { key: "reddedildi", label: "Reddedildi" },
  ];

  const durumSayilari = DURUMLAR.reduce<Record<string, number>>((acc, d) => {
    acc[d.key] = d.key === "tumu" ? teklifListesi.length : teklifListesi.filter(t => t.durum === d.key).length;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Teklifler</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Proforma teklifler ve fiyat teklifleri</p>
        </div>
        {canWrite && (
          <Button onClick={() => formAc()}>
            <Plus className="mr-2 h-4 w-4" /> Yeni Teklif
          </Button>
        )}
      </div>

      {/* ── Durum Filtre Tabları ── */}
      <div className="flex gap-2 flex-wrap">
        {DURUMLAR.map(d => (
          <Button
            key={d.key}
            variant={durumFiltre === d.key ? "default" : "outline"}
            size="sm"
            onClick={() => setDurumFiltre(d.key)}
            className="gap-1.5"
          >
            {d.label}
            <span className={`text-xs rounded-sm px-1.5 py-0.5 ${durumFiltre === d.key ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"}`}>
              {durumSayilari[d.key]}
            </span>
          </Button>
        ))}
      </div>

      {/* ── Kart Grid ── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-none border bg-card p-5 space-y-3 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/3" />
              <div className="h-6 bg-muted rounded w-2/3" />
              <div className="h-4 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtrelenmis.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <FileText className="h-12 w-12 mb-4 opacity-20" />
          <p className="font-medium">Teklif bulunamadı</p>
          <p className="text-sm mt-1">Yeni teklif oluşturmak için "Yeni Teklif" butonunu kullanın.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtrelenmis.map(t => {
            const zorunluToplam = 0;
            return (
              <div key={t.id} className="rounded-none border bg-card flex flex-col">
                <div className="p-5 flex-1 space-y-3">
                  {/* Üst: teklif no + durum */}
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-primary tracking-wide">{t.teklifNo}</span>
                    <Badge variant={DURUM_RENK[t.durum] as "default" | "secondary" | "outline" | "destructive"} className="shrink-0">
                      {DURUM_ETIKET[t.durum]}
                    </Badge>
                  </div>

                  {/* Alıcı */}
                  <div>
                    <p className="font-semibold text-base leading-tight">{t.aliciAd}</p>
                    {t.aliciAdres && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.aliciAdres}</p>}
                  </div>

                  {/* Firma + Gemi */}
                  <div className="space-y-1">
                    {t.catiFirmaAd && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Building2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">{t.catiFirmaAd}</span>
                      </div>
                    )}
                    {t.gemiAd && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Ship className="h-3 w-3 shrink-0" />
                        <span className="truncate">{t.gemiAd}</span>
                      </div>
                    )}
                  </div>

                  {/* Tarihler */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{t.tarih}</span>
                    </div>
                    {t.gecerlilikTarihi && (
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground/50">→</span>
                        <span>{t.gecerlilikTarihi}</span>
                      </div>
                    )}
                  </div>

                  {/* Para birimi */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <DollarSign className="h-3 w-3" />
                    <span>{t.paraBirimi}</span>
                  </div>
                </div>

                {/* Alt: aksiyon butonları */}
                <div className="border-t px-4 py-2.5 flex items-center justify-between bg-muted/20 rounded-b-xl">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary hover:text-primary hover:bg-primary/10 gap-1.5"
                    onClick={() => pdfAc(t)}
                    disabled={pdfYukleniyor === t.id}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    {pdfYukleniyor === t.id ? "Yükleniyor…" : "PDF Görüntüle"}
                  </Button>
                  {canWrite && (
                    <div className="flex items-center gap-1">
                      {t.durum === "onaylandi" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-green-700 hover:text-green-800 hover:bg-green-100 gap-1 text-xs font-medium"
                          title="Faturaya Dönüştür"
                          onClick={() => { setDonusturTeklif(t); setDonusturBagliFirmaId(""); }}
                        >
                          <Receipt className="h-3.5 w-3.5" />
                          Faturaya Dönüştür
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                        title="E-posta ile Gönder"
                        onClick={() => {
                          setGonderTeklif(t);
                          setGonderEposta("");
                          setGonderKonu(`Teklif ${t.teklifNo}`);
                        }}
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Durum Değiştir" onClick={() => setDurumDegistirTeklif(t)}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Düzenle" onClick={() => formAc(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" title="Sil" onClick={() => setSilOnay(t.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      <Dialog open={modalAcik} onOpenChange={setModalAcik}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{duzenleId ? "Teklif Düzenle" : "Yeni Teklif"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* Firma + Gemi */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Çatı Firma <span className="text-destructive">*</span></Label>
                <Select value={String(form.catiFirmaId)} onValueChange={v => setForm(f => ({ ...f, catiFirmaId: v, gemiId: "" }))}>
                  <SelectTrigger><SelectValue placeholder="Seçiniz…" /></SelectTrigger>
                  <SelectContent>
                    {firmalar.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.ad}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Gemi</Label>
                <Select value={String(form.gemiId)} onValueChange={v => setForm(f => ({ ...f, gemiId: v === "0" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Gemi seçin (isteğe bağlı)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">— Yok —</SelectItem>
                    {firmaGemileri.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.ad}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tarihler + Para Birimi */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Teklif Tarihi <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.tarih} onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Geçerlilik Tarihi</Label>
                <Input type="date" value={form.gecerlilikTarihi} onChange={e => setForm(f => ({ ...f, gecerlilikTarihi: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Para Birimi <span className="text-destructive">*</span></Label>
                <Select value={form.paraBirimi} onValueChange={v => setForm(f => ({ ...f, paraBirimi: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PARA_BIRIMLERI.map(pb => <SelectItem key={pb} value={pb}>{pb}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Alıcı */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Alıcı Adı / Firma <span className="text-destructive">*</span></Label>
                <Input value={form.aliciAd} onChange={e => setForm(f => ({ ...f, aliciAd: e.target.value }))} placeholder="Alıcı adı" />
              </div>
              <div className="space-y-1.5">
                <Label>Alıcı Telefon</Label>
                <Input value={form.aliciTelefon} onChange={e => setForm(f => ({ ...f, aliciTelefon: e.target.value }))} placeholder="+90 555 000 0000" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Alıcı Adresi</Label>
              <Textarea value={form.aliciAdres} onChange={e => setForm(f => ({ ...f, aliciAdres: e.target.value }))} rows={2} placeholder="Adres" />
            </div>

            {/* Kur Notu */}
            {form.paraBirimi !== "TRY" && (
              <div className="space-y-1.5">
                <Label>Kur Notu</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.kurNotu}
                    onChange={e => setForm(f => ({ ...f, kurNotu: e.target.value }))}
                    placeholder={`Örn: 1 ${form.paraBirimi} = … TRY (teklif tarihinde)`}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={tcmbKurGetir}
                    disabled={kurYukleniyor}
                    title="TCMB güncel satış kurunu getir"
                  >
                    {kurYukleniyor ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Kuru Getir"
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">TCMB resmi satış kurunu otomatik doldurabilirsiniz.</p>
              </div>
            )}

            {/* ── Zorunlu Kalemler ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Kalemler</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => kalemEkle(false)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Kalem Ekle
                </Button>
              </div>
              <div className="rounded-none border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[40%]">Açıklama</TableHead>
                      <TableHead className="w-[14%]">Birim</TableHead>
                      <TableHead className="w-[13%]">Miktar</TableHead>
                      <TableHead className="w-[16%]">Birim Fiyat</TableHead>
                      <TableHead className="w-[14%] text-right">Toplam</TableHead>
                      <TableHead className="w-[3%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.kalemler.map((k, i) => !k.opsiyonel && (
                      <TableRow key={i}>
                        <TableCell><Input value={k.aciklama} onChange={e => kalemGuncelle(i, "aciklama", e.target.value)} placeholder="Açıklama" /></TableCell>
                        <TableCell><Input value={k.birim} onChange={e => kalemGuncelle(i, "birim", e.target.value)} placeholder="Adet" /></TableCell>
                        <TableCell><Input type="number" min={0} step="any" value={k.miktar} onChange={e => kalemGuncelle(i, "miktar", Number(e.target.value))} /></TableCell>
                        <TableCell><Input type="number" min={0} step="any" value={k.birimFiyat} onChange={e => kalemGuncelle(i, "birimFiyat", Number(e.target.value))} /></TableCell>
                        <TableCell className="text-right text-sm font-medium">{(k.miktar * k.birimFiyat).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell>
                          {form.kalemler.filter(x => !x.opsiyonel).length > 1 && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => kalemSil(i)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {zorunluKalemler.length > 0 && (
                <div className="text-right text-sm font-semibold text-primary pr-1">
                  Ara Toplam: {araToplam.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {form.paraBirimi}
                </div>
              )}
            </div>

            {/* ── Opsiyonel Kalemler ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold text-muted-foreground">Opsiyonel Kalemler</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => kalemEkle(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Opsiyonel Ekle
                </Button>
              </div>
              {opsKalemler.length > 0 && (
                <>
                  <div className="rounded-none border border-dashed overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="w-[40%]">Açıklama</TableHead>
                          <TableHead className="w-[14%]">Birim</TableHead>
                          <TableHead className="w-[13%]">Miktar</TableHead>
                          <TableHead className="w-[16%]">Birim Fiyat</TableHead>
                          <TableHead className="w-[14%] text-right">Toplam</TableHead>
                          <TableHead className="w-[3%]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {form.kalemler.map((k, i) => k.opsiyonel && (
                          <TableRow key={i}>
                            <TableCell><Input value={k.aciklama} onChange={e => kalemGuncelle(i, "aciklama", e.target.value)} placeholder="Açıklama" /></TableCell>
                            <TableCell><Input value={k.birim} onChange={e => kalemGuncelle(i, "birim", e.target.value)} placeholder="Adet" /></TableCell>
                            <TableCell><Input type="number" min={0} step="any" value={k.miktar} onChange={e => kalemGuncelle(i, "miktar", Number(e.target.value))} /></TableCell>
                            <TableCell><Input type="number" min={0} step="any" value={k.birimFiyat} onChange={e => kalemGuncelle(i, "birimFiyat", Number(e.target.value))} /></TableCell>
                            <TableCell className="text-right text-sm font-medium text-muted-foreground">{(k.miktar * k.birimFiyat).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => kalemSil(i)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="text-right text-sm text-muted-foreground pr-1">
                    Opsiyonel Toplam: {opsToplamTutar.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {form.paraBirimi}
                  </div>
                </>
              )}
            </div>

            {/* Notlar + Koşullar */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Notlar</Label>
                <Textarea value={form.notlar} onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))} rows={3} placeholder="Teklif notları…" />
              </div>
              <div className="space-y-1.5">
                <Label>Şartlar &amp; Koşullar</Label>
                <Textarea value={form.kosullar} onChange={e => setForm(f => ({ ...f, kosullar: e.target.value }))} rows={3} placeholder="Ödeme koşulları, teslimat vb…" />
              </div>
            </div>

            {/* Ödeme Bilgileri (banka hesapları) */}
            {teklifBankaHesaplari.length > 0 && (
              <div className="space-y-2">
                <Label className="text-base font-semibold">Ödeme Bilgileri</Label>
                <div className="space-y-2">
                  {teklifBankaHesaplari.map(b => {
                    const ibanlar = (b.ibanlar && Object.keys(b.ibanlar).length > 0)
                      ? b.ibanlar
                      : (b.iban && b.paraBirimi ? { [b.paraBirimi]: b.iban } : {});
                    return (
                      <div key={b.id} className="text-sm p-3 bg-muted/50 border rounded-none">
                        {b.bankaAdi && <p className="font-medium">{b.bankaAdi}</p>}
                        <p className="text-muted-foreground text-xs">{b.hesapAdi}</p>
                        <div className="mt-1.5 space-y-0.5">
                          {Object.entries(ibanlar).map(([pb, iban]) => (
                            <p key={pb} className={`font-mono text-xs ${pb === form.paraBirimi ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                              <span className="text-foreground">{pb} IBAN:</span> {iban}
                            </p>
                          ))}
                        </div>
                        {b.swift && <p className="font-mono text-xs text-muted-foreground mt-0.5">SWIFT: {b.swift}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalAcik(false)}>İptal</Button>
            <Button
              onClick={() => kaydetMutasyon.mutate()}
              disabled={kaydetMutasyon.isPending || !form.catiFirmaId || !form.tarih || !form.aliciAd || form.kalemler.filter(k => !k.opsiyonel && k.aciklama).length === 0}
            >
              {kaydetMutasyon.isPending ? "Kaydediliyor…" : duzenleId ? "Güncelle" : "Oluştur"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Status Change Dialog ── */}
      <Dialog open={!!durumDegistirTeklif} onOpenChange={o => !o && setDurumDegistirTeklif(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Durum Değiştir — {durumDegistirTeklif?.teklifNo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {(["taslak", "gonderildi", "onaylandi", "reddedildi"] as const).map(d => (
              <Button
                key={d}
                variant={durumDegistirTeklif?.durum === d ? "default" : "outline"}
                className="w-full justify-start"
                onClick={() => durumMutasyon.mutate({ id: durumDegistirTeklif!.id, durum: d })}
                disabled={durumMutasyon.isPending}
              >
                {d === "taslak" && <FileText className="mr-2 h-4 w-4" />}
                {d === "gonderildi" && <SendHorizonal className="mr-2 h-4 w-4" />}
                {d === "onaylandi" && <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />}
                {d === "reddedildi" && <XCircle className="mr-2 h-4 w-4 text-destructive" />}
                {DURUM_ETIKET[d]}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Faturaya Dönüştür Dialog ── */}
      <Dialog open={!!donusturTeklif} onOpenChange={o => !o && setDonusturTeklif(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Faturaya Dönüştür — {donusturTeklif?.teklifNo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{donusturTeklif?.aliciAd}</span> için hangi kayıtlı müşteri firmasına fatura kesilecek?
            </p>
            <div className="space-y-1.5">
              <Label>Müşteri (Bağlı Firma) <span className="text-destructive">*</span></Label>
              <Select
                value={donusturBagliFirmaId}
                onValueChange={setDonusturBagliFirmaId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Müşteri seçin…" />
                </SelectTrigger>
                <SelectContent>
                  {donusturBagliFirmalar.map(f => (
                    <SelectItem key={f.id} value={String(f.id)}>{f.ad}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Teklif kalemleri (zorunlular) taslak fatura olarak oluşturulur. KDV oranlarını ve vadeyi fatura detayında düzenleyebilirsiniz.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDonusturTeklif(null)}>İptal</Button>
            <Button
              disabled={!donusturBagliFirmaId || donusturMutasyon.isPending}
              onClick={() => donusturTeklif && donusturMutasyon.mutate({ id: donusturTeklif.id, bagliFirmaId: Number(donusturBagliFirmaId) })}
            >
              <Receipt className="mr-2 h-4 w-4" />
              {donusturMutasyon.isPending ? "Oluşturuluyor…" : "Fatura Oluştur"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── E-posta ile Gönder Dialog ── */}
      <Dialog open={!!gonderTeklif} onOpenChange={o => { if (!o) { setGonderTeklif(null); setGecmisAcik(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              <span className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Teklifi E-posta ile Gönder
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{gonderTeklif?.teklifNo}</span> numaralı teklif PDF eki olarak gönderilecek. Gönderim sonrası durum otomatik olarak <strong>Gönderildi</strong> olarak güncellenir.
            </p>
            <div className="space-y-1.5">
              <Label>Alıcı E-posta <span className="text-destructive">*</span></Label>
              <Input
                type="email"
                placeholder="ornek@firma.com"
                value={gonderEposta}
                onChange={e => setGonderEposta(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>E-posta Konusu</Label>
              <Input
                placeholder={`Teklif ${gonderTeklif?.teklifNo ?? ""}`}
                value={gonderKonu}
                onChange={e => setGonderKonu(e.target.value)}
              />
            </div>
            <Collapsible open={gecmisAcik} onOpenChange={setGecmisAcik}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  {gecmisAcik ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  Gönderim Geçmişi
                  {teklifGonderiGecmisi.length > 0 && `(${teklifGonderiGecmisi.length})`}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 rounded-none border bg-muted/30 p-3 space-y-2">
                  {teklifGonderiGecmisi.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Henüz gönderim yapılmamış.</p>
                  ) : (
                    teklifGonderiGecmisi.map(g => (
                      <div key={g.id} className="text-xs flex justify-between gap-2">
                        <div>
                          <p className="font-medium text-foreground">{g.aliciEposta}</p>
                          {g.gonderenAd && <p className="text-muted-foreground">Gönderen: {g.gonderenAd}</p>}
                        </div>
                        <span className="text-muted-foreground whitespace-nowrap">
                          {new Date(g.gonderilmeTarihi).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setGonderTeklif(null)}>İptal</Button>
            <Button
              disabled={!gonderEposta || gonderMutasyon.isPending}
              onClick={() => gonderTeklif && gonderMutasyon.mutate({
                id: gonderTeklif.id,
                aliciAdres: gonderEposta,
                aliciAd: gonderTeklif.aliciAd,
                konu: gonderKonu || undefined,
              })}
            >
              <Mail className="mr-2 h-4 w-4" />
              {gonderMutasyon.isPending ? "Gönderiliyor…" : "Gönder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={silOnay !== null} onOpenChange={o => !o && setSilOnay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Teklifi sil</AlertDialogTitle>
            <AlertDialogDescription>Bu teklif kalıcı olarak silinecek. Emin misiniz?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => silOnay !== null && silMutasyon.mutate(silOnay)}
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
