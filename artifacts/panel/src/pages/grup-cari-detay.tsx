import { useState, useMemo, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCreateOdeme, useListBankaHesaplari, getListBankaHesaplariQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useYetki } from "@/hooks/use-yetki";
import {
  ArrowLeft, Download, Plus, Loader2, FileText,
  TrendingUp, TrendingDown, FileSpreadsheet, Building2, Users,
} from "lucide-react";

interface CariKalem {
  id: string;
  tarih: string;
  tip: "fatura" | "tahsilat" | "odeme";
  aciklama: string;
  borc: number;
  alacak: number;
  bakiye: number;
  paraBirimi: string;
  faturaId: number | null;
  durum: string | null;
  belgeNo?: string | null;
}

interface GrupCariDetay {
  firma: {
    id: number; ad: string; adres?: string | null; vergiNo?: string | null;
    telefon?: string | null; eposta?: string | null; paraBirimi?: string;
    tip: "grup";
    bagliFirmalar: { id: number; ad: string }[];
  };
  catiFirma: { id: number; ad: string; adres?: string | null; vergiNo?: string | null; logo?: string | null } | null;
  ozet: { toplamBorc: number; toplamAlacak: number; bakiye: number; paraBirimi: string };
  bakiyeDetay: { paraBirimi: string; toplamBorc: number; toplamAlacak: number; bakiye: number }[];
  kalemler: CariKalem[];
  bankaHesaplari: { id: number; hesapAdi: string; bankaAdi: string | null; paraBirimi: string }[];
  oncekiBakiye?: number | null;
}

