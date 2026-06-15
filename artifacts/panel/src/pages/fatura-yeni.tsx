import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListFirmalar, getListFirmalarQueryKey,
  useListGemiler, getListGemilerQueryKey,
  useListFaturaSerileri, getListFaturaSerileriQueryKey,
  useListKdvOranlari, getListKdvOranlariQueryKey,
  useCreateFatura, getListFaturalarQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

interface Kalem {
  aciklama: string;
  miktar: number;
  birimFiyat: number;
  kdvOrani: number;
}

const fmt = (n: number) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n);

export default function FaturaYeni() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [catiFirmaId, setCatiFirmaId] = useState("");
  const [bagliFirmaId, setBagliFirmaId] = useState("");
  const [grupFirmaId, setGrupFirmaId] = useState("");
  const [faturaAdi, setFaturaAdi] = useState("");
  const [gemiId, setGemiId] = useState("");
  const [serisiId, setSerisiId] = useState("");
  const [faturaTarihi, setFaturaTarihi] = useState(new Date().toISOString().split("T")[0]);
  const [vadeTarihi, setVadeTarihi] = useState("");
  const [paraBirimi, setParaBirimi] = useState("USD");
  const [notlar, setNotlar] = useState("");
  const [tekrarlat, setTekrarlat] = useState(false);
  const [kalemler, setKalemler] = useState<Kalem[]>([
    { aciklama: "", miktar: 1, birimFiyat: 0, kdvOrani: 0 },
  ]);

  const { data: catiFirmalar = [] } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );
  const { data: bagliFirmalar = [] } = useListFirmalar(
    { tip: "bagli" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "bagli"] } },
  );
  const { data: grupFirmalar = [] } = useListFirmalar(
    { tip: "grup" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "grup"] } },
  );
  const { data: gemiler = [] } = useListGemiler(undefined, { query: { queryKey: getListGemilerQueryKey() } });
  const { data: seriler = [] } = useListFaturaSerileri(undefined, { query: { queryKey: getListFaturaSerileriQueryKey() } });
  const { data: kdvOranlari = [] } = useListKdvOranlari(undefined, { query: { queryKey: getListKdvOranlariQueryKey() } });
  const createFatura = useCreateFatura();

  const filtrelenmisCariler = bagliFirmalar.filter(f => !catiFirmaId || f.ustFirmaId === Number(catiFirmaId));
  const filtrelenmisGemiler = gemiler.filter(g => !bagliFirmaId || g.firmaId === Number(bagliFirmaId));
  const filtrelenmisSeriler = seriler.filter(s => !catiFirmaId || s.catiFirmaId === Number(catiFirmaId));
  const filtrelenmisKdv = kdvOranlari.filter(k => !catiFirmaId || k.catiFirmaId === Number(catiFirmaId));

  function kalemGuncelle(idx: number, alan: keyof Kalem, deger: string | number) {
    setKalemler(prev => prev.map((k, i) => i === idx ? { ...k, [alan]: typeof deger === "string" && alan !== "aciklama" ? Number(deger) : deger } : k));
  }

  function kalemEkle() {
    const varsayilanKdv = filtrelenmisKdv.find(k => k.varsayilan)?.oran ?? 0;
    setKalemler(prev => [...prev, { aciklama: "", miktar: 1, birimFiyat: 0, kdvOrani: Number(varsayilanKdv) }]);
  }

  function kalemSil(idx: number) {
    setKalemler(prev => prev.filter((_, i) => i !== idx));
  }

  const toplamlar = kalemler.reduce((acc, k) => {
    const ara = k.miktar * k.birimFiyat;
    const kdv = ara * (k.kdvOrani / 100);
    return { toplamTutar: acc.toplamTutar + ara, kdvTutari: acc.kdvTutari + kdv };
  }, { toplamTutar: 0, kdvTutari: 0 });

  function kaydet() {
    if (!catiFirmaId || !bagliFirmaId || !faturaTarihi || !vadeTarihi || kalemler.some(k => !k.aciklama)) {
      toast({ title: "Hata", description: "Zorunlu alanları doldurun", variant: "destructive" });
      return;
    }
    createFatura.mutate({
      data: {
        catiFirmaId: Number(catiFirmaId), bagliFirmaId: Number(bagliFirmaId),
        ...(grupFirmaId && grupFirmaId !== "none" ? { grupFirmaId: Number(grupFirmaId) } : {}),
        ...(faturaAdi ? { faturaAdi } : {}),
        gemiId: gemiId && gemiId !== "none" ? Number(gemiId) : undefined,
        faturaSerisiId: serisiId && serisiId !== "none" ? Number(serisiId) : undefined,
        faturaTarihi, vadeTarihi, paraBirimi, notlar, tekrarlat,
        kalemler: kalemler.map(k => ({ aciklama: k.aciklama, miktar: k.miktar, birimFiyat: k.birimFiyat, kdvOrani: k.kdvOrani })),
      },
    }, {
      onSuccess: (fatura) => {
        qc.invalidateQueries({ queryKey: getListFaturalarQueryKey() });
        toast({ title: "Fatura oluşturuldu" });
        setLocation(`/faturalar/${fatura.id}`);
      },
      onError: () => toast({ title: "Hata", description: "Fatura oluşturulamadı", variant: "destructive" }),
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/faturalar"><Button variant="ghost" size="icon" className="rounded-full"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h2 className="text-xl font-display font-semibold">Yeni Fatura</h2>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Fatura Bilgileri</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Kendi Firmamız *</Label>
            <Select value={catiFirmaId} onValueChange={v => { setCatiFirmaId(v); setBagliFirmaId(""); setGrupFirmaId(""); setGemiId(""); setSerisiId(""); }}>
              <SelectTrigger data-testid="select-fatura-sirket"><SelectValue placeholder="Kendi firmamızı seçin" /></SelectTrigger>
              <SelectContent>{catiFirmalar.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.ad}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Müşteri (Bağlı Firma) *</Label>
            <Select value={bagliFirmaId} onValueChange={v => {
              setBagliFirmaId(v); setGemiId("");
              const musteri = bagliFirmalar.find(f => f.id === Number(v));
              const gid = (musteri as unknown as Record<string, unknown>)?.grupFirmaId;
              setGrupFirmaId(gid != null ? String(gid) : "");
            }}>
              <SelectTrigger data-testid="select-fatura-cari"><SelectValue placeholder="Müşteri seçin" /></SelectTrigger>
              <SelectContent>{filtrelenmisCariler.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.ad}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Fatura Adı</Label>
            <Input value={faturaAdi} onChange={e => setFaturaAdi(e.target.value)} placeholder="Örn: Şubat Yakıt İkmali" data-testid="input-fatura-adi" />
          </div>
          <div className="space-y-1.5">
            <Label>Fatura Tarihi *</Label>
            <Input type="date" value={faturaTarihi} onChange={e => setFaturaTarihi(e.target.value)} data-testid="input-fatura-tarihi" />
          </div>
          <div className="space-y-1.5">
            <Label>Çatı / Grup Firma</Label>
            <Select value={grupFirmaId || "none"} onValueChange={v => setGrupFirmaId(v === "none" ? "" : v)}>
              <SelectTrigger data-testid="select-fatura-grup"><SelectValue placeholder="Çatı firma seçin (opsiyonel)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Seçilmedi</SelectItem>
                {grupFirmalar.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.ad}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Gemi</Label>
            <Select value={gemiId} onValueChange={setGemiId}>
              <SelectTrigger data-testid="select-fatura-gemi"><SelectValue placeholder="Gemi seçin (opsiyonel)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Seçilmedi</SelectItem>
                {filtrelenmisGemiler.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.ad}{g.imoNumarasi ? ` (${g.imoNumarasi})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Vade Tarihi *</Label>
            <Input type="date" value={vadeTarihi} onChange={e => setVadeTarihi(e.target.value)} data-testid="input-fatura-vade" />
          </div>
          <div className="space-y-1.5">
            <Label>Fatura Serisi</Label>
            <Select value={serisiId} onValueChange={setSerisiId}>
              <SelectTrigger data-testid="select-fatura-seri"><SelectValue placeholder="Seri seçin (opsiyonel)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Seçilmedi</SelectItem>
                {filtrelenmisSeriler.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.ad} ({s.onek})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Para Birimi</Label>
            <Select value={paraBirimi} onValueChange={setParaBirimi}>
              <SelectTrigger data-testid="select-fatura-pb"><SelectValue /></SelectTrigger>
              <SelectContent>{["USD","EUR","TRY","GBP"].map(pb => <SelectItem key={pb} value={pb}>{pb}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notlar</Label>
            <Input value={notlar} onChange={e => setNotlar(e.target.value)} data-testid="input-fatura-notlar" />
          </div>
          <div className="flex items-start gap-2.5 rounded-lg border p-3 bg-muted/30">
            <Checkbox id="tekrarlat" checked={tekrarlat} onCheckedChange={v => setTekrarlat(v === true)} data-testid="checkbox-tekrarlat" />
            <div className="space-y-0.5">
              <Label htmlFor="tekrarlat" className="cursor-pointer">Bu faturayı aylık tekrarlat</Label>
              <p className="text-xs text-muted-foreground">Bu faturadaki tüm kalemleri kopyalayan aylık tekrarlayan tanım oluşturulur. Otomatik üretilen faturalar taslak olarak kaydedilir.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Kalemler</CardTitle>
          <Button variant="outline" size="sm" onClick={kalemEkle} className="rounded-full" data-testid="button-kalem-ekle">
            <Plus className="mr-1 h-3.5 w-3.5" /> Kalem Ekle
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-1 font-medium">
            <span className="col-span-4">Açıklama</span>
            <span className="col-span-2">Miktar</span>
            <span className="col-span-2">Birim Fiyat</span>
            <span className="col-span-2">KDV %</span>
            <span className="col-span-1 text-right">Toplam</span>
            <span className="col-span-1" />
          </div>
          {kalemler.map((k, i) => {
            const ara = k.miktar * k.birimFiyat;
            const kdv = ara * (k.kdvOrani / 100);
            return (
              <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`kalem-${i}`}>
                <Input className="col-span-4 text-sm h-9" value={k.aciklama} onChange={e => kalemGuncelle(i, "aciklama", e.target.value)} placeholder="Açıklama" data-testid={`input-kalem-aciklama-${i}`} />
                <Input className="col-span-2 text-sm h-9" type="number" value={k.miktar} onChange={e => kalemGuncelle(i, "miktar", e.target.value)} min="0.01" step="0.01" data-testid={`input-kalem-miktar-${i}`} />
                <Input className="col-span-2 text-sm h-9" type="number" value={k.birimFiyat} onChange={e => kalemGuncelle(i, "birimFiyat", e.target.value)} min="0" step="0.01" data-testid={`input-kalem-fiyat-${i}`} />
                <Select value={String(k.kdvOrani)} onValueChange={v => kalemGuncelle(i, "kdvOrani", Number(v))}>
                  <SelectTrigger className="col-span-2 h-9 text-sm" data-testid={`select-kalem-kdv-${i}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">%0</SelectItem>
                    {filtrelenmisKdv.map(kk => <SelectItem key={kk.id} value={String(kk.oran)}>%{kk.oran}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="col-span-1 text-right text-sm font-medium">{fmt(ara + kdv)}</span>
                <Button size="icon" variant="ghost" className="col-span-1 h-8 w-8 text-destructive" onClick={() => kalemSil(i)} disabled={kalemler.length === 1} data-testid={`button-kalem-sil-${i}`}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            );
          })}
          <div className="border-t pt-3 mt-3 text-right space-y-1 text-sm">
            <div className="flex justify-end gap-8">
              <span className="text-muted-foreground">Ara Toplam</span>
              <span className="font-medium w-28 text-right">{fmt(toplamlar.toplamTutar)} {paraBirimi}</span>
            </div>
            <div className="flex justify-end gap-8">
              <span className="text-muted-foreground">KDV</span>
              <span className="font-medium w-28 text-right">{fmt(toplamlar.kdvTutari)} {paraBirimi}</span>
            </div>
            <div className="flex justify-end gap-8 text-base">
              <span className="font-semibold">Genel Toplam</span>
              <span className="font-bold w-28 text-right">{fmt(toplamlar.toplamTutar + toplamlar.kdvTutari)} {paraBirimi}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href="/faturalar"><Button variant="outline" className="rounded-full">İptal</Button></Link>
        <Button onClick={kaydet} disabled={createFatura.isPending} className="rounded-full" data-testid="button-fatura-kaydet">
          {createFatura.isPending ? "Kaydediliyor..." : "Fatura Oluştur"}
        </Button>
      </div>
    </div>
  );
}
