import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListGemiler, getListGemilerQueryKey,
  useListCariler, getListCarilerQueryKey,
  useCreateGemi, useUpdateGemi, useDeleteGemi,
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
import { Plus, Pencil, Trash2, Ship, Wifi, ChevronRight, Search } from "lucide-react";

interface GemiForm {
  cariId: string;
  ad: string;
  imoNumarasi: string;
  bayrakDevleti: string;
  notlar: string;
}

const BOSH: GemiForm = { cariId: "", ad: "", imoNumarasi: "", bayrakDevleti: "", notlar: "" };

export default function Gemiler() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [arama, setArama] = useState("");
  const [modalAcik, setModalAcik] = useState(false);
  const [duzenleId, setDuzenleId] = useState<number | null>(null);
  const [form, setForm] = useState<GemiForm>(BOSH);
  const [silId, setSilId] = useState<number | null>(null);

  const { data: gemiler = [], isLoading } = useListGemiler({ query: { queryKey: getListGemilerQueryKey() } });
  const { data: cariler = [] } = useListCariler({ query: { queryKey: getListCarilerQueryKey() } });
  const createGemi = useCreateGemi();
  const updateGemi = useUpdateGemi();
  const deleteGemi = useDeleteGemi();

  const filtrelenmis = gemiler.filter(g =>
    !arama || g.ad.toLowerCase().includes(arama.toLowerCase()) || (g.imoNumarasi ?? "").includes(arama)
  );

  function ac(id?: number) {
    if (id) {
      const g = gemiler.find(g => g.id === id);
      if (!g) return;
      setForm({ cariId: String(g.cariId), ad: g.ad, imoNumarasi: g.imoNumarasi ?? "", bayrakDevleti: g.bayrakDevleti ?? "", notlar: g.notlar ?? "" });
      setDuzenleId(id);
    } else {
      setForm({ ...BOSH, cariId: cariler[0] ? String(cariler[0].id) : "" });
      setDuzenleId(null);
    }
    setModalAcik(true);
  }

  function kapat() { setModalAcik(false); setDuzenleId(null); setForm(BOSH); }

  function kaydet() {
    const data = { ...form, cariId: Number(form.cariId), aktif: true };
    if (duzenleId) {
      updateGemi.mutate({ id: duzenleId, data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListGemilerQueryKey() }); kapat(); toast({ title: "Gemi guncellendi" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    } else {
      createGemi.mutate({ data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListGemilerQueryKey() }); kapat(); toast({ title: "Gemi olusturuldu" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    }
  }

  if (isLoading) return <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-lg" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Gemi ara..." value={arama} onChange={e => setArama(e.target.value)} data-testid="input-gemi-ara" />
        </div>
        <Button onClick={() => ac()} className="rounded-full" data-testid="button-gemi-ekle">
          <Plus className="mr-2 h-4 w-4" /> Yeni Gemi
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtrelenmis.map(g => (
          <Card key={g.id} className="hover:shadow-md transition-shadow" data-testid={`card-gemi-${g.id}`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <Ship className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{g.ad}</h3>
                    {g.imoNumarasi && <p className="text-xs text-muted-foreground">IMO: {g.imoNumarasi}</p>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => ac(g.id)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setSilId(g.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="mt-3 text-sm text-muted-foreground space-y-1">
                <p>{g.cariAd}</p>
                {g.bayrakDevleti && <p>Bayrak: {g.bayrakDevleti}</p>}
              </div>
              <div className="mt-3 flex items-center gap-2">
                {g.aktifPlan && <div className="flex items-center gap-1 text-xs text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full"><Wifi className="h-3 w-3" />{g.aktifPlan}</div>}
                <Badge variant={g.aktif ? "default" : "secondary"}>{g.aktif ? "Aktif" : "Pasif"}</Badge>
                <Link href={`/gemiler/${g.id}`} className="ml-auto"><Button size="icon" variant="ghost" className="h-7 w-7"><ChevronRight className="h-4 w-4" /></Button></Link>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtrelenmis.length === 0 && (
          <div className="col-span-3 text-center text-muted-foreground py-16">
            <Ship className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Gemi bulunamadi.</p>
          </div>
        )}
      </div>

      <Dialog open={modalAcik} onOpenChange={setModalAcik}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{duzenleId ? "Gemiyi Duzenle" : "Yeni Gemi"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Cari *</Label>
              <Select value={form.cariId} onValueChange={v => setForm(f => ({...f, cariId: v}))}>
                <SelectTrigger data-testid="select-gemi-cari"><SelectValue placeholder="Cari secin" /></SelectTrigger>
                <SelectContent>{cariler.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.ad}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Gemi Adi *</Label>
              <Input value={form.ad} onChange={e => setForm(f => ({...f, ad: e.target.value}))} data-testid="input-gemi-ad" />
            </div>
            <div className="space-y-1.5">
              <Label>IMO Numarasi</Label>
              <Input value={form.imoNumarasi} onChange={e => setForm(f => ({...f, imoNumarasi: e.target.value}))} data-testid="input-gemi-imo" />
            </div>
            <div className="space-y-1.5">
              <Label>Bayrak Devleti</Label>
              <Input value={form.bayrakDevleti} onChange={e => setForm(f => ({...f, bayrakDevleti: e.target.value}))} data-testid="input-gemi-bayrak" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notlar</Label>
              <Input value={form.notlar} onChange={e => setForm(f => ({...f, notlar: e.target.value}))} data-testid="input-gemi-notlar" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={kapat} className="rounded-full">Iptal</Button>
            <Button onClick={kaydet} disabled={!form.cariId || !form.ad} className="rounded-full" data-testid="button-gemi-kaydet">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!silId} onOpenChange={o => !o && setSilId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Gemiyi sil</AlertDialogTitle><AlertDialogDescription>Bu islem geri alinamaz.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Iptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (!silId) return; deleteGemi.mutate({ id: silId }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListGemilerQueryKey() }); setSilId(null); } }); }}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
