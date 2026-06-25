import { useState, useCallback } from "react";
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
import { Plus, Pencil, Trash2, FileDown, CheckCircle2, SendHorizonal, XCircle, FileText } from "lucide-react";
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

interface Firma {
  id: number;
  ad: string;
  tip: string;
  paraBirimi: string;
}

interface Gemi {
  id: number;
  firmaId: number;
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

  const [durumFiltre, setDurumFiltre] = useState<string>("tumu");
  const [modalAcik, setModalAcik] = useState(false);
  const [duzenleId, setDuzenleId] = useState<number | null>(null);
  const [silOnay, setSilOnay] = useState<number | null>(null);
  const [durumDegistirTeklif, setDurumDegistirTeklif] = useState<Teklif | null>(null);

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

  const { data: gemiler = [] } = useQuery<Gemi[]>({
    queryKey: ["gemiler"],
    queryFn: () => apiFetch("/gemiler"),
  });

  const filtrelenmis = durumFiltre === "tumu" ? teklifListesi : teklifListesi.filter(t => t.durum === durumFiltre);

  const aktifFirma = firmalar.find(f => f.id === Number(form.catiFirmaId));
  const firmaGemileri = gemiler.filter(g => g.firmaId === Number(form.catiFirmaId));

  function formAc(teklif?: Teklif) {
    if (teklif) {
      setDuzenleId(teklif.id);
      apiFetch(`/teklifler/${teklif.id}`).then((d: Teklif & { kalemler: TeklifKalem[] }) => {
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
        setModalAcik(true);
      });
    } else {
      setDuzenleId(null);
      setForm({
        catiFirmaId: aktifSirketId ?? (firmalar[0]?.id ?? ""),
        gemiId: "",
        tarih: new Date().toISOString().split("T")[0],
        gecerlilikTarihi: "",
        aliciAd: "",
        aliciAdres: "",
        aliciTelefon: "",
        paraBirimi: aktifFirma?.paraBirimi ?? "USD",
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

  function pdfIndir(teklif: Teklif) {
    const token = localStorage.getItem("panel_token") ?? "";
    const url = `${API_BASE}/api/teklifler/${teklif.id}/pdf`;
    const a = document.createElement("a");
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        a.href = URL.createObjectURL(blob);
        a.download = `teklif-${teklif.teklifNo}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => toast({ title: "PDF oluşturulamadı", variant: "destructive" }));
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

      <div className="flex gap-2 flex-wrap">
        {DURUMLAR.map(d => (
          <Button
            key={d.key}
            variant={durumFiltre === d.key ? "default" : "outline"}
            size="sm"
            onClick={() => setDurumFiltre(d.key)}
          >
            {d.label}
          </Button>
        ))}
      </div>

      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Teklif No</TableHead>
              <TableHead>Firma</TableHead>
              <TableHead>Alıcı</TableHead>
              <TableHead>Tarih</TableHead>
              <TableHead>Geçerlilik</TableHead>
              <TableHead>Para Birimi</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Yükleniyor…</TableCell></TableRow>
            ) : filtrelenmis.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>Teklif bulunamadı</p>
              </TableCell></TableRow>
            ) : filtrelenmis.map(t => (
              <TableRow key={t.id} className="hover:bg-muted/30">
                <TableCell className="font-mono text-sm font-medium text-primary">{t.teklifNo}</TableCell>
                <TableCell>
                  <div>{t.catiFirmaAd ?? "—"}</div>
                  {t.gemiAd && <div className="text-xs text-muted-foreground">{t.gemiAd}</div>}
                </TableCell>
                <TableCell>{t.aliciAd}</TableCell>
                <TableCell className="text-sm">{t.tarih}</TableCell>
                <TableCell className="text-sm">{t.gecerlilikTarihi ?? "—"}</TableCell>
                <TableCell>{t.paraBirimi}</TableCell>
                <TableCell>
                  <Badge variant={DURUM_RENK[t.durum] as "default" | "secondary" | "outline" | "destructive"}>
                    {DURUM_ETIKET[t.durum]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" title="PDF İndir" onClick={() => pdfIndir(t)}>
                      <FileDown className="h-4 w-4" />
                    </Button>
                    {canWrite && (
                      <>
                        <Button variant="ghost" size="icon" title="Durum Değiştir" onClick={() => setDurumDegistirTeklif(t)}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Düzenle" onClick={() => formAc(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Sil" className="text-destructive hover:text-destructive" onClick={() => setSilOnay(t.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
            <div className="space-y-1.5">
              <Label>Kur Notu</Label>
              <Input value={form.kurNotu} onChange={e => setForm(f => ({ ...f, kurNotu: e.target.value }))} placeholder="Örn: 1 USD = 32.50 TRY (teklif tarihinde)" />
            </div>

            {/* ── Zorunlu Kalemler ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Kalemler</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => kalemEkle(false)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Kalem Ekle
                </Button>
              </div>
              <div className="rounded-lg border overflow-hidden">
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
                  <div className="rounded-lg border border-dashed overflow-hidden">
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

      {/* ── Delete Confirm ── */}
      <AlertDialog open={silOnay !== null} onOpenChange={o => !o && setSilOnay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Teklifi sil</AlertDialogTitle>
            <AlertDialogDescription>Bu teklif kalıcı olarak silinecek. Emin misiniz?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => silOnay !== null && silMutasyon.mutate(silOnay)}>
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
