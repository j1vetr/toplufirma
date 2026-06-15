import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCariler, getListCarilerQueryKey,
  useListSirketler, getListSirketlerQueryKey,
  useCreateCari, useUpdateCari, useDeleteCari,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Users, Search, ChevronRight } from "lucide-react";

const TIP_ETIKETLERI: Record<string, string> = {
  musteri: "Müsteri", tedarikci: "Tedarikci", ana_firma: "Ana Firma",
  bagli_firma: "Bagli Firma", gemi_sahibi: "Gemi Sahibi", diger: "Diger",
};

const TIP_RENKLERI: Record<string, string> = {
  musteri: "bg-blue-500/10 text-blue-600",
  tedarikci: "bg-green-500/10 text-green-600",
  ana_firma: "bg-purple-500/10 text-purple-600",
  bagli_firma: "bg-indigo-500/10 text-indigo-600",
  gemi_sahibi: "bg-amber-500/10 text-amber-600",
  diger: "bg-gray-500/10 text-gray-600",
};

interface CariForm {
  sirketId: string;
  ad: string;
  tip: string;
  vergiNo: string;
  vergiDairesi: string;
  telefon: string;
  eposta: string;
  adres: string;
  yetkiliKisi: string;
  paraBirimi: string;
  notlar: string;
}

const BOSH: CariForm = {
  sirketId: "", ad: "", tip: "musteri", vergiNo: "", vergiDairesi: "",
  telefon: "", eposta: "", adres: "", yetkiliKisi: "", paraBirimi: "USD", notlar: "",
};

