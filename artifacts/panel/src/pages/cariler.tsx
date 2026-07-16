import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useSirket } from "@/contexts/sirket-context";
import { BookOpen, Search, TrendingDown, ChevronRight, AlertCircle, Plus, CreditCard, Building2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import {
  useCreateOdeme, useListBankaHesaplari, getListBankaHesaplariQueryKey,
} from "@workspace/api-client-react";
import type { OdemeInputOdemeYontemi } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

interface BakiyeDetay {
  paraBirimi: string;
  toplamBorc: number;
  toplamAlacak: number;
  bakiye: number;
}

interface CariOzet {
  bagliFirmaId: number;
  bagliFirmaAd: string;
  catiFirmaId: number | null;
  catiFirmaAd: string | null;
  ustMusteriId?: number | null;
  ustMusteriAd?: string | null;
  gemiAd?: string | null;
  toplamBorc: number;
  toplamAlacak: number;
  bakiye: number;
  acikFaturaAdedi: number;
  paraBirimi: string;
  sonIslemTarihi: string | null;
  bakiyeDetay?: BakiyeDetay[];
}

const apiBase = () => {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api`;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function sonIslemYaz(tarih: string | null): string {
  if (!tarih) return "";
  try {
    return formatDistanceToNow(new Date(tarih), { addSuffix: true, locale: tr });
  } catch {
    return tarih;
  }
}

const YONTEM_ETIKET: Record<string, string> = {
  banka_havalesi: "Banka Havalesi", eft: "EFT", nakit: "Nakit",
  kredi_karti: "Kredi Kartı", wise: "Wise", paypal: "PayPal", diger: "Diğer",
};
const PARA_BIRIMLERI = ["USD", "EUR", "TRY", "GBP"];

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function Cariler() {
  const { aktifSirketId } = useSirket();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [arama, setArama] = useState("");
  const [bakiyeFiltre, setBakiyeFiltre] = useState("tumu");
  const [siralama, setSiralama] = useState("bakiye_desc");

  const [odemeModal, setOdemeModal] = useState<CariOzet | null>(null);
  const [odTutar, setOdTutar] = useState("");
  const [odPb, setOdPb] = useState("USD");
  const [odTarih, setOdTarih] = useState(localToday());
  const [odYontem, setOdYontem] = useState("banka_havalesi");
  const [odBanka, setOdBanka] = useState("none");
  const [odAciklama, setOdAciklama] = useState("");

  const createOdeme = useCreateOdeme();
  const { data: bankaHesaplari = [] } = useListBankaHesaplari(undefined, {
    query: { queryKey: getListBankaHesaplariQueryKey(), enabled: !!odemeModal?.catiFirmaId },
  });
  const modalBankalar = bankaHesaplari.filter(b => b.catiFirmaId === odemeModal?.catiFirmaId && b.faturadaGoster !== false);

  function odemeAc(c: CariOzet, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOdTutar("");
    setOdPb(c.paraBirimi || "USD");
    setOdTarih(localToday());
    setOdYontem("banka_havalesi");
    setOdBanka("none");
    setOdAciklama("");
    setOdemeModal(c);
  }

  function odemeKaydet() {
    if (!odemeModal?.catiFirmaId || !odTutar || !odTarih) return;
    createOdeme.mutate({
      data: {
        catiFirmaId: odemeModal.catiFirmaId,
        bagliFirmaId: odemeModal.bagliFirmaId,
        tip: "tahsilat",
        tarih: odTarih,
        tutar: Number(odTutar),
        paraBirimi: odPb,
        odemeYontemi: odYontem as OdemeInputOdemeYontemi,
        bankaHesabiId: odBanka !== "none" ? Number(odBanka) : undefined,
        aciklama: odAciklama || undefined,
      },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["cariler"] });
        setOdemeModal(null);
        toast({ title: "Ödeme kaydedildi" });
      },
      onError: () => toast({ title: "Ödeme kaydedilemedi", variant: "destructive" }),
    });
  }

  const { data: cariler = [], isLoading } = useQuery<CariOzet[]>({
    queryKey: ["cariler", aktifSirketId],
    queryFn: async () => {
      const token = localStorage.getItem("panel_token") ?? "";
      const params = new URLSearchParams();
      if (aktifSirketId) params.set("catiFirmaId", String(aktifSirketId));
      const r = await fetch(`${apiBase()}/cariler?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Cariler yüklenemedi");
      return r.json();
    },
  });

  const filtrelenmis = useMemo(() => {
    const filtered = cariler.filter(c => {
      const aramaUyum = !arama || c.bagliFirmaAd.toLowerCase().includes(arama.toLowerCase());
      const bakiyeUyum =
        bakiyeFiltre === "tumu" ||
        (bakiyeFiltre === "bakiyeli" && c.bakiye > 0.01) ||
        (bakiyeFiltre === "temiz" && c.bakiye <= 0.01);
      return aramaUyum && bakiyeUyum;
    });

    return [...filtered].sort((a, b) => {
      if (siralama === "ad_asc") return a.bagliFirmaAd.localeCompare(b.bagliFirmaAd, "tr");
      if (siralama === "ad_desc") return b.bagliFirmaAd.localeCompare(a.bagliFirmaAd, "tr");
      if (siralama === "bakiye_asc") return a.bakiye - b.bakiye;
      if (siralama === "sonIslem_desc") {
        const aT = a.sonIslemTarihi ?? "";
        const bT = b.sonIslemTarihi ?? "";
        return bT.localeCompare(aT);
      }
      return b.bakiye - a.bakiye;
    });
  }, [cariler, arama, bakiyeFiltre, siralama]);

  const gruplar = useMemo(() => {
    type GrupEntry = {
      ustMusteriAd: string | null;
      cariler: CariOzet[];
      konsolide: BakiyeDetay[];
    };
    const map = new Map<number | string, GrupEntry>();

    for (const c of filtrelenmis) {
      const key = c.ustMusteriId ?? "bagimsiz";
      if (!map.has(key)) {
        map.set(key, { ustMusteriAd: c.ustMusteriAd ?? null, cariler: [], konsolide: [] });
      }
      map.get(key)!.cariler.push(c);
    }

    for (const [, grup] of map) {
      const pbMap = new Map<string, { toplamBorc: number; toplamAlacak: number; bakiye: number }>();
      for (const c of grup.cariler) {
        const items =
          c.bakiyeDetay && c.bakiyeDetay.length > 0
            ? c.bakiyeDetay
            : [{ paraBirimi: c.paraBirimi || "USD", toplamBorc: c.toplamBorc, toplamAlacak: c.toplamAlacak, bakiye: c.bakiye }];
        for (const d of items) {
          const cur = pbMap.get(d.paraBirimi) ?? { toplamBorc: 0, toplamAlacak: 0, bakiye: 0 };
          cur.toplamBorc += d.toplamBorc;
          cur.toplamAlacak += d.toplamAlacak;
          cur.bakiye += d.bakiye;
          pbMap.set(d.paraBirimi, cur);
        }
      }
      grup.konsolide = [...pbMap.entries()]
        .map(([pb, v]) => ({ paraBirimi: pb, ...v }))
        .filter(d => d.toplamBorc > 0.005 || d.toplamAlacak > 0.005)
        .sort((a, b) => b.bakiye - a.bakiye);
    }

    return [...map.entries()].sort(([keyA, a], [keyB, b]) => {
      if (keyA === "bagimsiz" && keyB !== "bagimsiz") return 1;
      if (keyA !== "bagimsiz" && keyB === "bagimsiz") return -1;
      return (a.ustMusteriAd ?? "").localeCompare(b.ustMusteriAd ?? "", "tr");
    });
  }, [filtrelenmis]);

  const ozet = useMemo(() => {
    const map: Record<string, { alacakBakiye: number; tahsilat: number }> = {};
    for (const c of filtrelenmis) {
      if (c.bakiyeDetay && c.bakiyeDetay.length > 0) {
        for (const d of c.bakiyeDetay) {
          if (!map[d.paraBirimi]) map[d.paraBirimi] = { alacakBakiye: 0, tahsilat: 0 };
          map[d.paraBirimi].alacakBakiye += Math.max(0, d.bakiye);
          map[d.paraBirimi].tahsilat += d.toplamAlacak;
        }
      } else {
        const pb = c.paraBirimi || "TRY";
        if (!map[pb]) map[pb] = { alacakBakiye: 0, tahsilat: 0 };
        map[pb].alacakBakiye += Math.max(0, c.bakiye);
        map[pb].tahsilat += c.toplamAlacak;
      }
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtrelenmis]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-none" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Cariler</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {cariler.length} müşteri - toplam {filtrelenmis.filter(c => c.acikFaturaAdedi > 0).length} aktif hesap
          </p>
        </div>
        <Link href="/firmalar?yeni=bagli">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Yeni Müşteri
          </Button>
        </Link>
      </div>

      {filtrelenmis.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="p-2.5 rounded-sm bg-orange-500/10 mt-0.5 shrink-0">
                <TrendingDown className="h-5 w-5 text-orange-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground mb-1">Toplam Alacak (Bakiye)</p>
                {ozet.length === 0 ? (
                  <p className="text-lg font-display font-bold text-orange-600">0,00</p>
                ) : ozet.length === 1 ? (
                  <p className="text-lg font-display font-bold text-orange-600">
                    {fmt(ozet[0][1].alacakBakiye)} {ozet[0][0]}
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {ozet.map(([pb, v]) => (
                      <div key={pb} className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">{pb}</span>
                        <span className="text-sm font-display font-bold text-orange-600 tabular-nums">
                          {fmt(v.alacakBakiye)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="p-2.5 rounded-sm bg-blue-500/10 mt-0.5 shrink-0">
                <BookOpen className="h-5 w-5 text-blue-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground mb-1">Toplam Tahsilat</p>
                {ozet.length === 0 ? (
                  <p className="text-lg font-display font-bold text-blue-600">0,00</p>
                ) : ozet.length === 1 ? (
                  <p className="text-lg font-display font-bold text-blue-600">
                    {fmt(ozet[0][1].tahsilat)} {ozet[0][0]}
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {ozet.map(([pb, v]) => (
                      <div key={pb} className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">{pb}</span>
                        <span className="text-sm font-display font-bold text-blue-600 tabular-nums">
                          {fmt(v.tahsilat)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Müşteri adı ara..."
            value={arama}
            onChange={e => setArama(e.target.value)}
          />
        </div>
        <Select value={bakiyeFiltre} onValueChange={setBakiyeFiltre}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tumu">Tüm Hesaplar</SelectItem>
            <SelectItem value="bakiyeli">Bakiyeli</SelectItem>
            <SelectItem value="temiz">Kapatılmış</SelectItem>
          </SelectContent>
        </Select>
        <Select value={siralama} onValueChange={setSiralama}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bakiye_desc">Bakiye (Yüksek→Düşük)</SelectItem>
            <SelectItem value="bakiye_asc">Bakiye (Düşük→Yüksek)</SelectItem>
            <SelectItem value="ad_asc">Ad (A→Z)</SelectItem>
            <SelectItem value="ad_desc">Ad (Z→A)</SelectItem>
            <SelectItem value="sonIslem_desc">Son İşlem</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtrelenmis.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <BookOpen className="h-14 w-14 mx-auto mb-4 opacity-20" />
          <p className="font-medium">Cari bulunamadı</p>
          <p className="text-sm mt-1">Filtre kriterlerini değiştirin ya da müşteri kaydı ekleyin.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {gruplar.map(([grupKey, grup]) => (
            <div key={grupKey}>
              <div className="flex items-center gap-2 mb-3">
                <Building2 className={`h-4 w-4 shrink-0 ${grup.ustMusteriAd ? "text-foreground" : "text-muted-foreground"}`} />
                <span className={`text-sm font-bold uppercase tracking-wide ${grup.ustMusteriAd ? "text-foreground" : "text-muted-foreground"}`}>
                  {grup.ustMusteriAd ?? "Bağımsız Müşteriler"}
                </span>
                <div className="flex-1 h-px bg-border" />
                {grup.konsolide.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    {grup.konsolide.map(d => {
                      const renk = d.bakiye > 0.01 ? "text-orange-600" : d.bakiye < -0.01 ? "text-red-600" : "text-green-600";
                      return (
                        <span key={d.paraBirimi} className={`text-xs font-bold tabular-nums ${renk}`}>
                          {fmt(Math.abs(d.bakiye))} {d.paraBirimi}
                        </span>
                      );
                    })}
                    <span className="text-xs text-muted-foreground">•</span>
                  </div>
                )}
                <span className="text-xs text-muted-foreground shrink-0">
                  {grup.cariler.length} hesap
                </span>
              </div>
              <div className="space-y-2">
                {grup.cariler.map(c => {
                  const bakiyeRenk =
                    c.bakiye > 0.01
                      ? "text-orange-600"
                      : c.bakiye < -0.01
                      ? "text-red-600"
                      : "text-green-600";
                  const bakiyeBg =
                    c.bakiye > 0.01
                      ? "bg-orange-50 border-orange-200"
                      : c.bakiye < -0.01
                      ? "bg-red-50 border-red-200"
                      : "bg-green-50 border-green-100";
                  const kalintiYuzde = c.toplamBorc > 0
                    ? Math.min(100, (c.toplamAlacak / c.toplamBorc) * 100)
                    : 100;

                  return (
                    <Link key={c.bagliFirmaId} href={`/cariler/${c.bagliFirmaId}`}>
                      <Card className="cursor-pointer hover:shadow-md transition-shadow border">
                        <CardContent className="p-0">
                          <div className="flex items-stretch">
                            <div className="flex-1 p-4 min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-semibold text-base leading-tight truncate">
                                    {c.bagliFirmaAd}
                                    {c.gemiAd && (
                                      <span className="font-normal text-sm text-muted-foreground ml-1">
                                        ({c.gemiAd})
                                      </span>
                                    )}
                                  </p>
                                </div>
                                {c.acikFaturaAdedi > 0 && (
                                  <span className="shrink-0 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    {c.acikFaturaAdedi} açık
                                  </span>
                                )}
                              </div>

                              {c.bakiyeDetay && c.bakiyeDetay.length > 1 ? (
                                <div className="mt-3 space-y-1.5">
                                  <div className="grid grid-cols-3 gap-1 text-xs text-muted-foreground font-medium mb-0.5">
                                    <span>Para Birimi</span>
                                    <span className="text-right">Fatura</span>
                                    <span className="text-right">Bakiye</span>
                                  </div>
                                  {c.bakiyeDetay.map(d => {
                                    const dRenk = d.bakiye > 0.01 ? "text-orange-600" : d.bakiye < -0.01 ? "text-red-600" : "text-green-600";
                                    return (
                                      <div key={d.paraBirimi} className="grid grid-cols-3 gap-1 text-xs">
                                        <span className="font-semibold text-muted-foreground">{d.paraBirimi}</span>
                                        <span className="text-right tabular-nums">{fmt(d.toplamBorc)}</span>
                                        <span className={`text-right tabular-nums font-bold ${dRenk}`}>{fmt(Math.abs(d.bakiye))}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                                  <div>
                                    <p className="text-xs text-muted-foreground">Toplam Fatura</p>
                                    <p className="font-medium">{fmt(c.toplamBorc)}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Tahsilat</p>
                                    <p className="font-medium text-green-700">{fmt(c.toplamAlacak)}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Bakiye</p>
                                    <p className={`font-bold ${bakiyeRenk}`}>{fmt(Math.abs(c.bakiye))}</p>
                                  </div>
                                </div>
                              )}

                              {c.toplamBorc > 0 && (
                                <div className="mt-3">
                                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-green-500 transition-all"
                                      style={{ width: `${kalintiYuzde}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    %{kalintiYuzde.toFixed(0)} tahsil edildi
                                    {c.bakiyeDetay && c.bakiyeDetay.length <= 1 && <> &bull; {c.paraBirimi}</>}
                                    {c.sonIslemTarihi && (
                                      <> &bull; Son işlem: {sonIslemYaz(c.sonIslemTarihi)}</>
                                    )}
                                  </p>
                                </div>
                              )}

                              {!c.toplamBorc && c.sonIslemTarihi && (
                                <p className="text-xs text-muted-foreground mt-2">
                                  Son işlem: {sonIslemYaz(c.sonIslemTarihi)}
                                </p>
                              )}
                            </div>

                            <div className={`flex items-center gap-1 px-3 border-l ${bakiyeBg}`}>
                              {c.catiFirmaId && (
                                <button
                                  title="Ödeme Kaydet"
                                  onClick={(e) => odemeAc(c, e)}
                                  className="p-1.5 rounded-none hover:bg-black/5 transition-colors"
                                >
                                  <CreditCard className={`h-4 w-4 ${bakiyeRenk} opacity-70`} />
                                </button>
                              )}
                              <ChevronRight className={`h-5 w-5 ${bakiyeRenk}`} />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!odemeModal} onOpenChange={open => { if (!open) setOdemeModal(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ödeme Kaydet - {odemeModal?.bagliFirmaAd}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <Label>Tutar *</Label>
                <input
                  type="number"
                  value={odTutar}
                  onChange={e => setOdTutar(e.target.value)}
                  step="0.01" min="0"
                  className="flex h-9 w-full rounded-none border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="0.00"
                />
              </div>
              <div className="w-28 space-y-1.5">
                <Label>Para Birimi</Label>
                <Select value={odPb} onValueChange={setOdPb}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PARA_BIRIMLERI.map(pb => <SelectItem key={pb} value={pb}>{pb}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tarih *</Label>
              <input
                type="date"
                value={odTarih}
                onChange={e => setOdTarih(e.target.value)}
                className="flex h-9 w-full rounded-none border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ödeme Yöntemi</Label>
              <Select value={odYontem} onValueChange={setOdYontem}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(YONTEM_ETIKET).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {modalBankalar.length > 0 && (
              <div className="space-y-1.5">
                <Label>Banka Hesabı <span className="text-xs text-muted-foreground">(opsiyonel)</span></Label>
                <Select value={odBanka} onValueChange={v => { setOdBanka(v); if (v !== "none") { const b = modalBankalar.find(x => String(x.id) === v); if (b?.paraBirimi) setOdPb(b.paraBirimi); } }}>
                  <SelectTrigger><SelectValue placeholder="Belirtilmedi" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Belirtilmedi</SelectItem>
                    {modalBankalar.map(b => (
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
              <input
                value={odAciklama}
                onChange={e => setOdAciklama(e.target.value)}
                placeholder="Ödeme açıklaması"
                className="flex h-9 w-full rounded-none border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOdemeModal(null)}>İptal</Button>
            <Button onClick={odemeKaydet} disabled={!odTutar || !odTarih || createOdeme.isPending}>
              {createOdeme.isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
