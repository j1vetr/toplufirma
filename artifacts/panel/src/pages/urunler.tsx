import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSirket } from "@/contexts/sirket-context";
import { useYetki } from "@/hooks/use-yetki";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Package } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getToken() {
  return localStorage.getItem("panel_token") ?? "";
}

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API_BASE}/api${path}`, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers ?? {}) },
    ...opts,
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error((e as Record<string, unknown>).error as string ?? "İstek başarısız");
  }
  if (r.status === 204 || r.headers.get("content-length") === "0") return null;
  return r.json();
}

interface Urun {
  id: number;
  catiFirmaId: number;
  ad: string;
  birim: string;
  birimFiyat: number | null;
  kdvOrani: number | null;
  paraBirimi: string;
  aktif: boolean;
}

interface UrunForm {
  ad: string;
  birim: string;
  birimFiyatStr: string;
  kdvOraniStr: string;
  paraBirimi: string;
  aktif: boolean;
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

const PARA_BIRIMLERI = ["USD", "EUR", "GBP", "TRY", "NOK", "SEK", "DKK"];

const BOSH_FORM: UrunForm = {
  ad: "", birim: "Pcs", birimFiyatStr: "", kdvOraniStr: "", paraBirimi: "USD", aktif: true,
};

function fmtPara(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Urunler() {
  const { aktifSirketId } = useSirket();
  const { rol } = useYetki();
  const isAdmin = rol === "yonetici";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [modalAcik, setModalAcik] = useState(false);
  const [duzenlenen, setDuzenlenen] = useState<Urun | null>(null);
  const [form, setForm] = useState<UrunForm>(BOSH_FORM);
  const [silinecek, setSilinecek] = useState<Urun | null>(null);
  const [ozelBirim, setOzelBirim] = useState(false);

  const QK = ["kalem-sablonlari", aktifSirketId, "all"];

  const { data: urunler = [], isLoading } = useQuery<Urun[]>({
    queryKey: QK,
    queryFn: () => apiFetch(`/kalem-sablonlari?catiFirmaId=${aktifSirketId}&includeInactive=true`),
    enabled: aktifSirketId != null,
  });

  const createMutation = useMutation({
    mutationFn: (body: object) => apiFetch("/kalem-sablonlari", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kalem-sablonlari"] });
      kapatModal();
      toast({ title: "Ürün oluşturuldu" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      apiFetch(`/kalem-sablonlari/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kalem-sablonlari"] });
      kapatModal();
      toast({ title: "Ürün güncellendi" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/kalem-sablonlari/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kalem-sablonlari"] });
      setSilinecek(null);
      toast({ title: "Ürün silindi" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  function acModal(urun?: Urun) {
    if (urun) {
      setDuzenlenen(urun);
      const isOzel = !BIRIM_EN_SET.has(urun.birim);
      setOzelBirim(isOzel);
      setForm({
        ad: urun.ad,
        birim: urun.birim,
        birimFiyatStr: urun.birimFiyat != null ? String(urun.birimFiyat) : "",
        kdvOraniStr: urun.kdvOrani != null ? String(urun.kdvOrani) : "",
        paraBirimi: urun.paraBirimi ?? "USD",
        aktif: urun.aktif,
      });
    } else {
      setDuzenlenen(null);
      setOzelBirim(false);
      setForm(BOSH_FORM);
    }
    setModalAcik(true);
  }

  function kapatModal() {
    setModalAcik(false);
    setDuzenlenen(null);
    setForm(BOSH_FORM);
    setOzelBirim(false);
  }

  function kaydet() {
    if (!form.ad.trim()) {
      toast({ title: "Hata", description: "Ürün adı zorunludur", variant: "destructive" });
      return;
    }
    const birimFiyat = form.birimFiyatStr.trim() !== "" ? Number(form.birimFiyatStr) : null;
    const kdvOrani = form.kdvOraniStr.trim() !== "" ? Number(form.kdvOraniStr) : null;
    const body = {
      catiFirmaId: aktifSirketId,
      ad: form.ad.trim(),
      birim: form.birim || "Pcs",
      birimFiyat,
      kdvOrani,
      paraBirimi: form.paraBirimi,
      aktif: form.aktif,
    };
    if (duzenlenen) {
      updateMutation.mutate({ id: duzenlenen.id, body });
    } else {
      createMutation.mutate(body);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ürünler</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Fatura kalemlerinde kullanılabilecek ürün ve hizmet şablonları
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => acModal()} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" /> Yeni Ürün
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Ürün / Hizmet Kataloğu
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : urunler.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <Package className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Henüz ürün tanımlı değil</p>
              {isAdmin && (
                <p className="text-xs text-muted-foreground mt-1">
                  "Yeni Ürün" butonuyla fatura kalemlerinde kullanılabilecek şablonlar ekleyin.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ad</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Birim</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Birim Fiyat</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">KDV %</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Para Birimi</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Durum</th>
                    {isAdmin && <th className="px-4 py-3 w-20" />}
                  </tr>
                </thead>
                <tbody>
                  {urunler.map(u => {
                    const birimTr = BIRIMLER.find(b => b.en === u.birim)?.tr;
                    return (
                      <tr key={u.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium">{u.ad}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {birimTr ? (
                            <span>{birimTr} <span className="text-xs opacity-60">({u.birim})</span></span>
                          ) : (
                            u.birim
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {u.birimFiyat != null
                            ? fmtPara(u.birimFiyat)
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {u.kdvOrani != null
                            ? <Badge variant="outline" className="font-normal">%{u.kdvOrani}</Badge>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs font-mono text-muted-foreground">{u.paraBirimi}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {u.aktif
                            ? <Badge className="bg-green-500/10 text-green-700 border-green-200 font-normal">Aktif</Badge>
                            : <Badge variant="outline" className="text-muted-foreground font-normal">Pasif</Badge>}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <span className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => acModal(u)}
                                className="p-1 text-muted-foreground hover:text-primary transition-colors"
                                title="Düzenle"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setSilinecek(u)}
                                className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                                title="Sil"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ekle / Düzenle Modal */}
      <Dialog open={modalAcik} onOpenChange={o => { if (!o) kapatModal(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{duzenlenen ? "Ürünü Düzenle" : "Yeni Ürün"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Ad <span className="text-destructive">*</span></Label>
              <Input
                value={form.ad}
                onChange={e => setForm(f => ({ ...f, ad: e.target.value }))}
                placeholder="Ürün veya hizmet adı"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Birim</Label>
              {ozelBirim ? (
                <div className="flex gap-2">
                  <Input
                    value={form.birim}
                    onChange={e => setForm(f => ({ ...f, birim: e.target.value }))}
                    placeholder="Özel birim"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { setOzelBirim(false); setForm(f => ({ ...f, birim: "Pcs" })); }}
                  >
                    Listeden seç
                  </Button>
                </div>
              ) : (
                <Select
                  value={form.birim}
                  onValueChange={v => {
                    if (v === "_ozel") { setOzelBirim(true); setForm(f => ({ ...f, birim: "" })); }
                    else setForm(f => ({ ...f, birim: v }));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BIRIMLER.map(b => <SelectItem key={b.en} value={b.en}>{b.tr}</SelectItem>)}
                    <SelectItem value="_ozel">Özel...</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Birim Fiyat</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.birimFiyatStr}
                  onChange={e => setForm(f => ({ ...f, birimFiyatStr: e.target.value }))}
                  placeholder="Opsiyonel"
                />
              </div>
              <div className="space-y-1.5">
                <Label>KDV Oranı (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={form.kdvOraniStr}
                  onChange={e => setForm(f => ({ ...f, kdvOraniStr: e.target.value }))}
                  placeholder="Opsiyonel"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Para Birimi</Label>
              <Select value={form.paraBirimi} onValueChange={v => setForm(f => ({ ...f, paraBirimi: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PARA_BIRIMLERI.map(pb => <SelectItem key={pb} value={pb}>{pb}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {duzenlenen && (
              <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Aktif</p>
                  <p className="text-xs text-muted-foreground">Pasif ürünler fatura formunda görünmez</p>
                </div>
                <Switch
                  checked={form.aktif}
                  onCheckedChange={v => setForm(f => ({ ...f, aktif: v }))}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={kapatModal}>İptal</Button>
            <Button onClick={kaydet} disabled={isPending}>
              {isPending ? "Kaydediliyor..." : duzenlenen ? "Kaydet" : "Oluştur"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sil Onayı */}
      <AlertDialog open={silinecek != null} onOpenChange={o => { if (!o) setSilinecek(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ürünü sil</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{silinecek?.ad}</strong> ürünü kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => silinecek && deleteMutation.mutate(silinecek.id)}
              disabled={deleteMutation.isPending}
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