export default function Cariler() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [arama, setArama] = useState("");
  const [tipFiltre, setTipFiltre] = useState("tumu");
  const [modalAcik, setModalAcik] = useState(false);
  const [duzenleId, setDuzenleId] = useState<number | null>(null);
  const [form, setForm] = useState<CariForm>(BOSH);
  const [silId, setSilId] = useState<number | null>(null);

  const { data: cariler = [], isLoading } = useListCariler({ query: { queryKey: getListCarilerQueryKey() } });
  const { data: sirketler = [] } = useListSirketler({ query: { queryKey: getListSirketlerQueryKey() } });
  const createCari = useCreateCari();
  const updateCari = useUpdateCari();
  const deleteCari = useDeleteCari();

  const filtrelenmis = cariler.filter(c => {
    const aramaUyum = !arama || c.ad.toLowerCase().includes(arama.toLowerCase()) || (c.vergiNo ?? "").includes(arama);
    const tipUyum = tipFiltre === "tumu" || c.tip === tipFiltre;
    return aramaUyum && tipUyum;
  });

  function ac(id?: number) {
    if (id) {
      const c = cariler.find(c => c.id === id);
      if (!c) return;
      setForm({
        sirketId: String(c.sirketId), ad: c.ad, tip: c.tip,
        vergiNo: c.vergiNo ?? "", vergiDairesi: c.vergiDairesi ?? "",
        telefon: c.telefon ?? "", eposta: c.eposta ?? "", adres: c.adres ?? "",
        yetkiliKisi: c.yetkiliKisi ?? "", paraBirimi: c.paraBirimi, notlar: c.notlar ?? "",
      });
      setDuzenleId(id);
    } else {
      setForm({ ...BOSH, sirketId: sirketler[0] ? String(sirketler[0].id) : "" });
      setDuzenleId(null);
    }
    setModalAcik(true);
  }

  function kapat() { setModalAcik(false); setDuzenleId(null); setForm(BOSH); }

  function kaydet() {
    const data = { ...form, sirketId: Number(form.sirketId), aktif: true };
    if (duzenleId) {
      updateCari.mutate({ id: duzenleId, data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListCarilerQueryKey() }); kapat(); toast({ title: "Cari guncellendi" }); },
        onError: () => toast({ title: "Hata", description: "Cari guncellenemedi", variant: "destructive" }),
      });
    } else {
      createCari.mutate({ data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListCarilerQueryKey() }); kapat(); toast({ title: "Cari olusturuldu" }); },
        onError: () => toast({ title: "Hata", description: "Cari olusturulamadi", variant: "destructive" }),
      });
    }
  }

  function sil() {
    if (!silId) return;
    deleteCari.mutate({ id: silId }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListCarilerQueryKey() }); setSilId(null); toast({ title: "Cari silindi" }); },
      onError: () => toast({ title: "Hata", variant: "destructive" }),
    });
  }

  if (isLoading) return <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted rounded-lg" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Cari ara..." value={arama} onChange={e => setArama(e.target.value)} data-testid="input-cari-ara" />
        </div>
        <Select value={tipFiltre} onValueChange={setTipFiltre}>
          <SelectTrigger className="w-44" data-testid="select-cari-tip">
            <SelectValue placeholder="Tip filtrele" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tumu">Tumu</SelectItem>
            {Object.entries(TIP_ETIKETLERI).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => ac()} className="rounded-full" data-testid="button-cari-ekle">
          <Plus className="mr-2 h-4 w-4" /> Yeni Cari
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{filtrelenmis.length} cari listeleniyor</p>

      <div className="space-y-2">
        {filtrelenmis.map(c => (
          <Card key={c.id} className="hover:shadow-sm transition-shadow" data-testid={`card-cari-${c.id}`}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-semibold text-sm shrink-0">
                {c.ad.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link href={`/cariler/${c.id}`} className="font-semibold hover:text-primary truncate" data-testid={`link-cari-${c.id}`}>{c.ad}</Link>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIP_RENKLERI[c.tip]}`}>{TIP_ETIKETLERI[c.tip]}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{c.sirketAd} {c.vergiNo ? `- VKN: ${c.vergiNo}` : ""}</p>
              </div>
              <div className="text-right shrink-0 hidden sm:block">
                <p className="text-sm font-medium">{c.kalanBakiye > 0 ? "+" : ""}{new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(c.kalanBakiye)} {c.paraBirimi}</p>
                <p className="text-xs text-muted-foreground">Kalan bakiye</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => ac(c.id)} data-testid={`button-duzenle-cari-${c.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setSilId(c.id)} data-testid={`button-sil-cari-${c.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                <Link href={`/cariler/${c.id}`}><Button size="icon" variant="ghost" className="h-8 w-8"><ChevronRight className="h-4 w-4" /></Button></Link>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtrelenmis.length === 0 && (
          <div className="text-center text-muted-foreground py-16">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Cari bulunamadi.</p>
          </div>
        )}
      </div>

      <Dialog open={modalAcik} onOpenChange={setModalAcik}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{duzenleId ? "Cariyi Duzenle" : "Yeni Cari"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Sirket *</Label>
              <Select value={form.sirketId} onValueChange={v => setForm(f => ({...f, sirketId: v}))}>
                <SelectTrigger data-testid="select-cari-sirket"><SelectValue placeholder="Sirket secin" /></SelectTrigger>
                <SelectContent>{sirketler.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.ad}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Ad *</Label>
              <Input value={form.ad} onChange={e => setForm(f => ({...f, ad: e.target.value}))} data-testid="input-cari-ad" />
            </div>
            <div className="space-y-1.5">
              <Label>Tip *</Label>
              <Select value={form.tip} onValueChange={v => setForm(f => ({...f, tip: v}))}>
                <SelectTrigger data-testid="select-cari-tip-form"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TIP_ETIKETLERI).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Para Birimi</Label>
              <Select value={form.paraBirimi} onValueChange={v => setForm(f => ({...f, paraBirimi: v}))}>
                <SelectTrigger data-testid="select-cari-pb"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["USD","EUR","TRY","GBP"].map(pb => <SelectItem key={pb} value={pb}>{pb}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vergi No</Label>
              <Input value={form.vergiNo} onChange={e => setForm(f => ({...f, vergiNo: e.target.value}))} data-testid="input-cari-vergi-no" />
            </div>
            <div className="space-y-1.5">
              <Label>Vergi Dairesi</Label>
              <Input value={form.vergiDairesi} onChange={e => setForm(f => ({...f, vergiDairesi: e.target.value}))} data-testid="input-cari-vergi-dairesi" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefon</Label>
              <Input value={form.telefon} onChange={e => setForm(f => ({...f, telefon: e.target.value}))} data-testid="input-cari-telefon" />
            </div>
            <div className="space-y-1.5">
              <Label>E-posta</Label>
              <Input value={form.eposta} onChange={e => setForm(f => ({...f, eposta: e.target.value}))} data-testid="input-cari-eposta" />
            </div>
            <div className="space-y-1.5">
              <Label>Yetkili Kisi</Label>
              <Input value={form.yetkiliKisi} onChange={e => setForm(f => ({...f, yetkiliKisi: e.target.value}))} data-testid="input-cari-yetkili" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Adres</Label>
              <Input value={form.adres} onChange={e => setForm(f => ({...f, adres: e.target.value}))} data-testid="input-cari-adres" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={kapat} className="rounded-full">Iptal</Button>
            <Button onClick={kaydet} disabled={!form.sirketId || !form.ad} className="rounded-full" data-testid="button-cari-kaydet">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!silId} onOpenChange={o => !o && setSilId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Cariyi sil</AlertDialogTitle><AlertDialogDescription>Bu islem geri alinamaz.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Iptal</AlertDialogCancel>
            <AlertDialogAction onClick={sil}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
