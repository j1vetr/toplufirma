import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSirketler, getListSirketlerQueryKey,
  useCreateSirket, useUpdateSirket, useDeleteSirket,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";

interface SirketForm {
  ad: string;
  vergiNo: string;
  vergiDairesi: string;
  adres: string;
  telefon: string;
  eposta: string;
  seriOneki: string;
}

const BOSH: SirketForm = { ad: "", vergiNo: "", vergiDairesi: "", adres: "", telefon: "", eposta: "", seriOneki: "" };

export default function Sirketler() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: sirketler = [], isLoading } = useListSirketler({ query: { queryKey: getListSirketlerQueryKey() } });
  const createSirket = useCreateSirket();
  const updateSirket = useUpdateSirket();
  const deleteSirket = useDeleteSirket();

  const [modalAcik, setModalAcik] = useState(false);
  const [duzenleId, setDuzenleId] = useState<number | null>(null);
  const [form, setForm] = useState<SirketForm>(BOSH);
  const [silId, setSilId] = useState<number | null>(null);

  function ac(id?: number) {
    if (id) {
      const s = sirketler.find(s => s.id === id);
      if (!s) return;
      setForm({ ad: s.ad, vergiNo: s.vergiNo ?? "", vergiDairesi: s.vergiDairesi ?? "", adres: s.adres ?? "", telefon: s.telefon ?? "", eposta: s.eposta ?? "", seriOneki: s.seriOneki });
      setDuzenleId(id);
    } else {
      setForm(BOSH);
      setDuzenleId(null);
    }
    setModalAcik(true);
  }

  function kapat() { setModalAcik(false); setDuzenleId(null); setForm(BOSH); }

  function kaydet() {
    const data = { ...form, aktif: true };
    if (duzenleId) {
      updateSirket.mutate({ id: duzenleId, data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListSirketlerQueryKey() }); kapat(); toast({ title: "Şirket güncellendi" }); },
        onError: () => toast({ title: "Hata", description: "Şirket güncellenemedi", variant: "destructive" }),
      });
    } else {
      createSirket.mutate({ data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListSirketlerQueryKey() }); kapat(); toast({ title: "Şirket oluşturuldu" }); },
        onError: () => toast({ title: "Hata", description: "Şirket oluşturulamadı", variant: "destructive" }),
      });
    }
  }

  function sil() {
    if (!silId) return;
    deleteSirket.mutate({ id: silId }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListSirketlerQueryKey() }); setSilId(null); toast({ title: "Şirket silindi" }); },
      onError: () => toast({ title: "Hata", description: "Şirket silinemedi", variant: "destructive" }),
    });
  }

  if (isLoading) return <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-lg" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">{sirketler.length} şirket kayıtlı</p>
        <Button onClick={() => ac()} className="rounded-full" data-testid="button-sirket-ekle">
          <Plus className="mr-2 h-4 w-4" /> Yeni Sirket
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sirketler.map(s => (
          <Card key={s.id} className="hover:shadow-md transition-shadow" data-testid={`card-sirket-${s.id}`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{s.ad}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Seri: {s.seriOneki}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => ac(s.id)} data-testid={`button-duzenle-${s.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setSilId(s.id)} data-testid={`button-sil-${s.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                {s.vergiNo && <p>VKN: {s.vergiNo}</p>}
                {s.telefon && <p>{s.telefon}</p>}
                {s.eposta && <p>{s.eposta}</p>}
              </div>
              <div className="mt-3">
                <Badge variant={s.aktif ? "default" : "secondary"}>{s.aktif ? "Aktif" : "Pasif"}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
        {sirketler.length === 0 && (
          <div className="col-span-3 text-center text-muted-foreground py-16">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Henüz sirket eklenmemis. Yeni sirket olusturun.</p>
          </div>
        )}
      </div>

      <Dialog open={modalAcik} onOpenChange={setModalAcik}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{duzenleId ? "Sirketi Duzenle" : "Yeni Sirket"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Sirket Adi *</Label>
              <Input value={form.ad} onChange={e => setForm(f => ({...f, ad: e.target.value}))} data-testid="input-sirket-ad" />
            </div>
            <div className="space-y-1.5">
              <Label>Vergi No</Label>
              <Input value={form.vergiNo} onChange={e => setForm(f => ({...f, vergiNo: e.target.value}))} data-testid="input-sirket-vergi-no" />
            </div>
            <div className="space-y-1.5">
              <Label>Vergi Dairesi</Label>
              <Input value={form.vergiDairesi} onChange={e => setForm(f => ({...f, vergiDairesi: e.target.value}))} data-testid="input-sirket-vergi-dairesi" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefon</Label>
              <Input value={form.telefon} onChange={e => setForm(f => ({...f, telefon: e.target.value}))} data-testid="input-sirket-telefon" />
            </div>
            <div className="space-y-1.5">
              <Label>E-posta</Label>
              <Input value={form.eposta} onChange={e => setForm(f => ({...f, eposta: e.target.value}))} data-testid="input-sirket-eposta" />
            </div>
            <div className="space-y-1.5">
              <Label>Seri Oneki *</Label>
              <Input value={form.seriOneki} onChange={e => setForm(f => ({...f, seriOneki: e.target.value.toUpperCase()}))} placeholder="LAC" maxLength={5} data-testid="input-sirket-seri-oneki" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Adres</Label>
              <Input value={form.adres} onChange={e => setForm(f => ({...f, adres: e.target.value}))} data-testid="input-sirket-adres" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={kapat} className="rounded-full">Iptal</Button>
            <Button onClick={kaydet} disabled={!form.ad || !form.seriOneki || createSirket.isPending || updateSirket.isPending} className="rounded-full" data-testid="button-sirket-kaydet">
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!silId} onOpenChange={o => !o && setSilId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sirketi sil</AlertDialogTitle>
            <AlertDialogDescription>Bu islem geri alinamaz. Devam etmek istiyor musunuz?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Iptal</AlertDialogCancel>
            <AlertDialogAction onClick={sil} data-testid="button-sil-onayla">Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
