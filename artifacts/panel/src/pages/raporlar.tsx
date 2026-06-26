import { useState, useEffect, useCallback } from "react";
import {
  useGetKdvOzeti, getGetKdvOzetiQueryKey,
  useGetAlacakYaslandirma, getGetAlacakYaslandirmaQueryKey,
  useListFirmalar, getListFirmalarQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, LineChart, Line, Legend,
} from "recharts";
import { Download, TrendingUp, TrendingDown, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { useSirket } from "@/contexts/sirket-context";

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

const fmtK = (n: number) =>
  n >= 1_000_000
    ? new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(n / 1_000_000) + "M"
    : n >= 1_000
    ? new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(n / 1_000) + "K"
    : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n);

const DURUM_RENK: Record<string, string> = {
  taslak: "bg-slate-500/10 text-slate-500",
  acik: "bg-orange-500/10 text-orange-600",
  kismi_odendi: "bg-yellow-500/10 text-yellow-600",
  odendi: "bg-green-500/10 text-green-600",
  iptal: "bg-gray-500/10 text-gray-500",
};

const DURUM_ETIKET: Record<string, string> = {
  acik: "Açık",
  odendi: "Ödendi",
  kismi_odendi: "Kısmi Ödendi",
  iptal: "İptal",
};

const DURUM_RENKLERI: Record<string, string> = {
  acik: "#f97316",
  odendi: "#22c55e",
  kismi_odendi: "#eab308",
  iptal: "#9ca3af",
};

