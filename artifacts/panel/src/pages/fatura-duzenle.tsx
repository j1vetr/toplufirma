import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetFatura, getGetFaturaQueryKey,
  useListFirmalar, getListFirmalarQueryKey,
  useListGemiler, getListGemilerQueryKey,
  useListKdvOranlari, getListKdvOranlariQueryKey,
  getListFaturalarQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

interface Kalem {
  aciklama: string;
  birim: string;
  miktar: number;
  birimFiyat: number;
  kdvOrani: number;
}

const BIRIMLER: { tr: string; en: string }[] = [
  { tr: "Adet", en: "Pcs" },
  { tr: "Saat", en: "Hour" },
  { tr: "Gün", en: "Day" },
  { tr: "Ay", en: "Month" },
  { tr: "Yıl", en: "Year" },
  { tr: "Sefer", en: "Trip" },
  { tr: "Paket", en: "Package" },
  { tr: "Ton", en: "MT" },
  { tr: "Litre", en: "Liter" },
  { tr: "Metre", en: "Meter" },
  { tr: "Kilogram", en: "kg" },
];
const BIRIM_EN_SET = new Set(BIRIMLER.map(b => b.en));
const fmt = (n: number) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n);

const apiBase = () => {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api`;
};

export default function FaturaDuzenle() {
  const [, params] = useRoute("/faturalar/:id/duzenle");
  const id = Number(params?.id);
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: fatura, isLoading } = useGetFatura(id, {
    query: { enabled: !!id, queryKey: getGetFaturaQueryKey(id) },
  });

  const [bagliFirmaId, setBagliFirmaId] = useState("");
  const [grupFirmaId, setGrupFirmaId] = useState("");
  const [faturaAdi, setFaturaAdi] = useState("");
  const [gemiId, setGemiId] = useState("");
  const [faturaTarihi, setFaturaTarihi] = useState("");
  const [vadeTarihi, setVadeTarihi] = useState("");
  const [paraBirimi, setParaBirimi] = useState("USD");
  const [notlar, setNotlar] = useState("");
  const [kalemler, setKalemler] = useState<Kalem[]>([]);
  const [yuklendi, setYuklendi] = useState(false);
  const [kayitYapiliyor, setKayitYapiliyor] = useState(false);

  useEffect(() => {
    if (!fatura || yuklendi) return;
    setBagliFirmaId(fatura.bagliFirmaId ? String(fatura.bagliFirmaId) : "");
    setGrupFirmaId(fatura.grupFirmaId ? String(fatura.grupFirmaId) : "");
    setFaturaAdi(fatura.faturaAdi ?? "");
    setGemiId(fatura.gemiId ? String(fatura.gemiId) : "");
    setFaturaTarihi(fatura.faturaTarihi ?? "");
    setVadeTarihi(fatura.vadeTarihi ?? "");
    setParaBirimi(fatura.paraBirimi ?? "USD");
    setNotlar(fatura.notlar ?? "");
    if (fatura.kalemler?.length) {
      setKalemler(fatura.kalemler.map(k => ({
        aciklama: k.aciklama,
        birim: (k as unknown as { birim?: string }).birim ?? "Pcs",
        miktar: Number(k.miktar),
        birimFiyat: Number(k.birimFiyat),
        kdvOrani: Number(k.kdvOrani),
      })));
    }
    setYuklendi(true);
  }, [fatura, yuklendi]);

  const { data: filtrelenmisCariler = [] } = useListFirmalar(
    fatura?.catiFirmaId ? { tip: "bagli", catiFirmaId: fatura.catiFirmaId } : { tip: "bagli" },
    { query: { enabled: !!fatura?.catiFirmaId, queryKey: [...getListFirmalarQueryKey(), "bagli", String(fatura?.catiFirmaId ?? "")] } },
  );
  const { data: grupFirmalar = [] } = useListFirmalar(
    { tip: "grup" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "grup"] } },
  );
  const { data: gemiler = [] } = useListGemiler(undefined, { query: { queryKey: getListGemilerQueryKey() } });
  const { data: kdvOranlari = [] } = useListKdvOranlari(undefined, { query: { queryKey: getListKdvOranlariQueryKey() } });

  const filtrelenmisGemiler = gemiler.filter(g => !bagliFirmaId || g.firmaId === Number(bagliFirmaId));
  const filtrelenmisKdv = kdvOranlari.filter(k => !fatura?.catiFirmaId || k.catiFirmaId === fatura.catiFirmaId);

  function kalemGuncelle(idx: number, alan: keyof Kalem, deger: string | number) {
    setKalemler(prev => prev.map((k, i) => {
      if (i !== idx) return k;
      if (alan === "aciklama" || alan === "birim") return { ...k, [alan]: String(deger) };
      return { ...k, [alan]: Number(deger) };
    }));
  }

  function kalemEkle() {
    const varsayilanKdv = filtrelenmisKdv.find(k => k.varsayilan)?.oran ?? 0;
    setKalemler(prev => [...prev, { aciklama: "", birim: "Pcs", miktar: 1, birimFiyat: 0, kdvOrani: Number(varsayilanKdv) }]);
  }

  function kalemSil(idx: number) {
    setKalemler(prev => prev.filter((_, i) => i !== idx));
  }

  const toplamlar = kalemler.reduce((acc, k) => {
    const ara = k.miktar * k.birimFiyat;
    const kdv = ara * (k.kdvOrani / 100);
    return { toplamTutar: acc.toplamTutar + ara, kdvTutari: acc.kdvTutari + kdv };
  }, { toplamTutar: 0, kdvTutari: 0 });

  async function kaydet() {
    if (!faturaTarihi || !vadeTarihi || kalemler.some(k => !k.aciklama)) {
      toast({ title: "Hata", description: "Zorunlu alanları doldurun", variant: "destructive" });
      return;
    }
    setKayitYapiliyor(true);
    try {
      const token = localStorage.getItem("panel_token");
      const resp = await fetch(`${apiBase()}/faturalar/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          bagliFirmaId: bagliFirmaId ? Number(bagliFirmaId) : undefined,
          grupFirmaId: grupFirmaId && grupFirmaId !== "none" ? Number(grupFirmaId) : null,
          gemiId: gemiId && gemiId !== "none" ? Number(gemiId) : null,
          faturaAdi: faturaAdi || null,
          faturaTarihi,
          vadeTarihi,
          paraBirimi,
          notlar: notlar || null,
          kalemler: kalemler.map(k => ({
            aciklama: k.aciklama,
            birim: k.birim || "Pcs",
            miktar: k.miktar,
            birimFiyat: k.birimFiyat,
            kdvOrani: k.kdvOrani,
          })),
        }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error ?? "Güncelleme başarısız");
      }
      qc.invalidateQueries({ queryKey: getGetFaturaQueryKey(id) });
      qc.invalidateQueries({ queryKey: getListFaturalarQueryKey() });
      toast({ title: "Fatura güncellendi" });
      setLocation(`/faturalar/${id}`);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Hata", variant: "destructive" });
    } finally {
      setKayitYapiliyor(false);
    }
  }

  if (isLoading) return <div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded-none" /><div className="h-64 bg-muted rounded-none" /></div>;
  if (!fatura) return <div className="text-center py-16 text-muted-foreground">Fatura bulunamadı.</div>;
  if (["odendi", "iptal"].includes(fatura.durum)) return (
    <div className="text-center py-16 text-muted-foreground">Ödenmiş veya iptal edilmiş fatura düzenlenemez.</div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href={`/faturalar/${id}`}><Button variant="ghost" size="icon" className="rounded-sm"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h2 className="text-xl font-display font-semibold">Fatura Düzenle — {fatura.faturaNo}</h2>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Fatura Bilgileri</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Kendi Firmamız</Label>
            <div className="h-9 border px-3 flex items-center text-sm bg-muted/30 text-muted-foreground">{fatura.catiFirmaAd}</div>
          </div>
          <div className="space-y-1.5">
            <Label>Müşteri (Bağlı Firma) *</Label>
            <Select value={bagliFirmaId} onValueChange={v => { setBagliFirmaId(v); setGemiId(""); }}>
              <SelectTrigger><SelectValue placeholder="Müşteri seçin" /></SelectTrigger>
              <SelectContent>{filtrelenmisCariler.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.ad}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Fatura Adı</Label>
            <Input value={faturaAdi} onChange={e => setFaturaAdi(e.target.value)} placeholder="Örn: Şubat Yakıt İkmali" />
          </div>
          <div className="space-y-1.5">
            <Label>Fatura Tarihi *</Label>
            <Input type="date" value={faturaTarihi} onChange={e => setFaturaTarihi(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Çatı / Grup Firma</Label>
            <Select value={grupFirmaId || "none"} onValueChange={v => setGrupFirmaId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Çatı firma (opsiyonel)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Seçilmedi</SelectItem>
                {grupFirmalar.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.ad}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Gemi</Label>
            <Select value={gemiId || "none"} onValueChange={v => setGemiId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Gemi (opsiyonel)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Seçilmedi</SelectItem>
                {filtrelenmisGemiler.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.ad}{g.imoNumarasi ? ` (${g.imoNumarasi})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Vade Tarihi *</Label>
            <Input type="date" value={vadeTarihi} onChange={e => setVadeTarihi(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Para Birimi</Label>
            <Select value={paraBirimi} onValueChange={setParaBirimi}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["USD","EUR","TRY","GBP"].map(pb => <SelectItem key={pb} value={pb}>{pb}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Notlar</Label>
            <Input value={notlar} onChange={e => setNotlar(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Kalemler</CardTitle>
          <Button variant="outline" size="sm" onClick={kalemEkle}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Kalem Ekle
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-1 font-medium">
            <span className="col-span-3">Açıklama</span>
            <span className="col-span-2">Birim</span>
            <span className="col-span-1">Miktar</span>
            <span className="col-span-2">B.Fiyat</span>
            <span className="col-span-2">KDV %</span>
            <span className="col-span-1 text-right">Toplam</span>
            <span className="col-span-1" />
          </div>
          {kalemler.map((k, i) => {
            const ara = k.miktar * k.birimFiyat;
            const kdv = ara * (k.kdvOrani / 100);
            const isOzel = !BIRIM_EN_SET.has(k.birim);
            return (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <Input className="col-span-3 text-sm h-9" value={k.aciklama} onChange={e => kalemGuncelle(i, "aciklama", e.target.value)} placeholder="Açıklama" />
                {isOzel ? (
                  <Input
                    className="col-span-2 text-sm h-9"
                    value={k.birim}
                    onChange={e => kalemGuncelle(i, "birim", e.target.value)}
                    placeholder="Birim"
                    onBlur={e => { if (!e.target.value) kalemGuncelle(i, "birim", "Pcs"); }}
                  />
                ) : (
                  <Select value={k.birim} onValueChange={v => kalemGuncelle(i, "birim", v === "_ozel" ? "" : v)}>
                    <SelectTrigger className="col-span-2 h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BIRIMLER.map(b => <SelectItem key={b.en} value={b.en}>{b.tr}</SelectItem>)}
                      <SelectItem value="_ozel">Özel...</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <Input className="col-span-1 text-sm h-9" type="number" value={k.miktar} onChange={e => kalemGuncelle(i, "miktar", e.target.value)} min="0.01" step="0.01" />
                <Input className="col-span-2 text-sm h-9" type="number" value={k.birimFiyat} onChange={e => kalemGuncelle(i, "birimFiyat", e.target.value)} min="0" step="0.01" />
                <Select value={String(k.kdvOrani)} onValueChange={v => kalemGuncelle(i, "kdvOrani", Number(v))}>
                  <SelectTrigger className="col-span-2 h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">%0</SelectItem>
                    {filtrelenmisKdv.map(kk => <SelectItem key={kk.id} value={String(kk.oran)}>%{kk.oran}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="col-span-1 text-right text-sm font-medium">{fmt(ara + kdv)}</span>
                <Button size="icon" variant="ghost" className="col-span-1 h-8 w-8 text-destructive" onClick={() => kalemSil(i)} disabled={kalemler.length === 1}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
          <div className="border-t pt-3 mt-3 text-right space-y-1 text-sm">
            <div className="flex justify-end gap-8">
              <span className="text-muted-foreground">Ara Toplam</span>
              <span className="font-medium w-28 text-right">{fmt(toplamlar.toplamTutar)} {paraBirimi}</span>
            </div>
            {toplamlar.kdvTutari > 0 && (
              <div className="flex justify-end gap-8">
                <span className="text-muted-foreground">KDV</span>
                <span className="font-medium w-28 text-right">{fmt(toplamlar.kdvTutari)} {paraBirimi}</span>
              </div>
            )}
            <div className="flex justify-end gap-8 text-base">
              <span className="font-semibold">Genel Toplam</span>
              <span className="font-bold w-28 text-right">{fmt(toplamlar.toplamTutar + toplamlar.kdvTutari)} {paraBirimi}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href={`/faturalar/${id}`}><Button variant="outline">İptal</Button></Link>
        <Button onClick={kaydet} disabled={kayitYapiliyor}>
          {kayitYapiliyor ? "Kaydediliyor..." : "Kaydet"}
        </Button>
      </div>
    </div>
  );
}
