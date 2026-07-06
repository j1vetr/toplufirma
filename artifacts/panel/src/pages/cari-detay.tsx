import { useState, useEffect, useMemo } from "react";
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
  TrendingUp, TrendingDown, TriangleAlert, Trash2,
  FileSpreadsheet, Mail, Send,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

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
}
interface CariDetay {
  firma: { id: number; ad: string; adres?: string | null; vergiNo?: string | null; telefon?: string | null; eposta?: string | null; paraBirimi: string };
  catiFirma: { id: number; ad: string; vergiNo?: string | null; logo?: string | null } | null;
  ozet: { toplamBorc: number; toplamAlacak: number; bakiye: number; paraBirimi: string };
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
  acik: "Açık",
  kismi_odendi: "Kısmi Ödendi",
  odendi: "Ödendi",
};
const YONTEM_ETIKET: Record<string, string> = {
  banka_havalesi: "Banka Havalesi", eft: "EFT", nakit: "Nakit",
  kredi_karti: "Kredi Kartı", wise: "Wise", paypal: "PayPal", diger: "Diğer",
};

export default function CariDetay() {
  const [, params] = useRoute("/cariler/:id");
  const id = Number(params?.id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { canWrite } = useYetki();

  const [baslangic, setBaslangic] = useState("");
  const [bitis, setBitis] = useState("");
  const [aktifBaslangic, setAktifBaslangic] = useState("");
  const [aktifBitis, setAktifBitis] = useState("");

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
  const [silmeOnay, setSilmeOnay] = useState<string | null>(null);
  const [siliniyor, setSiliniyor] = useState(false);

  const [gonderiModal, setGonderiModal] = useState(false);
  const [gonderiEposta, setGonderiEposta] = useState("");
  const [gonderiMesaj, setGonderiMesaj] = useState("");
  const [gonderiyor, setGonderiyor] = useState(false);
  const [aktifPb, setAktifPb] = useState<string | null>(null);

  const createOdeme = useCreateOdeme();
  const { data: bankaHesaplariGenel = [] } = useListBankaHesaplari(undefined, {
    query: { queryKey: getListBankaHesaplariQueryKey() },
  });

  const { data: detay, isLoading } = useQuery<CariDetay>({
    queryKey: ["cari-detay", id, aktifBaslangic, aktifBitis],
    queryFn: async () => {
      const token = localStorage.getItem("panel_token") ?? "";
      const ps = new URLSearchParams();
      if (aktifBaslangic) ps.set("baslangic", aktifBaslangic);
      if (aktifBitis) ps.set("bitis", aktifBitis);
      const r = await fetch(`${apiBase()}/cariler/${id}?${ps}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Cari yüklenemedi");
      return r.json();
    },
    enabled: !!id,
  });

  const pbOzetler = useMemo(() => {
    const kalemler = detay?.kalemler ?? [];
    const map = new Map<string, { toplamBorc: number; toplamAlacak: number }>();
    for (const k of kalemler) {
      const pb = k.paraBirimi;
      const cur = map.get(pb) ?? { toplamBorc: 0, toplamAlacak: 0 };
      cur.toplamBorc += k.borc;
      cur.toplamAlacak += k.alacak;
      map.set(pb, cur);
    }
    return [...map.entries()]
      .map(([pb, v]) => ({
        paraBirimi: pb,
        toplamBorc: v.toplamBorc,
        toplamAlacak: v.toplamAlacak,
        bakiye: v.toplamBorc - v.toplamAlacak,
      }))
      .filter(d => d.toplamBorc > 0.005 || d.toplamAlacak > 0.005);
  }, [detay?.kalemler]);

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
    setIslemPb(detay?.firma.paraBirimi ?? "USD");
    setIslemModal(true);
  }

  async function pdfIndir() {
    setPdfIndiriyor(true);
    try {
      const token = localStorage.getItem("panel_token") ?? "";
      const ps = new URLSearchParams();
      if (aktifBaslangic) ps.set("baslangic", aktifBaslangic);
      if (aktifBitis) ps.set("bitis", aktifBitis);
      const r = await fetch(`${apiBase()}/cariler/${id}/pdf?${ps}`, {
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
      const r = await fetch(`${apiBase()}/cariler/${id}/excel?${ps}`, {
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

  function openGonderiModal() {
    setGonderiEposta(detay?.firma.eposta ?? "");
    setGonderiMesaj("");
    setGonderiModal(true);
  }

  async function ekstreGonder() {
    if (!gonderiEposta.trim()) return;
    setGonderiyor(true);
    try {
      const token = localStorage.getItem("panel_token") ?? "";
      const r = await fetch(`${apiBase()}/cariler/${id}/send-ekstre`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          aliciEposta: gonderiEposta.trim(),
          mesaj: gonderiMesaj.trim() || undefined,
          baslangic: aktifBaslangic || undefined,
          bitis: aktifBitis || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gönderilemedi");
      toast({ title: "Ekstre gönderildi", description: data.mesaj });
      setGonderiModal(false);
    } catch (err: unknown) {
      toast({
        title: "Gönderim başarısız",
        description: err instanceof Error ? err.message : "Beklenmedik hata",
        variant: "destructive",
      });
    } finally {
      setGonderiyor(false);
    }
  }

  async function islemSil(kalemId: string) {
    const odemeId = Number(kalemId.replace(/^o-/, ""));
    if (!odemeId) return;
    setSiliniyor(true);
    try {
      const token = localStorage.getItem("panel_token") ?? "";
      const r = await fetch(`${apiBase()}/odemeler/${odemeId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Silinemedi");
      await qc.invalidateQueries({ queryKey: ["cari-detay", id] });
      qc.invalidateQueries({ queryKey: ["cariler"] });
      setSilmeOnay(null);
      toast({ title: "İşlem silindi" });
    } catch {
      toast({ title: "Silme başarısız", variant: "destructive" });
    } finally {
      setSiliniyor(false);
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
          qc.invalidateQueries({ queryKey: ["cari-detay", id] });
          qc.invalidateQueries({ queryKey: ["cariler"] });
          setIslemModal(false);
          setIslemTutar(""); setIslemAciklama(""); setIslemBanka("");
          toast({ title: "İşlem kaydedildi" });
        },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      }
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="h-10 bg-muted animate-pulse rounded-none" />
        <div className="h-24 bg-muted animate-pulse rounded-none" />
        <div className="h-64 bg-muted animate-pulse rounded-none" />
      </div>
    );
  }
  if (!detay) {
    return <div className="text-center py-20 text-muted-foreground">Cari bulunamadı.</div>;
  }

  const { firma, catiFirma, ozet, kalemler } = detay;
  const oncekiBakiye = detay.oncekiBakiye ?? null;
  const catiFirmaBankalar = bankaHesaplariGenel.filter(b => b.catiFirmaId === catiFirma?.id);

  const bakiyeRenk =
    ozet.bakiye > 0.01 ? "text-orange-600" : ozet.bakiye < -0.01 ? "text-red-600" : "text-green-600";
  const bakiyeBg =
    ozet.bakiye > 0.01 ? "bg-orange-50" : ozet.bakiye < -0.01 ? "bg-red-50" : "bg-green-50";

  const devredenRenk =
    oncekiBakiye !== null && oncekiBakiye > 0.01
      ? "text-orange-600"
      : oncekiBakiye !== null && oncekiBakiye < -0.01
      ? "text-red-600"
      : "text-green-600";

  const silmeKalem = silmeOnay ? kalemler.find(k => k.id === silmeOnay) : null;

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-start gap-3 flex-wrap">
        <Link href="/cariler">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-display font-semibold leading-tight">{firma.ad}</h2>
          {catiFirma && <p className="text-sm text-muted-foreground">{catiFirma.ad}</p>}
          {firma.vergiNo && <p className="text-xs text-muted-foreground">Vergi No: {firma.vergiNo}</p>}
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="outline" size="sm" onClick={pdfIndir} disabled={pdfIndiriyor}>
            {pdfIndiriyor ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
            {pdfIndiriyor ? "Hazırlanıyor..." : "PDF"}
          </Button>
          <Button variant="outline" size="sm" onClick={excelIndir} disabled={excelIndiriyor}>
            {excelIndiriyor ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}
            {excelIndiriyor ? "Hazırlanıyor..." : "Excel"}
          </Button>
          {canWrite && catiFirma && (
            <Button variant="outline" size="sm" onClick={openGonderiModal}>
              <Mail className="mr-1 h-4 w-4" /> E-posta
            </Button>
          )}
          {canWrite && catiFirma && (
            <Button size="sm" onClick={openIslemModal}>
              <Plus className="mr-1 h-4 w-4" /> İşlem Ekle
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <p className="text-xs text-muted-foreground shrink-0 font-medium">Dönem filtresi:</p>
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <Input
              type="date"
              value={baslangic}
              onChange={e => setBaslangic(e.target.value)}
              className="h-8 w-36 text-xs"
            />
            <span className="text-muted-foreground text-xs">-</span>
            <Input
              type="date"
              value={bitis}
              onChange={e => setBitis(e.target.value)}
              className="h-8 w-36 text-xs"
            />
            {(aktifBaslangic || aktifBitis) && (
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={filtreTemizle}>
                Temizle
              </Button>
            )}
            {(baslangic !== aktifBaslangic || bitis !== aktifBitis) && (baslangic || bitis) && (
              <span className="text-xs text-muted-foreground animate-pulse">yükleniyor…</span>
            )}
          </div>
        </CardContent>
      </Card>

      {pbOzetler.length > 1 ? (
        <div className="space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {pbOzetler.map(d => (
              <button
                key={d.paraBirimi}
                onClick={() => setAktifPb(d.paraBirimi)}
                className={`px-3 py-1 text-xs font-semibold border transition-colors rounded-none ${
                  aktifPb === d.paraBirimi
                    ? "bg-foreground text-background border-foreground"
                    : "bg-muted text-muted-foreground border-muted-foreground/20 hover:bg-muted/80"
                }`}
              >
                {d.paraBirimi}
              </button>
            ))}
          </div>
          {pbOzetler.filter(d => d.paraBirimi === aktifPb).map(d => {
            const pbBakiyeRenk = d.bakiye > 0.01 ? "text-orange-600" : d.bakiye < -0.01 ? "text-red-600" : "text-green-600";
            const pbBakiyeBg  = d.bakiye > 0.01 ? "bg-orange-50" : d.bakiye < -0.01 ? "bg-red-50" : "bg-green-50";
            return (
              <div key={d.paraBirimi} className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Toplam Borç</p>
                    <p className="text-xl font-display font-bold">{fmt(d.toplamBorc)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{d.paraBirimi}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Toplam Tahsilat</p>
                    <p className="text-xl font-display font-bold text-green-700">{fmt(d.toplamAlacak)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{d.paraBirimi}</p>
                  </CardContent>
                </Card>
                <Card className={pbBakiyeBg}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Net Bakiye</p>
                    <p className={`text-xl font-display font-bold ${pbBakiyeRenk}`}>{fmt(Math.abs(d.bakiye))}</p>
                    <p className={`text-xs mt-0.5 ${pbBakiyeRenk}`}>
                      {d.paraBirimi} &bull; {d.bakiye > 0.01 ? "Tahsil edilecek" : d.bakiye < -0.01 ? "Ödenecek" : "Kapatılmış"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Toplam Borç</p>
              <p className="text-xl font-display font-bold">{fmt(ozet.toplamBorc)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{ozet.paraBirimi}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Toplam Tahsilat</p>
              <p className="text-xl font-display font-bold text-green-700">{fmt(ozet.toplamAlacak)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{ozet.paraBirimi}</p>
            </CardContent>
          </Card>
          <Card className={bakiyeBg}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Net Bakiye</p>
              <p className={`text-xl font-display font-bold ${bakiyeRenk}`}>{fmt(Math.abs(ozet.bakiye))}</p>
              <p className={`text-xs mt-0.5 ${bakiyeRenk}`}>
                {ozet.paraBirimi} &bull; {ozet.bakiye > 0.01 ? "Tahsil edilecek" : ozet.bakiye < -0.01 ? "Ödenecek" : "Kapatılmış"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          {kalemler.length === 0 && oncekiBakiye === null ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p>Bu dönemde kayıt bulunamadı.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground whitespace-nowrap">TARİH</th>
                  <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">AÇIKLAMA</th>
                  <th className="text-center px-3 py-2.5 font-medium text-xs text-muted-foreground whitespace-nowrap">TÜR</th>
                  <th className="text-right px-4 py-2.5 font-medium text-xs text-muted-foreground whitespace-nowrap">BORÇ</th>
                  <th className="text-right px-4 py-2.5 font-medium text-xs text-muted-foreground whitespace-nowrap">ALACAK</th>
                  <th className="text-right px-4 py-2.5 font-medium text-xs text-muted-foreground whitespace-nowrap">BAKİYE</th>
                  {canWrite && <th className="w-8" />}
                </tr>
              </thead>
              <tbody>
                {oncekiBakiye !== null && (
                  <tr className="border-b bg-slate-50/60">
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap text-xs italic">
                      {aktifBaslangic || "-"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground italic text-xs">
                      Devreden Bakiye
                    </td>
                    <td />
                    <td />
                    <td />
                    <td className={`px-4 py-2 text-right font-bold tabular-nums whitespace-nowrap text-sm ${devredenRenk}`}>
                      {fmt(Math.abs(oncekiBakiye))}
                    </td>
                    {canWrite && <td />}
                  </tr>
                )}
                {kalemler.map((k, i) => {
                  const rowBakiyeRenk =
                    k.bakiye > 0.01 ? "text-orange-600" : k.bakiye < -0.01 ? "text-red-600" : "text-green-600";
                  const isTahsilatOdeme = k.tip !== "fatura";
                  return (
                    <tr key={k.id} className={`border-b last:border-0 ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap text-xs">{k.tarih}</td>
                      <td className="px-4 py-2.5 max-w-xs">
                        {k.faturaId ? (
                          <Link href={`/faturalar/${k.faturaId}`} className="hover:underline font-medium block leading-tight">
                            {k.aciklama}
                          </Link>
                        ) : (
                          <span className="font-medium block leading-tight">{k.aciklama}</span>
                        )}
                        {k.tip === "fatura" && k.durum && FATURA_DURUM_ETIKET[k.durum] && (
                          <span className={`text-xs px-1.5 py-0.5 font-medium mt-1 inline-block ${FATURA_DURUM_BADGE[k.durum] ?? "bg-gray-100 text-gray-600"}`}>
                            {FATURA_DURUM_ETIKET[k.durum]}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TUR_RENK[k.tip]}`}>
                          {TUR_ETIKET[k.tip]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums whitespace-nowrap">
                        {k.borc > 0 ? fmt(k.borc) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-green-700 tabular-nums whitespace-nowrap">
                        {k.alacak > 0 ? fmt(k.alacak) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-bold tabular-nums whitespace-nowrap ${rowBakiyeRenk}`}>
                        {fmt(Math.abs(k.bakiye))}
                      </td>
                      {canWrite && (
                        <td className="px-2 py-2.5 text-center w-8">
                          {isTahsilatOdeme && (
                            <button
                              onClick={() => setSilmeOnay(k.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Sil"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {kalemler.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/40">
                    <td colSpan={3} className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">
                      Dönem Toplamı
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums whitespace-nowrap">
                      {fmt(ozet.toplamBorc)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-green-700 tabular-nums whitespace-nowrap">
                      {fmt(ozet.toplamAlacak)}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold tabular-nums whitespace-nowrap ${bakiyeRenk}`}>
                      {fmt(Math.abs(ozet.bakiye))}
                    </td>
                    {canWrite && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </Card>

      {pbOzetler.filter(d => d.bakiye > 0.01).map(d => (
        <div key={d.paraBirimi} className="flex items-center gap-2 text-sm text-orange-600 p-3 bg-orange-50 border border-orange-200 rounded-none">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          <span>
            <strong>{fmt(d.bakiye)} {d.paraBirimi}</strong> tahsil edilecek bakiye mevcut.
          </span>
        </div>
      ))}

      <Dialog open={islemModal} onOpenChange={setIslemModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              İşlem Ekle - {firma.ad}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>İşlem Tipi <span className="text-destructive">*</span></Label>
              <Select value={islemTip} onValueChange={setIslemTip}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tahsilat">
                    <span className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-green-600" />Tahsilat (Müşteriden alınan)</span>
                  </SelectItem>
                  <SelectItem value="odeme">
                    <span className="flex items-center gap-1.5"><TrendingDown className="h-3.5 w-3.5 text-orange-500" />Ödeme (Müşteriye yapılan)</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tutar <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                step="0.01"
                value={islemTutar}
                onChange={e => setIslemTutar(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Para Birimi</Label>
              <Select value={islemPb} onValueChange={setIslemPb}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["USD", "EUR", "TRY", "GBP"].map(pb => (
                    <SelectItem key={pb} value={pb}>{pb}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tarih <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={islemTarih}
                onChange={e => setIslemTarih(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Yöntem</Label>
              <Select value={islemYontem} onValueChange={setIslemYontem}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(YONTEM_ETIKET).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Banka Hesabı</Label>
              <Select value={islemBanka} onValueChange={setIslemBanka}>
                <SelectTrigger><SelectValue placeholder="Seçilmedi (opsiyonel)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seçilmedi</SelectItem>
                  {catiFirmaBankalar.map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.bankaAdi ? `${b.bankaAdi} - ` : ""}{b.hesapAdi}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Açıklama</Label>
              <Input
                value={islemAciklama}
                onChange={e => setIslemAciklama(e.target.value)}
                placeholder="Ödeme açıklaması (opsiyonel)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIslemModal(false)}>İptal</Button>
            <Button
              onClick={islemKaydet}
              disabled={!islemTutar || createOdeme.isPending}
            >
              {createOdeme.isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!silmeOnay} onOpenChange={open => { if (!open) setSilmeOnay(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              İşlemi Sil
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Bu işlem kaydını kalıcı olarak silmek istediğinizden emin misiniz?
            </p>
            {silmeKalem && (
              <div className="bg-muted/60 p-3 text-sm space-y-1 border-l-2 border-destructive/40">
                <p><span className="font-medium">Tür:</span> {TUR_ETIKET[silmeKalem.tip]}</p>
                <p><span className="font-medium">Tarih:</span> {silmeKalem.tarih}</p>
                <p>
                  <span className="font-medium">Tutar:</span>{" "}
                  {fmt(silmeKalem.borc > 0 ? silmeKalem.borc : silmeKalem.alacak)}{" "}
                  {silmeKalem.paraBirimi}
                </p>
                {silmeKalem.aciklama && (
                  <p><span className="font-medium">Açıklama:</span> {silmeKalem.aciklama}</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSilmeOnay(null)}>İptal</Button>
            <Button
              variant="destructive"
              onClick={() => silmeOnay && islemSil(silmeOnay)}
              disabled={siliniyor}
            >
              {siliniyor
                ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Siliniyor…</>
                : "Sil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={gonderiModal} onOpenChange={open => { if (!open) setGonderiModal(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Ekstre E-posta Gönder
            </DialogTitle>
          </DialogHeader>
          <div className="py-1 space-y-4">
            <div className="space-y-1.5">
              <Label>Alıcı E-posta <span className="text-destructive">*</span></Label>
              <Input
                type="email"
                value={gonderiEposta}
                onChange={e => setGonderiEposta(e.target.value)}
                placeholder="ornek@firma.com"
              />
            </div>
            {(aktifBaslangic || aktifBitis) && (
              <div className="bg-muted/60 rounded px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium">Dönem:</span>{" "}
                {aktifBaslangic || "-"} - {aktifBitis || "Bugün"}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Mesaj <span className="text-muted-foreground text-xs">(opsiyonel)</span></Label>
              <Textarea
                value={gonderiMesaj}
                onChange={e => setGonderiMesaj(e.target.value)}
                placeholder="Cari hesap ekstrenizi ekte bulabilirsiniz..."
                rows={4}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Ekstre PDF dosyası e-postaya ek olarak gönderilecektir.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGonderiModal(false)} disabled={gonderiyor}>
              İptal
            </Button>
            <Button onClick={ekstreGonder} disabled={!gonderiEposta.trim() || gonderiyor}>
              {gonderiyor
                ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Gönderiliyor…</>
                : <><Send className="mr-1 h-4 w-4" />Gönder</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