const apiBase = () => {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api`;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const TUR_ETIKET = { fatura: "Fatura", tahsilat: "Tahsilat", odeme: "Ödeme" };
const TUR_RENK: Record<string, string> = {
  fatura: "bg-blue-100 text-blue-700",
  tahsilat: "bg-green-100 text-green-700",
  odeme: "bg-orange-100 text-orange-700",
};
const FATURA_DURUM_BADGE: Record<string, string> = {
  acik: "bg-orange-100 text-orange-700",
  kismi_odendi: "bg-yellow-100 text-yellow-700",
  odendi: "bg-green-100 text-green-700",
};
const FATURA_DURUM_ETIKET: Record<string, string> = {
  acik: "Açık", kismi_odendi: "Kısmi Ödendi", odendi: "Ödendi",
};
const YONTEM_ETIKET: Record<string, string> = {
  banka_havalesi: "Banka Havalesi", eft: "EFT", nakit: "Nakit",
  kredi_karti: "Kredi Kartı", wise: "Wise", paypal: "PayPal", diger: "Diğer",
};
const PARA_BIRIMLERI = ["USD", "EUR", "TRY", "GBP"];

export default function GrupCariDetay() {
  const [, params] = useRoute("/cariler/grup/:id");
  const id = Number(params?.id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { canWrite } = useYetki();

  const [baslangic, setBaslangic] = useState("");
  const [bitis, setBitis] = useState("");
  const [aktifBaslangic, setAktifBaslangic] = useState("");
  const [aktifBitis, setAktifBitis] = useState("");
  const [aktifPb, setAktifPb] = useState<string | null>(null);

  const [islemModal, setIslemModal] = useState(false);
  const [islemTip, setIslemTip] = useState("tahsilat");
  const [islemTarih, setIslemTarih] = useState(new Date().toISOString().split("T")[0]);
  const [islemTutar, setIslemTutar] = useState("");
  const [islemPb, setIslemPb] = useState("USD");
  const [islemYontem, setIslemYontem] = useState("banka_havalesi");
  const [islemBanka, setIslemBanka] = useState("");
  const [islemAciklama, setIslemAciklama] = useState("");
  const [pdfIndiriyor, setPdfIndiriyor] = useState(false);
  const [excelIndiriyor, setExcelIndiriyor] = useState(false);

  const createOdeme = useCreateOdeme();
  const { data: bankaHesaplariGenel = [] } = useListBankaHesaplari(undefined, {
    query: { queryKey: getListBankaHesaplariQueryKey() },
  });

  const { data: detay, isLoading } = useQuery<GrupCariDetay>({
    queryKey: ["grup-cari-detay", id, aktifBaslangic, aktifBitis],
    queryFn: async () => {
      const token = localStorage.getItem("panel_token") ?? "";
      const ps = new URLSearchParams();
      if (aktifBaslangic) ps.set("baslangic", aktifBaslangic);
      if (aktifBitis) ps.set("bitis", aktifBitis);
      const r = await fetch(`${apiBase()}/cariler/grup/${id}?${ps}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Grup cari yüklenemedi");
      return r.json();
    },
    enabled: !!id,
  });

  const pbOzetler = useMemo(() => {
    return (detay?.bakiyeDetay ?? []).filter(d => d.toplamBorc > 0.005 || d.toplamAlacak > 0.005);
  }, [detay?.bakiyeDetay]);

  useEffect(() => {
    if (pbOzetler.length > 0 && (aktifPb === null || !pbOzetler.find(d => d.paraBirimi === aktifPb))) {
      setAktifPb(pbOzetler[0].paraBirimi);
    }
  }, [pbOzetler, aktifPb]);

  useEffect(() => {
    const t = setTimeout(() => {
      setAktifBaslangic(baslangic);
      setAktifBitis(bitis);
    }, 600);
    return () => clearTimeout(t);
  }, [baslangic, bitis]);

  function filtreTemizle() {
    setBaslangic(""); setBitis(""); setAktifBaslangic(""); setAktifBitis("");
  }

  function openIslemModal() {
    setIslemTip("tahsilat");
    setIslemPb(detay?.firma.paraBirimi ?? "USD");
    setIslemTarih(new Date().toISOString().split("T")[0]);
    setIslemTutar("");
    setIslemAciklama("");
    setIslemBanka("");
    setIslemModal(true);
  }

  async function pdfIndir() {
    setPdfIndiriyor(true);
    try {
      const token = localStorage.getItem("panel_token") ?? "";
      const ps = new URLSearchParams();
      if (aktifBaslangic) ps.set("baslangic", aktifBaslangic);
      if (aktifBitis) ps.set("bitis", aktifBitis);
      const r = await fetch(`${apiBase()}/cariler/grup/${id}/pdf?${ps}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("PDF oluşturulamadı");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cari-${detay?.firma.ad ?? id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "PDF indirilemedi", variant: "destructive" });
    } finally {
      setPdfIndiriyor(false);
    }
  }

  async function excelIndir() {
    setExcelIndiriyor(true);
    try {
      const token = localStorage.getItem("panel_token") ?? "";
      const ps = new URLSearchParams();
      if (aktifBaslangic) ps.set("baslangic", aktifBaslangic);
      if (aktifBitis) ps.set("bitis", aktifBitis);
      const r = await fetch(`${apiBase()}/cariler/grup/${id}/excel?${ps}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Excel oluşturulamadı");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ekstre-${detay?.firma.ad ?? id}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Excel indirilemedi", variant: "destructive" });
    } finally {
      setExcelIndiriyor(false);
    }
  }

  function islemKaydet() {
    if (!islemTutar || !detay?.catiFirma?.id) return;
    createOdeme.mutate(
      {
        data: {
          catiFirmaId: detay.catiFirma.id,
          bagliFirmaId: id,
          tip: islemTip as import("@workspace/api-client-react").OdemeInputTip,
          tarih: islemTarih,
          tutar: Number(islemTutar),
          paraBirimi: islemPb,
          odemeYontemi: islemYontem as import("@workspace/api-client-react").OdemeInputOdemeYontemi,
          bankaHesabiId: islemBanka && islemBanka !== "none" ? Number(islemBanka) : undefined,
          aciklama: islemAciklama || undefined,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["grup-cari-detay", id] });
          qc.invalidateQueries({ queryKey: ["cariler"] });
          setIslemModal(false);
          toast({ title: "İşlem kaydedildi" });
        },
        onError: () => toast({ title: "İşlem kaydedilemedi", variant: "destructive" }),
      },
    );
  }

  const aktifPbOzet = pbOzetler.find(d => d.paraBirimi === aktifPb);
  const filtrelenmisKalemler = aktifPb
    ? (detay?.kalemler ?? []).filter(k => k.paraBirimi === aktifPb)
    : (detay?.kalemler ?? []);

  const bankaHesaplari = detay?.bankaHesaplari ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-none" />)}
      </div>
    );
  }

  if (!detay) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>Grup cari bulunamadı.</p>
        <Link href="/cariler"><Button variant="outline" className="mt-4">Cariler</Button></Link>
      </div>
    );
  }

  const { firma, catiFirma, ozet, oncekiBakiye } = detay;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/cariler">
          <Button variant="ghost" size="sm" className="gap-1.5 px-2">
            <ArrowLeft className="h-4 w-4" />
            Cariler
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground shrink-0" />
            <h1 className="text-2xl font-display font-bold truncate">{firma.ad}</h1>
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full shrink-0">Grup</span>
          </div>
          {catiFirma && (
            <p className="text-sm text-muted-foreground mt-1">{catiFirma.ad}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          {canWrite && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={openIslemModal}>
              <Plus className="h-4 w-4" />
              Ödeme
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={pdfIndir} disabled={pdfIndiriyor}>
            {pdfIndiriyor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            PDF
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={excelIndir} disabled={excelIndiriyor}>
            {excelIndiriyor ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Excel
          </Button>
        </div>
      </div>

      {firma.bagliFirmalar.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {firma.bagliFirmalar.map(bf => (
            <Link key={bf.id} href={`/cariler/${bf.id}`}>
              <span className="inline-flex items-center gap-1.5 text-xs border border-border rounded-full px-2.5 py-1 hover:bg-muted transition-colors cursor-pointer">
                <Building2 className="h-3 w-3 text-muted-foreground" />
                {bf.ad}
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 items-end">
        <div className="flex gap-2 items-end flex-1">
          <div className="space-y-1">
            <Label className="text-xs">Başlangıç</Label>
            <input
              type="date"
              value={baslangic}
              onChange={e => setBaslangic(e.target.value)}
              className="flex h-8 rounded-none border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Bitiş</Label>
            <input
              type="date"
              value={bitis}
              onChange={e => setBitis(e.target.value)}
              className="flex h-8 rounded-none border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          {(baslangic || bitis) && (
            <Button variant="ghost" size="sm" onClick={filtreTemizle} className="h-8 px-2 text-xs">
              Temizle
            </Button>
          )}
        </div>
      </div>

      {pbOzetler.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {pbOzetler.map(d => (
            <button
              key={d.paraBirimi}
              onClick={() => setAktifPb(d.paraBirimi)}
              className={`text-left p-3 border transition-colors ${aktifPb === d.paraBirimi ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
            >
              <p className="text-xs text-muted-foreground font-medium">{d.paraBirimi}</p>
              <p className={`text-lg font-display font-bold mt-0.5 ${d.bakiye > 0.01 ? "text-orange-600" : d.bakiye < -0.01 ? "text-red-600" : "text-green-600"}`}>
                {fmt(Math.abs(d.bakiye))}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {d.bakiye > 0.01 ? "Alacaklı" : d.bakiye < -0.01 ? "Borçlu" : "Kapatılmış"}
              </p>
            </button>
          ))}
        </div>
      )}

      {aktifPbOzet && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  {oncekiBakiye != null ? "Dönem Borç" : "Toplam Borç"}
                </p>
              </div>
              <p className="text-xl font-display font-bold">{fmt(aktifPbOzet.toplamBorc)}</p>
              <p className="text-xs text-muted-foreground">{aktifPbOzet.paraBirimi}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <p className="text-xs text-muted-foreground">
                  {oncekiBakiye != null ? "Dönem Tahsilat" : "Toplam Tahsilat"}
                </p>
              </div>
              <p className="text-xl font-display font-bold text-green-600">{fmt(aktifPbOzet.toplamAlacak)}</p>
              <p className="text-xs text-muted-foreground">{aktifPbOzet.paraBirimi}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Bakiye</p>
              </div>
              <p className={`text-xl font-display font-bold ${aktifPbOzet.bakiye > 0.01 ? "text-orange-600" : aktifPbOzet.bakiye < -0.01 ? "text-red-600" : "text-green-600"}`}>
                {fmt(Math.abs(aktifPbOzet.bakiye))}
              </p>
              <p className="text-xs text-muted-foreground">{aktifPbOzet.paraBirimi}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {oncekiBakiye != null && oncekiBakiye !== 0 && (
        <div className="flex items-center justify-between p-3 bg-muted/50 border text-sm">
          <span className="text-muted-foreground font-medium">Dönem Öncesi Bakiye</span>
          <span className={`font-bold ${oncekiBakiye > 0 ? "text-orange-600" : oncekiBakiye < 0 ? "text-red-600" : "text-green-600"}`}>
            {fmt(Math.abs(oncekiBakiye))} {aktifPb}
          </span>
        </div>
      )}

      {pbOzetler.length > 1 && (
        <div className="flex gap-1 border-b">
          {pbOzetler.map(d => (
            <button
              key={d.paraBirimi}
              onClick={() => setAktifPb(d.paraBirimi)}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${aktifPb === d.paraBirimi ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {d.paraBirimi}
            </button>
          ))}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Hareketler
          {aktifPb && pbOzetler.length > 1 && <span className="ml-1 text-primary">({aktifPb})</span>}
        </h2>

        {filtrelenmisKalemler.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border border-dashed">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Bu dönemde hareket bulunamadı</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground text-xs">Tarih</th>
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground text-xs">Belge</th>
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground text-xs">Açıklama</th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs">Borç</th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs">Alacak</th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs">Bakiye</th>
                </tr>
              </thead>
              <tbody>
                {filtrelenmisKalemler.map(kalem => {
                  const kBakiye = (oncekiBakiye ?? 0) + kalem.bakiye;
                  const bakiyeRenk = kBakiye > 0.005 ? "text-orange-600" : kBakiye < -0.005 ? "text-red-600" : "text-green-600";
                  return (
                    <tr key={kalem.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                        {kalem.tarih ? new Date(kalem.tarih + "T00:00:00").toLocaleDateString("tr-TR") : ""}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${TUR_RENK[kalem.tip] ?? ""}`}>
                            {TUR_ETIKET[kalem.tip] ?? kalem.tip}
                          </span>
                          {kalem.tip === "fatura" && kalem.durum && FATURA_DURUM_BADGE[kalem.durum] && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${FATURA_DURUM_BADGE[kalem.durum]}`}>
                              {FATURA_DURUM_ETIKET[kalem.durum] ?? kalem.durum}
                            </span>
                          )}
                        </div>
                        {kalem.belgeNo && (
                          <p className="text-xs text-muted-foreground mt-0.5 font-mono">{kalem.belgeNo}</p>
                        )}
                      </td>
                      <td className="py-2.5 px-3 max-w-xs">
                        {kalem.faturaId ? (
                          <Link href={`/faturalar/${kalem.faturaId}`} className="hover:text-primary">
                            {kalem.aciklama}
                          </Link>
                        ) : (
                          <span>{kalem.aciklama}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {kalem.borc > 0.005 ? fmt(kalem.borc) : ""}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-green-700">
                        {kalem.alacak > 0.005 ? fmt(kalem.alacak) : ""}
                      </td>
                      <td className={`py-2.5 px-3 text-right tabular-nums font-bold ${bakiyeRenk}`}>
                        {fmt(Math.abs(kBakiye))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={islemModal} onOpenChange={setIslemModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ödeme / Tahsilat — {firma.ad}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>İşlem Tipi</Label>
              <Select value={islemTip} onValueChange={setIslemTip}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tahsilat">Tahsilat</SelectItem>
                  <SelectItem value="odeme">Ödeme</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <Label>Tutar *</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={islemTutar}
                  onChange={e => setIslemTutar(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="w-28 space-y-1.5">
                <Label>Para Birimi</Label>
                <Select value={islemPb} onValueChange={setIslemPb}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PARA_BIRIMLERI.map(pb => <SelectItem key={pb} value={pb}>{pb}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tarih *</Label>
              <Input type="date" value={islemTarih} onChange={e => setIslemTarih(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ödeme Yöntemi</Label>
              <Select value={islemYontem} onValueChange={setIslemYontem}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(YONTEM_ETIKET).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {bankaHesaplari.length > 0 && (
              <div className="space-y-1.5">
                <Label>Banka Hesabı <span className="text-xs text-muted-foreground">(opsiyonel)</span></Label>
                <Select value={islemBanka || "none"} onValueChange={v => {
                  setIslemBanka(v);
                  if (v !== "none") {
                    const b = bankaHesaplari.find(x => String(x.id) === v);
                    if (b?.paraBirimi) setIslemPb(b.paraBirimi);
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="Belirtilmedi" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Belirtilmedi</SelectItem>
                    {bankaHesaplari.map(b => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.bankaAdi ? `${b.bankaAdi} - ` : ""}{b.hesapAdi}{b.paraBirimi ? ` (${b.paraBirimi})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Açıklama <span className="text-xs text-muted-foreground">(opsiyonel)</span></Label>
              <Input value={islemAciklama} onChange={e => setIslemAciklama(e.target.value)} placeholder="İşlem açıklaması" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIslemModal(false)}>İptal</Button>
            <Button onClick={islemKaydet} disabled={!islemTutar || !islemTarih || createOdeme.isPending}>
              {createOdeme.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
