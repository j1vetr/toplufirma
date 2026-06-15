import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListFaturalar, getListFaturalarQueryKey,
  useDeleteFatura, useCreateOdeme, getListOdemelerQueryKey,
  useTopluDurumGuncelle,
} from "@workspace/api-client-react";
import type { Fatura } from "@workspace/api-client-react";
import { useSirket } from "@/contexts/sirket-context";
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
import { Plus, Trash2, FileText, Search, ChevronRight, AlertCircle, Download, Mail, CreditCard, CheckSquare, SquarePen } from "lucide-react";

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

export default function Faturalar() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { aktifSirketId } = useSirket();
  const [arama, setArama] = useState("");
  const [durumFiltre, setDurumFiltre] = useState("tumu");
  const [silId, setSilId] = useState<number | null>(null);

  const [odemeModal, setOdemeModal] = useState(false);
  const [secilenFatura, setSecilenFatura] = useState<Fatura | null>(null);
  const [odemeTutar, setOdemeTutar] = useState("");
  const [odemeTarih, setOdemeTarih] = useState(new Date().toISOString().split("T")[0]);
  const [odemeYontemi, setOdemeYontemi] = useState("banka_havalesi");

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
  const createOdeme = useCreateOdeme();
  const topluDurumGuncelle = useTopluDurumGuncelle();

  const bugun = new Date().toISOString().split("T")[0];
  const taslakSayisi = faturalar.filter(f => f.durum === "taslak").length;
  const filtrelenmis = faturalar.filter(f => {
    const aramaUyum = !arama || f.faturaNo?.toLowerCase().includes(arama.toLowerCase()) || f.bagliFirmaAd?.toLowerCase().includes(arama.toLowerCase());
    const durumUyum = durumFiltre === "tumu" || f.durum === durumFiltre;
    return aramaUyum && durumUyum;
  });

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
    setOdemeTutar(String(f.kalanTutar ?? f.genelToplam));
    setOdemeTarih(new Date().toISOString().split("T")[0]);
    setOdemeModal(true);
  }

  function odemeKaydet() {
    if (!secilenFatura || !odemeTutar) return;
    createOdeme.mutate({
      data: {
        catiFirmaId: secilenFatura.catiFirmaId,
        bagliFirmaId: secilenFatura.bagliFirmaId,
        faturaId: secilenFatura.id,
        tip: "tahsilat",
        tarih: odemeTarih,
        tutar: Number(odemeTutar),
        paraBirimi: secilenFatura.paraBirimi,
        odemeYontemi: odemeYontemi as import("@workspace/api-client-react").OdemeInputOdemeYontemi,
        aciklama: `Fatura ${secilenFatura.faturaNo} ödemesi`,
      },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListFaturalarQueryKey() });
        qc.invalidateQueries({ queryKey: getListOdemelerQueryKey() });
        setOdemeModal(false);
        toast({ title: "Ödeme kaydedildi" });
      },
      onError: () => toast({ title: "Hata", variant: "destructive" }),
    });
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

  const gruplu = aktifSirketId === null
    ? Object.entries(
        filtrelenmis.reduce<Record<string, Fatura[]>>((acc, f) => {
          const k = f.catiFirmaAd ?? "Diğer";
          (acc[k] ??= []).push(f);
          return acc;
        }, {})
      )
    : null;

  function faturaSatiri(f: Fatura) {
    const vadesiGecmis = f.vadeTarihi < bugun && (f.durum === "acik" || f.durum === "kismi_odendi");
    const secili = secilenler.has(f.id);
    return (
      <Card key={f.id} className={`hover:shadow-sm transition-shadow ${vadesiGecmis ? "border-red-300" : ""} ${secili ? "ring-1 ring-primary" : ""}`} data-testid={`card-fatura-${f.id}`}>
        <CardContent className="p-4 flex items-center gap-3">
          <Checkbox
            checked={secili}
            onCheckedChange={() => secToggle(f.id)}
            className="shrink-0"
          />
          <div className={`p-2 rounded-full ${vadesiGecmis ? "bg-red-500/10" : "bg-orange-500/10"}`}>
            {vadesiGecmis ? <AlertCircle className="h-4 w-4 text-red-500" /> : <FileText className="h-4 w-4 text-orange-500" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/faturalar/${f.id}`} className="font-semibold hover:text-primary" data-testid={`link-fatura-${f.id}`}>{f.faturaNo}</Link>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DURUM_RENK[f.durum]}`}>{DURUM_ETIKET[f.durum]}</span>
              {vadesiGecmis && <span className="text-xs text-red-500 font-medium">Vadesi Geçmiş</span>}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{f.bagliFirmaAd} {f.gemiAd ? `- ${f.gemiAd}` : ""}</p>
            <p className="text-xs text-muted-foreground">{f.faturaTarihi} — Vade: {f.vadeTarihi}</p>
          </div>
          <div className="text-right shrink-0 hidden sm:block">
            <p className="font-semibold">{fmt(f.genelToplam, f.paraBirimi)}</p>
            {(f.kalanTutar ?? 0) > 0 && f.durum !== "odendi" && (
              <p className="text-xs text-muted-foreground">Kalan: {fmt(f.kalanTutar ?? 0, f.paraBirimi)}</p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {(f.durum === "acik" || f.durum === "kismi_odendi") && (
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
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setSilId(f.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
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

  if (isLoading) return <div className="animate-pulse space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-muted rounded-lg" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Fatura no veya firma ara..." value={arama} onChange={e => setArama(e.target.value)} data-testid="input-fatura-ara" />
        </div>
        <Select value={durumFiltre} onValueChange={setDurumFiltre}>
          <SelectTrigger className="w-44" data-testid="select-fatura-durum">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tumu">Tüm Durumlar</SelectItem>
            {Object.entries(DURUM_ETIKET).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        {taslakSayisi > 0 && (
          <button
            onClick={() => setDurumFiltre(durumFiltre === "taslak" ? "tumu" : "taslak")}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors shrink-0 ${
              durumFiltre === "taslak"
                ? "bg-slate-600 text-white border-slate-600"
                : "bg-slate-500/10 text-slate-600 border-slate-300 hover:bg-slate-500/20"
            }`}
            title="Bekleyen taslak faturaları filtrele"
          >
            <span className={`inline-flex items-center justify-center rounded-full text-[10px] font-bold h-4 min-w-4 px-1 ${
              durumFiltre === "taslak" ? "bg-white/20 text-white" : "bg-slate-500/20 text-slate-700"
            }`}>
              {taslakSayisi}
            </span>
            Bekleyen Taslak
          </button>
        )}
        <Link href="/faturalar/yeni">
          <Button className="rounded-full" data-testid="button-fatura-yeni">
            <Plus className="mr-2 h-4 w-4" /> Yeni Fatura
          </Button>
        </Link>
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
              size="sm" variant="outline" className="h-7 text-xs rounded-full gap-1"
              disabled={topluPdfIndiriyor}
              onClick={topluPdfIndir}
            >
              <Download className="h-3 w-3" />
              {topluPdfIndiriyor ? "İndiriliyor..." : "Toplu PDF"}
            </Button>
            <Button
              size="sm" variant="outline" className="h-7 text-xs rounded-full gap-1"
              onClick={() => setTopluDurumModal(true)}
            >
              <SquarePen className="h-3 w-3" />
              Durum Değiştir
            </Button>
          </div>
        )}
      </div>

      {gruplu ? (
        <div className="space-y-6">
          {gruplu.map(([firmaAd, faturaGrubu]) => (
            <div key={firmaAd}>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{firmaAd}</h3>
              <div className="space-y-2">{faturaGrubu.map(faturaSatiri)}</div>
            </div>
          ))}
          {filtrelenmis.length === 0 && (
            <div className="text-center text-muted-foreground py-16">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Fatura bulunamadı.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtrelenmis.map(faturaSatiri)}
          {filtrelenmis.length === 0 && (
            <div className="text-center text-muted-foreground py-16">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Fatura bulunamadı.</p>
            </div>
          )}
        </div>
      )}

      <Dialog open={odemeModal} onOpenChange={setOdemeModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Hızlı Ödeme Kaydet — {secilenFatura?.faturaNo}</DialogTitle></DialogHeader>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOdemeModal(false)} className="rounded-full">İptal</Button>
            <Button onClick={odemeKaydet} disabled={!odemeTutar || createOdeme.isPending} className="rounded-full">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <Button variant="outline" onClick={() => setGonderModal(false)} className="rounded-full">İptal</Button>
            <Button onClick={gonderFatura} disabled={!aliciAdres || gonderiyor} className="rounded-full">
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
            <Button variant="outline" onClick={() => setTopluDurumModal(false)} className="rounded-full">İptal</Button>
            <Button onClick={topluDurumKaydet} disabled={topluDurumGuncelle.isPending} className="rounded-full">Uygula</Button>
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