const DILIM_RENKLERI = ["#22c55e", "#f59e0b", "#f97316", "#ef4444"];
const YILLAR = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));
const AYLAR = ["", "Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

function csvIndir(veriler: Record<string, unknown>[], dosyaAdi: string) {
  if (!veriler || veriler.length === 0) return;
  const satirlar = veriler.map(row =>
    Object.values(row).map(v => (typeof v === "string" && v.includes(",") ? `"${v}"` : String(v ?? ""))).join(",")
  );
  const ust = Object.keys(veriler[0]).join(",");
  const blob = new Blob([[ust, ...satirlar].join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = dosyaAdi; a.click();
  URL.revokeObjectURL(url);
}

function apiFetch(path: string) {
  const token = localStorage.getItem("panel_token");
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return fetch(`${base}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

type FaturaOzeti = {
  toplamFatura: number; toplamTahsilat: number; toplamAcik: number; faturaSayisi: number;
  durumlar: { durum: string; sayi: number; tutar: number }[];
  aylik: { ay: number; ayAd: string; sayi: number; tutar: number; odendi: number }[];
};

type BagliFirmaRow = {
  bagliFirmaId: number | null; bagliFirmaAd: string;
  toplamFatura: number; toplamTahsilat: number; acikFatura: number; faturaSayisi: number;
};

type GemiGelirRow = { gemiId: number; gemiAd: string; gemiImo: string | null; toplamFatura: number; toplamTahsilat: number; faturaSayisi: number };

export default function Raporlar() {
  const { aktifSirketId } = useSirket();
  const [catiFirmaId, setCatiFirmaId] = useState(aktifSirketId ? String(aktifSirketId) : "");
  const [yil, setYil] = useState(String(new Date().getFullYear()));
  const [ay, setAy] = useState("");

  const { data: catiFirmalar = [] } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );

  const catiFirmaIdNum = catiFirmaId && catiFirmaId !== "all" ? Number(catiFirmaId) : undefined;

  const kdvParams = {
    ...(catiFirmaIdNum && { catiFirmaId: catiFirmaIdNum }),
    ...(yil && { yil: Number(yil) }),
    ...(ay && ay !== "all" && { ay: Number(ay) }),
  };
  const yasParams = { ...(catiFirmaIdNum && { catiFirmaId: catiFirmaIdNum }) };

  const { data: kdvOzeti, isLoading: kdvYukleniyor } = useGetKdvOzeti(kdvParams, {
    query: { queryKey: [...getGetKdvOzetiQueryKey(), catiFirmaId, yil, ay] },
  });
  const { data: yaslandirma, isLoading: yasYukleniyor } = useGetAlacakYaslandirma(yasParams, {
    query: { queryKey: [...getGetAlacakYaslandirmaQueryKey(), catiFirmaId] },
  });

  const [faturaOzeti, setFaturaOzeti] = useState<FaturaOzeti | null>(null);
  const [faturaYukleniyor, setFaturaYukleniyor] = useState(false);
  const [bagliFirmalar, setBagliFirmalar] = useState<BagliFirmaRow[]>([]);
  const [bagliFirmaYukleniyor, setBagliFirmaYukleniyor] = useState(false);
  const [gemiGelir, setGemiGelir] = useState<GemiGelirRow[]>([]);
  const [gemiYukleniyor, setGemiYukleniyor] = useState(false);

  const fetchFaturaOzeti = useCallback(async () => {
    setFaturaYukleniyor(true);
    try {
      const params = new URLSearchParams();
      if (catiFirmaId && catiFirmaId !== "all") params.set("catiFirmaId", catiFirmaId);
      if (yil) params.set("yil", yil);
      const r = await apiFetch(`/api/raporlar/fatura-ozeti?${params}`);
      if (r.ok) setFaturaOzeti(await r.json());
    } finally { setFaturaYukleniyor(false); }
  }, [catiFirmaId, yil]);

  const fetchBagliFirma = useCallback(async () => {
    setBagliFirmaYukleniyor(true);
    try {
      const params = new URLSearchParams();
      if (catiFirmaId && catiFirmaId !== "all") params.set("catiFirmaId", catiFirmaId);
      if (yil) params.set("yil", yil);
      const r = await apiFetch(`/api/raporlar/bagli-firma-analiz?${params}`);
      if (r.ok) { const j = await r.json(); setBagliFirmalar(j.firmalar ?? []); }
    } finally { setBagliFirmaYukleniyor(false); }
  }, [catiFirmaId, yil]);

  const fetchGemiGelir = useCallback(async () => {
    setGemiYukleniyor(true);
    try {
      const params = new URLSearchParams();
      if (catiFirmaId && catiFirmaId !== "all") params.set("catiFirmaId", catiFirmaId);
      if (yil) params.set("yil", yil);
      const r = await apiFetch(`/api/raporlar/gemi-gelir?${params}`);
      if (r.ok) { const j = await r.json(); setGemiGelir(j.gemiler ?? []); }
    } finally { setGemiYukleniyor(false); }
  }, [catiFirmaId, yil]);

  useEffect(() => { fetchFaturaOzeti(); fetchBagliFirma(); fetchGemiGelir(); },
    [fetchFaturaOzeti, fetchBagliFirma, fetchGemiGelir]);

  const grafigVerisi = yaslandirma?.dilimler?.map(d => ({
    etiket: d.etiket, tutar: d.toplamTutar, sayi: d.faturaSayisi,
  })) ?? [];

  const Skeleton = () => (
    <div className="animate-pulse space-y-3">
      {[1,2,3].map(i => <div key={i} className="h-20 bg-muted" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Filtreler */}
      <div className="flex gap-3 flex-wrap items-end">
        <div className="space-y-1">
          <Label className="text-xs">Çatı Firma</Label>
          <Select value={catiFirmaId || "all"} onValueChange={v => setCatiFirmaId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Tüm Firmalar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Firmalar</SelectItem>
              {catiFirmalar.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.ad}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Yıl</Label>
          <Select value={yil} onValueChange={setYil}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{YILLAR.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ay (KDV için)</Label>
          <Select value={ay || "all"} onValueChange={v => setAy(v === "all" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Tüm Aylar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Aylar</SelectItem>
              {AYLAR.slice(1).map((a, i) => <SelectItem key={i+1} value={String(i+1)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="gelir">
        <TabsList className="rounded-none flex-wrap h-auto">
          <TabsTrigger value="gelir" className="rounded-none">Gelir & Tahsilat</TabsTrigger>
          <TabsTrigger value="musteri" className="rounded-none">Müşteri Analizi</TabsTrigger>
          <TabsTrigger value="gemi" className="rounded-none">Gemi Bazlı</TabsTrigger>
          <TabsTrigger value="yaslandirma" className="rounded-none">Alacak Yaşlandırma</TabsTrigger>
          <TabsTrigger value="kdv" className="rounded-none">KDV Özeti</TabsTrigger>
        </TabsList>

        {/* ── Gelir & Tahsilat ── */}
        <TabsContent value="gelir" className="mt-6">
          {faturaYukleniyor ? <Skeleton /> : faturaOzeti ? (
            <div className="space-y-6">
              {/* Özet kartlar */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted-foreground">Toplam Faturalanan</p>
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-display font-bold">{fmtK(faturaOzeti.toplamFatura)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{faturaOzeti.faturaSayisi} fatura</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted-foreground">Toplam Tahsilat</p>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </div>
                    <p className="text-2xl font-display font-bold text-green-600">{fmtK(faturaOzeti.toplamTahsilat)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {faturaOzeti.toplamFatura > 0
                        ? `%${((faturaOzeti.toplamTahsilat / faturaOzeti.toplamFatura) * 100).toFixed(0)} tahsil oranı`
                        : "—"}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted-foreground">Açık Alacak</p>
                      <AlertCircle className="h-4 w-4 text-orange-500" />
                    </div>
                    <p className="text-2xl font-display font-bold text-orange-600">{fmtK(faturaOzeti.toplamAcik)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Henüz tahsil edilmedi</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted-foreground">Ortalama Fatura</p>
                      <TrendingDown className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-display font-bold">
                      {faturaOzeti.faturaSayisi > 0
                        ? fmtK(faturaOzeti.toplamFatura / faturaOzeti.faturaSayisi)
                        : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Fatura başına</p>
                  </CardContent>
                </Card>
              </div>

              {/* Aylık grafik */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Aylık Faturalama & Tahsilat — {yil}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={faturaOzeti.aylik} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="ayAd" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtK} width={52} />
                      <Tooltip
                        formatter={(v, name) => [fmtK(Number(v)), name === "tutar" ? "Faturalanan" : "Tahsilat"]}
                        labelFormatter={l => `${l} ${yil}`}
                      />
                      <Legend formatter={v => v === "tutar" ? "Faturalanan" : "Tahsilat"} />
                      <Bar dataKey="tutar" fill="#0070d1" radius={[3, 3, 0, 0]} maxBarSize={32} />
                      <Bar dataKey="odendi" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Fatura sayısı trendi */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Aylık Fatura Adedi — {yil}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={faturaOzeti.aylik} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="ayAd" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={30} />
                      <Tooltip formatter={(v) => [v, "Fatura Sayısı"]} labelFormatter={l => `${l} ${yil}`} />
                      <Line type="monotone" dataKey="sayi" stroke="#0070d1" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Durum dağılımı */}
              {faturaOzeti.durumlar.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Fatura Durum Dağılımı</CardTitle>
                      <Button variant="outline" size="sm" onClick={() => csvIndir(
                        faturaOzeti.durumlar.map(d => ({
                          Durum: DURUM_ETIKET[d.durum] ?? d.durum,
                          "Fatura Adedi": d.sayi,
                          "Toplam Tutar": d.tutar.toFixed(2),
                        })),
                        `durum-dagilimi-${yil}.csv`
                      )}>
                        <Download className="mr-2 h-4 w-4" /> CSV
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {faturaOzeti.durumlar
                        .sort((a, b) => b.tutar - a.tutar)
                        .map(d => {
                          const oran = faturaOzeti.toplamFatura > 0 ? (d.tutar / faturaOzeti.toplamFatura) * 100 : 0;
                          return (
                            <div key={d.durum} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${DURUM_RENK[d.durum] ?? ""}`}>
                                    {DURUM_ETIKET[d.durum] ?? d.durum}
                                  </span>
                                  <span className="text-muted-foreground">{d.sayi} fatura</span>
                                </div>
                                <div className="text-right">
                                  <span className="font-semibold">{fmtK(d.tutar)}</span>
                                  <span className="text-muted-foreground ml-2 text-xs">%{oran.toFixed(0)}</span>
                                </div>
                              </div>
                              <div className="h-1.5 w-full bg-muted overflow-hidden">
                                <div
                                  className="h-full transition-all"
                                  style={{ width: `${oran}%`, backgroundColor: DURUM_RENKLERI[d.durum] ?? "#888" }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : <div className="text-center text-muted-foreground py-16">Veri bulunamadı.</div>}
        </TabsContent>

        {/* ── Müşteri Analizi ── */}
        <TabsContent value="musteri" className="mt-6">
          {bagliFirmaYukleniyor ? <Skeleton /> : bagliFirmalar.length === 0 ? (
            <div className="text-center text-muted-foreground py-16">Müşteri verisi bulunamadı.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => csvIndir(
                  bagliFirmalar.map(f => ({
                    Müşteri: f.bagliFirmaAd,
                    "Fatura Sayısı": f.faturaSayisi,
                    "Toplam Fatura": f.toplamFatura.toFixed(2),
                    "Toplam Tahsilat": f.toplamTahsilat.toFixed(2),
                    "Açık Alacak": f.acikFatura.toFixed(2),
                  })),
                  `musteri-analizi-${yil}.csv`
                )}>
                  <Download className="mr-2 h-4 w-4" /> CSV İndir
                </Button>
              </div>

              {/* Özet */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Aktif Müşteri</p>
                    <p className="text-2xl font-display font-bold mt-1">{bagliFirmalar.filter(f => f.bagliFirmaId).length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">En Büyük Müşteri</p>
                    <p className="text-base font-bold mt-1 truncate">{bagliFirmalar[0]?.bagliFirmaAd ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{fmtK(bagliFirmalar[0]?.toplamFatura ?? 0)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Toplam Açık Alacak</p>
                    <p className="text-2xl font-display font-bold mt-1 text-orange-600">
                      {fmtK(bagliFirmalar.reduce((s, f) => s + f.acikFatura, 0))}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Müşteri tablosu */}
              <Card>
                <CardHeader><CardTitle className="text-base">Müşteri Bazlı Fatura & Tahsilat — {yil}</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {bagliFirmalar.map((f, i) => {
                      const tahsilatOrani = f.toplamFatura > 0 ? (f.toplamTahsilat / f.toplamFatura) * 100 : 0;
                      return (
                        <div key={f.bagliFirmaId ?? i} className="px-6 py-4 space-y-2">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-sm font-medium text-muted-foreground w-6 shrink-0">{i + 1}.</span>
                              <div className="min-w-0">
                                <p className="font-semibold text-sm truncate">{f.bagliFirmaAd}</p>
                                <p className="text-xs text-muted-foreground">{f.faturaSayisi} fatura</p>
                              </div>
                            </div>
                            <div className="text-right shrink-0 space-y-0.5">
                              <p className="font-bold text-sm">{fmtK(f.toplamFatura)}</p>
                              <p className="text-xs text-green-600">Tahsilat: {fmtK(f.toplamTahsilat)}</p>
                              {f.acikFatura > 0 && (
                                <p className="text-xs text-orange-600">Açık: {fmtK(f.acikFatura)}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-9">
                            <div className="h-1.5 flex-1 bg-muted overflow-hidden">
                              <div className="h-full bg-green-500 transition-all" style={{ width: `${Math.min(tahsilatOrani, 100)}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground w-10 text-right">%{tahsilatOrani.toFixed(0)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Grafik */}
              <Card>
                <CardHeader><CardTitle className="text-base">En Çok Faturalanan Müşteriler (İlk 8)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      data={bagliFirmalar.slice(0, 8).map(f => ({
                        isim: f.bagliFirmaAd.length > 14 ? f.bagliFirmaAd.slice(0, 14) + "…" : f.bagliFirmaAd,
                        fatura: f.toplamFatura,
                        tahsilat: f.toplamTahsilat,
                      }))}
                      margin={{ top: 5, right: 20, left: 10, bottom: 50 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="isim" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtK} width={52} />
                      <Tooltip formatter={(v, name) => [fmtK(Number(v)), name === "fatura" ? "Fatura" : "Tahsilat"]} />
                      <Legend formatter={v => v === "fatura" ? "Fatura" : "Tahsilat"} />
                      <Bar dataKey="fatura" fill="#0070d1" radius={[3, 3, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="tahsilat" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ── Gemi Bazlı ── */}
        <TabsContent value="gemi" className="mt-6">
          {gemiYukleniyor ? <Skeleton /> : gemiGelir.length === 0 ? (
            <div className="text-center text-muted-foreground py-16">Fatura atanmış gemi bulunamadı.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => csvIndir(
                  gemiGelir.map(g => ({ Gemi: g.gemiAd, IMO: g.gemiImo ?? "", "Fatura Sayısı": g.faturaSayisi, "Toplam Fatura": g.toplamFatura, "Toplam Tahsilat": g.toplamTahsilat })),
                  `gemi-gelir-${yil}.csv`
                )}>
                  <Download className="mr-2 h-4 w-4" /> CSV İndir
                </Button>
              </div>
              <Card>
                <CardHeader><CardTitle className="text-base">Gemi Bazlı Gelir — {yil}</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {gemiGelir.map((g, i) => {
                      const tahsilatOrani = g.toplamFatura > 0 ? (g.toplamTahsilat / g.toplamFatura) * 100 : 0;
                      return (
                        <div key={g.gemiId} className="px-6 py-4 space-y-2">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium text-muted-foreground w-6">{i + 1}.</span>
                              <div>
                                <p className="font-semibold text-sm">{g.gemiAd}</p>
                                {g.gemiImo && <p className="text-xs text-muted-foreground">IMO: {g.gemiImo}</p>}
                                <p className="text-xs text-muted-foreground">{g.faturaSayisi} fatura</p>
                              </div>
                            </div>
                            <div className="text-right space-y-0.5">
                              <p className="font-bold text-sm">{fmtK(g.toplamFatura)}</p>
                              <p className="text-xs text-green-600">Tahsilat: {fmtK(g.toplamTahsilat)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-9">
                            <div className="h-1.5 flex-1 bg-muted overflow-hidden">
                              <div className="h-full bg-green-500 transition-all" style={{ width: `${Math.min(tahsilatOrani, 100)}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground w-10 text-right">%{tahsilatOrani.toFixed(0)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Gemi Gelir Grafiği (İlk 10)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      data={gemiGelir.slice(0, 10).map(g => ({
                        isim: g.gemiAd.length > 12 ? g.gemiAd.slice(0, 12) + "…" : g.gemiAd,
                        tutar: g.toplamFatura,
                      }))}
                      margin={{ top: 5, right: 20, left: 10, bottom: 50 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="isim" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtK} width={52} />
                      <Tooltip formatter={(v) => [fmtK(Number(v)), "Toplam Fatura"]} />
                      <Bar dataKey="tutar" fill="#0070d1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ── Alacak Yaşlandırma ── */}
        <TabsContent value="yaslandirma" className="mt-6">
          {yasYukleniyor ? <Skeleton /> : yaslandirma?.dilimler ? (
            <div className="space-y-6">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => {
                  const rows = yaslandirma.dilimler?.flatMap(d =>
                    (d.faturalar ?? []).map(f => ({ dilim: d.etiket, faturaNo: f.faturaNo, durum: f.durum, vade: f.vadeTarihi, tutar: f.genelToplam, pb: f.paraBirimi }))
                  ) ?? [];
                  csvIndir(rows, "alacak-yaslandirma.csv");
                }}>
                  <Download className="mr-2 h-4 w-4" /> CSV İndir
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {yaslandirma.dilimler.map((d, i) => (
                  <Card key={d.etiket}>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">{d.etiket}</p>
                      <p className="text-xl font-display font-bold mt-1" style={{ color: DILIM_RENKLERI[i] }}>{fmtK(d.toplamTutar)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{d.faturaSayisi} fatura</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card>
                <CardHeader><CardTitle className="text-base">Yaşlandırma Grafiği</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={grafigVerisi} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="etiket" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={fmtK} width={52} />
                      <Tooltip formatter={(v) => [fmt(Number(v)), "Tutar"]} />
                      <Bar dataKey="tutar" radius={[4, 4, 0, 0]}>
                        {grafigVerisi.map((_, i) => <Cell key={i} fill={DILIM_RENKLERI[i]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              {yaslandirma.dilimler.map(d => d.faturalar && d.faturalar.length > 0 && (
                <Card key={d.etiket}>
                  <CardHeader><CardTitle className="text-base">{d.etiket} — Faturalar</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {d.faturalar.slice(0, 10).map(f => (
                        <div key={f.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                          <div>
                            <p className="font-medium">{f.faturaNo}</p>
                            <p className="text-xs text-muted-foreground">Vade: {f.vadeTarihi}</p>
                          </div>
                          <div className="text-right">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${DURUM_RENK[f.durum]}`}>{DURUM_ETIKET[f.durum] ?? f.durum}</span>
                            <p className="font-semibold mt-1">{fmt(f.genelToplam, f.paraBirimi)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : <div className="text-center text-muted-foreground py-16">Veri bulunamadı.</div>}
        </TabsContent>

        {/* ── KDV Özeti ── */}
        <TabsContent value="kdv" className="mt-6">
          {kdvYukleniyor ? <Skeleton /> : kdvOzeti ? (
            <div className="space-y-6">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => csvIndir([
                  { "KDV Haric": kdvOzeti.kdvHaricToplam, "KDV Tutari": kdvOzeti.kdvTutariToplam, "KDV Dahil": kdvOzeti.kdvDahilToplam }
                ], `kdv-ozeti-${yil}${ay ? "-" + ay : ""}.csv`)}>
                  <Download className="mr-2 h-4 w-4" /> CSV İndir
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  ["KDV Hariç Toplam", kdvOzeti.kdvHaricToplam],
                  ["KDV Tutarı", kdvOzeti.kdvTutariToplam],
                  ["KDV Dahil Toplam", kdvOzeti.kdvDahilToplam],
                ].map(([etiket, deger]) => (
                  <Card key={etiket as string}>
                    <CardContent className="p-5">
                      <p className="text-sm text-muted-foreground">{etiket}</p>
                      <p className="text-2xl font-display font-bold mt-1">{fmt(deger as number)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {kdvOzeti.paraBirimiKirilim && kdvOzeti.paraBirimiKirilim.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Para Birimi Kırılımı</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {kdvOzeti.paraBirimiKirilim.map(p => (
                        <div key={p.paraBirimi} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                          <span className="font-mono font-bold">{p.paraBirimi}</span>
                          <div className="text-right space-y-0.5">
                            <p>KDV Hariç: {fmt(p.kdvHaric, p.paraBirimi)}</p>
                            <p>KDV: {fmt(p.kdvTutari, p.paraBirimi)}</p>
                            <p className="font-bold">KDV Dahil: {fmt(p.kdvDahil, p.paraBirimi)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {kdvOzeti.firmaKirilim && kdvOzeti.firmaKirilim.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Firma Kırılımı</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {kdvOzeti.firmaKirilim.map(f => (
                        <div key={f.catiFirmaId} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                          <span className="font-medium">{f.catiFirmaAd}</span>
                          <div className="text-right">
                            <p>KDV: {fmt(f.kdvTutari)}</p>
                            <p className="font-bold">Toplam: {fmt(f.kdvDahil)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : <div className="text-center text-muted-foreground py-16">Veri bulunamadı.</div>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
