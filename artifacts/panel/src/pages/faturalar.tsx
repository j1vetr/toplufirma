import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  useListFaturalar, getListFaturalarQueryKey,
  useDeleteFatura,
  useTopluDurumGuncelle,
} from "@workspace/api-client-react";
import type { Fatura } from "@workspace/api-client-react";
import OdemeModal from "@/components/odeme-modal";
import { useSirket } from "@/contexts/sirket-context";
import { useYetki } from "@/hooks/use-yetki";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Plus, Trash2, FileText, Search, ChevronRight, ChevronDown, AlertCircle, Download, Mail, CreditCard, CheckSquare, SquarePen } from "lucide-react";

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

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

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

async function excelIndir(catiFirmaId?: number | null, filters?: {
  arama?: string;
  durum?: string;
  baslangicTarihi?: string;
  bitisTarihi?: string;
  paraBirimi?: string;
}) {
  const token = localStorage.getItem("panel_token");
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const params = new URLSearchParams();
  if (catiFirmaId) params.set("catiFirmaId", String(catiFirmaId));
  if (filters?.arama) params.set("arama", filters.arama);
  if (filters?.durum && filters.durum !== "tumu") params.set("durum", filters.durum);
  if (filters?.baslangicTarihi) params.set("baslangicTarihi", filters.baslangicTarihi);
  if (filters?.bitisTarihi) params.set("bitisTarihi", filters.bitisTarihi);
  if (filters?.paraBirimi && filters.paraBirimi !== "tumu") params.set("paraBirimi", filters.paraBirimi);
  const resp = await fetch(`${base}/api/faturalar/excel?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) throw new Error("Excel indirilemedi");
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "faturalar.xlsx"; a.click();
  URL.revokeObjectURL(url);
}

export default function Faturalar() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { aktifSirketId } = useSirket();
  const { canWrite } = useYetki();
  const [arama, setArama] = useState("");
  const [durumFiltre, setDurumFiltre] = useState("tumu");
  const [pbFiltre, setPbFiltre] = useState("tumu");
  const [baslangicTarihi, setBaslangicTarihi] = useState("");
  const [bitisTarihi, setBitisTarihi] = useState("");
  const [excelIndiriyor, setExcelIndiriyor] = useState(false);
  const [silId, setSilId] = useState<number | null>(null);

  const [odemeModal, setOdemeModal] = useState(false);
  const [secilenFatura, setSecilenFatura] = useState<Fatura | null>(null);

  const [gonderModal, setGonderModal] = useState(false);
  const [gonderFaturaId, setGonderFaturaId] = useState<number | null>(null);
  const [aliciAdres, setAliciAdres] = useState("");
  const [aliciAd, setAliciAd] = useState("");
  const [gonderiyor, setGonderiyor] = useState(false);
  const [pdfIndiriyor, setPdfIndiriyor] = useState<number | null>(null);

  const [secilenler, setSecilenler] = useState<Set<number>>(new Set());
  const [topluDurumModal, setTopluDurumModal] = useState(false);
  const [topluDurum, setTopluDurum] = useState("odendi");
  const [topluPdfIndiriyor, setTopluPdfIndiriyor] = useState(false);

  const faturalarParams = aktifSirketId ? { catiFirmaId: aktifSirketId } : undefined;
  const { data: faturalar = [], isLoading } = useListFaturalar(
    faturalarParams,
    { query: { queryKey: [...getListFaturalarQueryKey(), aktifSirketId] } },
  );
  const deleteFatura = useDeleteFatura();
  const topluDurumGuncelle = useTopluDurumGuncelle();

  const { data: gonderiData = [] } = useQuery<{ kayitId: number; gonderilmeTarihi: string }[]>({
    queryKey: ["gonderi-gecmisi-fatura", aktifSirketId],
    queryFn: async () => {
      const token = localStorage.getItem("panel_token") ?? "";
      const params = new URLSearchParams({ kayitTipi: "fatura" });
      if (aktifSirketId) params.set("catiFirmaId", String(aktifSirketId));
      const r = await fetch(`${apiBase()}/gonderi-gecmisi?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 30_000,
  });

  const gonderilmiFaturalar = useMemo(() => {
    const map = new Map<number, string>();
    for (const g of gonderiData) {
      if (!map.has(g.kayitId)) map.set(g.kayitId, g.gonderilmeTarihi);
    }
    return map;
  }, [gonderiData]);

  const bugun = new Date().toISOString().split("T")[0];
  const taslakSayisi = faturalar.filter(f => f.durum === "taslak").length;
  const filtrelenmis = faturalar.filter(f => {
    const aramaUyum = !arama || f.faturaNo?.toLowerCase().includes(arama.toLowerCase()) || f.bagliFirmaAd?.toLowerCase().includes(arama.toLowerCase());
    const durumUyum = durumFiltre === "tumu" || f.durum === durumFiltre;
    const pbUyum = pbFiltre === "tumu" || f.paraBirimi === pbFiltre;
    const baslangicUyum = !baslangicTarihi || f.faturaTarihi >= baslangicTarihi;
    const bitisUyum = !bitisTarihi || f.faturaTarihi <= bitisTarihi;
    return aramaUyum && durumUyum && pbUyum && baslangicUyum && bitisUyum;
  });

  const mevcutPblar = [...new Set(faturalar.map(f => f.paraBirimi))].filter(Boolean);

  function secToggle(id: number) {
    setSecilenler(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function hepsiniSec() {
    if (secilenler.size === filtrelenmis.length) setSecilenler(new Set());
    else setSecilenler(new Set(filtrelenmis.map(f => f.id)));
  }

  async function topluPdfIndir() {
    if (secilenler.size === 0) return;
    setTopluPdfIndiriyor(true);
    const ids = Array.from(secilenler);
    let basarili = 0;
    for (const id of ids) {
      const f = faturalar.find(x => x.id === id);
      if (!f) continue;
      try { await pdfIndir(id, f.faturaNo); basarili++; }
      catch { /* devam */ }
    }
    setTopluPdfIndiriyor(false);
    toast({ title: `${basarili}/${ids.length} fatura PDF indirildi` });
  }

  function acOdemeModal(f: Fatura) {
    setSecilenFatura(f);
    setOdemeModal(true);
  }

  async function gonderFatura() {
    if (!gonderFaturaId || !aliciAdres) return;
    setGonderiyor(true);
    try {
      const token = localStorage.getItem("panel_token");
      const resp = await fetch(`${apiBase()}/faturalar/${gonderFaturaId}/gonder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ aliciAdres, aliciAd: aliciAd || undefined }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Gönderim başarısız");
      setGonderModal(false);
      setAliciAdres(""); setAliciAd("");
      toast({ title: data.mesaj ?? "E-posta gönderildi" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Hata", variant: "destructive" });
    } finally {
      setGonderiyor(false);
    }
  }

  function topluDurumKaydet() {
    const ids = Array.from(secilenler);
    topluDurumGuncelle.mutate(
      { data: { ids, durum: topluDurum as import("@workspace/api-client-react").TopluDurumInputDurum } },
      {
        onSuccess: (res) => {
          qc.invalidateQueries({ queryKey: getListFaturalarQueryKey() });
          setTopluDurumModal(false);
          setSecilenler(new Set());
          toast({ title: `${res.guncellenen} fatura güncellendi` });
        },
        onError: () => toast({ title: "Güncelleme başarısız", variant: "destructive" }),
      }
    );
  }

  const [acikAylar, setAcikAylar] = useState<Set<string>>(new Set());
  const ilkAcilis = useRef(false);

  const ayGruplari = useMemo(() => {
    const byMonth = new Map<string, Fatura[]>();
    for (const f of filtrelenmis) {
      const ayKey = f.faturaTarihi.substring(0, 7);
      if (!byMonth.has(ayKey)) byMonth.set(ayKey, []);
      byMonth.get(ayKey)!.push(f);
    }
    const sortedMonths = [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a));
    return sortedMonths.map(([ayKey, ayFaturalari]) => {
      const byFirma = new Map<string, Fatura[]>();
      for (const f of ayFaturalari) {
        const k = f.bagliFirmaAd ?? "Diğer";
        if (!byFirma.has(k)) byFirma.set(k, []);
        byFirma.get(k)!.push(f);
      }
      const toplamByPb: Record<string, number> = {};
      for (const f of ayFaturalari) {
        toplamByPb[f.paraBirimi] = (toplamByPb[f.paraBirimi] ?? 0) + f.genelToplam;
      }
      return {
        ayKey,
        ayFaturalari,
        firmaGruplari: [...byFirma.entries()],
        durumOzet: {
          odendi: ayFaturalari.filter(f => f.durum === "odendi").length,
          acik: ayFaturalari.filter(f => f.durum === "acik" || f.durum === "kismi_odendi").length,
          taslak: ayFaturalari.filter(f => f.durum === "taslak").length,
          iptal: ayFaturalari.filter(f => f.durum === "iptal").length,
        },
        toplamByPb,
      };
    });
  }, [filtrelenmis]);

  useEffect(() => {
    if (!ilkAcilis.current && ayGruplari.length > 0) {
      ilkAcilis.current = true;
      setAcikAylar(new Set([ayGruplari[0].ayKey]));
    }
  }, [ayGruplari]);

  function ayAdi(ayKey: string): string {
    const [yil, ay] = ayKey.split("-");
    const d = new Date(Number(yil), Number(ay) - 1, 1);
    return d.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
  }

  function ayToggle(ayKey: string) {
    setAcikAylar(prev => {
      const next = new Set(prev);
      if (next.has(ayKey)) next.delete(ayKey); else next.add(ayKey);
      return next;
    });
  }

  function faturaSatiri(f: Fatura) {
    const vadesiGecmis = f.vadeTarihi < bugun && (f.durum === "acik" || f.durum === "kismi_odendi");
    const secili = secilenler.has(f.id);
    return (
      <Card key={f.id} className={`${vadesiGecmis ? "border-red-300" : ""} ${secili ? "ring-1 ring-primary" : ""}`} data-testid={`card-fatura-${f.id}`}>
        <CardContent className="p-4 flex items-center gap-3">
          <Checkbox
            checked={secili}
            onCheckedChange={() => secToggle(f.id)}
            className="shrink-0"
          />
          <div className={`p-2 rounded-sm ${vadesiGecmis ? "bg-red-500/10" : "bg-orange-500/10"}`}>
            {vadesiGecmis ? <AlertCircle className="h-4 w-4 text-red-500" /> : <FileText className="h-4 w-4 text-orange-500" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/faturalar/${f.id}`} className="font-semibold hover:text-primary" data-testid={`link-fatura-${f.id}`}>{f.faturaNo}</Link>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DURUM_RENK[f.durum]}`}>{DURUM_ETIKET[f.durum]}</span>
              {vadesiGecmis && <span className="text-xs text-red-500 font-medium">Vadesi Geçmiş</span>}
              {gonderilmiFaturalar.has(f.id) && (() => {
                const tarih = gonderilmiFaturalar.get(f.id)!;
                const tarihStr = new Date(tarih).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
                return (
                  <span
                    title={`${tarihStr} tarihinde gönderildi`}
                    className="text-xs text-blue-400 select-none cursor-default"
                    aria-label="E-posta gönderildi"
                  >
                    ✉ Gönderildi
                  </span>
                );
              })()}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{f.bagliFirmaAd} {f.gemiAd ? `- ${f.gemiAd}` : ""}</p>
            <p className="text-xs text-muted-foreground">{f.faturaTarihi} - Vade: {f.vadeTarihi}</p>
          </div>
          <div className="text-right shrink-0 hidden sm:block">
            <p className="font-semibold">{fmt(f.genelToplam, f.paraBirimi)}</p>
            {(f.kalanTutar ?? 0) > 0 && f.durum !== "odendi" && (
              <p className="text-xs text-muted-foreground">Kalan: {fmt(f.kalanTutar ?? 0, f.paraBirimi)}</p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {canWrite && (f.durum === "acik" || f.durum === "kismi_odendi") && (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" title="Ödeme Kaydet" onClick={() => acOdemeModal(f)}>
                <CreditCard className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              size="icon" variant="ghost" className="h-8 w-8" title="PDF İndir"
              disabled={pdfIndiriyor === f.id}
              onClick={async () => {
                setPdfIndiriyor(f.id);
                try { await pdfIndir(f.id, f.faturaNo); }
                catch { toast({ title: "PDF indirilemedi", variant: "destructive" }); }
                finally { setPdfIndiriyor(null); }
              }}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" title="E-posta Gönder" onClick={() => { setGonderFaturaId(f.id); setGonderModal(true); }}>
              <Mail className="h-3.5 w-3.5" />
            </Button>
            {canWrite && (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setSilId(f.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Link href={`/faturalar/${f.id}`}>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) return <div className="animate-pulse space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-muted rounded-none" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Fatura no veya firma ara..." value={arama} onChange={e => setArama(e.target.value)} data-testid="input-fatura-ara" />
          </div>
          <Select value={durumFiltre} onValueChange={setDurumFiltre}>
            <SelectTrigger className="w-44" data-testid="select-fatura-durum"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tumu">Tüm Durumlar</SelectItem>
              {Object.entries(DURUM_ETIKET).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={pbFiltre} onValueChange={setPbFiltre}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Para Birimi" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tumu">Tüm PB</SelectItem>
              {mevcutPblar.map(pb => <SelectItem key={pb} value={pb}>{pb}</SelectItem>)}
            </SelectContent>
          </Select>
          {canWrite && (
            <Link href="/faturalar/yeni">
              <Button className="shrink-0" data-testid="button-fatura-yeni">
                <Plus className="mr-2 h-4 w-4" /> Yeni Fatura
              </Button>
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground shrink-0">Tarih:</Label>
            <Input type="date" value={baslangicTarihi} onChange={e => setBaslangicTarihi(e.target.value)} className="h-8 w-36 text-xs" />
            <span className="text-muted-foreground text-xs">-</span>
            <Input type="date" value={bitisTarihi} onChange={e => setBitisTarihi(e.target.value)} className="h-8 w-36 text-xs" />
            {(baslangicTarihi || bitisTarihi) && (
              <button onClick={() => { setBaslangicTarihi(""); setBitisTarihi(""); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1">✕</button>
            )}
          </div>
          {taslakSayisi > 0 && (
            <button
              onClick={() => setDurumFiltre(durumFiltre === "taslak" ? "tumu" : "taslak")}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-none border transition-colors shrink-0 ${
                durumFiltre === "taslak"
                  ? "bg-slate-600 text-white border-slate-600"
                  : "bg-slate-500/10 text-slate-600 border-slate-300 hover:bg-slate-500/20"
              }`}
            >
              <span className={`inline-flex items-center justify-center rounded-sm text-[10px] font-bold h-4 min-w-4 px-1 ${durumFiltre === "taslak" ? "bg-white/20 text-white" : "bg-slate-500/20 text-slate-700"}`}>{taslakSayisi}</span>
              Bekleyen Taslak
            </button>
          )}
          <Button
            variant="outline" size="sm" className="ml-auto gap-1.5"
            disabled={excelIndiriyor}
            onClick={async () => {
              setExcelIndiriyor(true);
              try {
                await excelIndir(aktifSirketId, {
                  arama: arama || undefined,
                  durum: durumFiltre !== "tumu" ? durumFiltre : undefined,
                  baslangicTarihi: baslangicTarihi || undefined,
                  bitisTarihi: bitisTarihi || undefined,
                  paraBirimi: pbFiltre !== "tumu" ? pbFiltre : undefined,
                });
              }
              catch { toast({ title: "Excel indirilemedi", variant: "destructive" }); }
              finally { setExcelIndiriyor(false); }
            }}
          >
            <Download className="h-3.5 w-3.5" />
            {excelIndiriyor ? "İndiriliyor..." : "Excel İndir"}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={hepsiniSec} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <CheckSquare className="h-3.5 w-3.5" />
          {secilenler.size === filtrelenmis.length && filtrelenmis.length > 0 ? "Seçimi Kaldır" : "Tümünü Seç"}
        </button>
        <span className="text-sm text-muted-foreground ml-2">{filtrelenmis.length} fatura</span>
        {secilenler.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm font-medium text-primary">{secilenler.size} seçildi</span>
            <Button
              size="sm" variant="outline" className="h-7 text-xs gap-1"
              disabled={topluPdfIndiriyor}
              onClick={topluPdfIndir}
            >
              <Download className="h-3 w-3" />
              {topluPdfIndiriyor ? "İndiriliyor..." : "Toplu PDF"}
            </Button>
            {canWrite && (
              <Button
                size="sm" variant="outline" className="h-7 text-xs gap-1"
                onClick={() => setTopluDurumModal(true)}
              >
                <SquarePen className="h-3 w-3" />
                Durum Değiştir
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {ayGruplari.length === 0 && (
          <div className="text-center text-muted-foreground py-16">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Fatura bulunamadı.</p>
          </div>
        )}
        {ayGruplari.map(({ ayKey, ayFaturalari, firmaGruplari, durumOzet, toplamByPb }) => {
          const acik = acikAylar.has(ayKey);
          return (
            <div key={ayKey} className="border border-border">
              <button
                className="w-full flex items-center gap-3 p-3 hover:bg-muted/40 transition-colors text-left"
                onClick={() => ayToggle(ayKey)}
              >
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-150 ${acik ? "" : "-rotate-90"}`} />
                <span className="font-semibold capitalize flex-1 text-sm">{ayAdi(ayKey)}</span>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {durumOzet.odendi > 0 && <span className="text-xs text-green-600 font-medium">{durumOzet.odendi} ödendi</span>}
                  {durumOzet.acik > 0 && <span className="text-xs text-orange-600 font-medium">{durumOzet.acik} açık</span>}
                  {durumOzet.taslak > 0 && <span className="text-xs text-slate-500 font-medium">{durumOzet.taslak} taslak</span>}
                  {durumOzet.iptal > 0 && <span className="text-xs text-gray-400 font-medium">{durumOzet.iptal} iptal</span>}
                  <span className="text-xs text-muted-foreground">·</span>
                  {Object.entries(toplamByPb).map(([pb, tutar]) => (
                    <span key={pb} className="text-xs font-mono font-semibold">{fmt(tutar, pb)}</span>
                  ))}
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{ayFaturalari.length} fatura</span>
                </div>
              </button>
              {acik && (
                <div className="border-t border-border">
                  {firmaGruplari.map(([firmaAd, firmaFaturalari]) => {
                    const firmaToplam: Record<string, number> = {};
                    for (const f of firmaFaturalari) {
                      firmaToplam[f.paraBirimi] = (firmaToplam[f.paraBirimi] ?? 0) + f.genelToplam;
                    }
                    return (
                      <div key={firmaAd} className="border-b border-border last:border-b-0">
                        <div className="px-4 py-2 bg-muted/30 flex items-center gap-2">
                          <span className="text-sm font-medium">{firmaAd}</span>
                          <span className="text-xs text-muted-foreground">({firmaFaturalari.length} fatura)</span>
                          <div className="ml-auto flex gap-2">
                            {Object.entries(firmaToplam).map(([pb, tutar]) => (
                              <span key={pb} className="text-xs font-mono text-muted-foreground">{fmt(tutar, pb)}</span>
                            ))}
                          </div>
                        </div>
                        <div className="p-2 space-y-2">
                          {firmaFaturalari.map(faturaSatiri)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <OdemeModal open={odemeModal} onOpenChange={setOdemeModal} fatura={secilenFatura} />

      <Dialog open={gonderModal} onOpenChange={o => { setGonderModal(o); if (!o) { setAliciAdres(""); setAliciAd(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Faturayı E-posta ile Gönder</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Alıcı E-posta *</Label>
              <Input type="email" value={aliciAdres} onChange={e => setAliciAdres(e.target.value)} placeholder="musteri@firma.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Alıcı Ad</Label>
              <Input value={aliciAd} onChange={e => setAliciAd(e.target.value)} placeholder="Firma / Kişi adı (opsiyonel)" />
            </div>
            <p className="text-xs text-muted-foreground">Fatura PDF eki ile çatı firmanın SMTP ayarları üzerinden gönderilir.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGonderModal(false)}>İptal</Button>
            <Button onClick={gonderFatura} disabled={!aliciAdres || gonderiyor}>
              {gonderiyor ? "Gönderiliyor..." : "Gönder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={topluDurumModal} onOpenChange={setTopluDurumModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{secilenler.size} Faturanın Durumunu Değiştir</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Yeni Durum</Label>
              <Select value={topluDurum} onValueChange={setTopluDurum}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DURUM_ETIKET).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">Seçili {secilenler.size} faturanın durumu "{DURUM_ETIKET[topluDurum]}" olarak güncellenir.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopluDurumModal(false)}>İptal</Button>
            <Button onClick={topluDurumKaydet} disabled={topluDurumGuncelle.isPending}>Uygula</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!silId} onOpenChange={o => !o && setSilId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Faturayı sil</AlertDialogTitle><AlertDialogDescription>Bu işlem geri alınamaz.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (!silId) return; deleteFatura.mutate({ id: silId }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListFaturalarQueryKey() }); setSilId(null); toast({ title: "Fatura silindi" }); } }); }}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
