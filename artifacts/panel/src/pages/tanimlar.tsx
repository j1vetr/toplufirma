import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListKdvOranlari, getListKdvOranlariQueryKey,
  useCreateKdvOrani, useUpdateKdvOrani, useDeleteKdvOrani,
  useListFaturaSerileri, getListFaturaSerileriQueryKey,
  useCreateFaturaSeri, useUpdateFaturaSeri, useDeleteFaturaSeri,
  useListFirmalar, getListFirmalarQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Plus, Pencil, Trash2 } from "lucide-react";

export default function Tanimlar() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: kdvOranlari = [] } = useListKdvOranlari(undefined, { query: { queryKey: getListKdvOranlariQueryKey() } });
  const { data: faturaSerileri = [] } = useListFaturaSerileri(undefined, { query: { queryKey: getListFaturaSerileriQueryKey() } });
  const { data: catiFirmalar = [] } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );

  const createKdv = useCreateKdvOrani();
  const updateKdv = useUpdateKdvOrani();
  const deleteKdv = useDeleteKdvOrani();
  const createSeri = useCreateFaturaSeri();
  const updateSeri = useUpdateFaturaSeri();
  const deleteSeri = useDeleteFaturaSeri();

  const [kdvModal, setKdvModal] = useState(false);
  const [kdvDuzenleId, setKdvDuzenleId] = useState<number | null>(null);
  const [kdvForm, setKdvForm] = useState({ catiFirmaId: "", ad: "", oran: "", varsayilan: "false" });
  const [kdvSilId, setKdvSilId] = useState<number | null>(null);

  const [seriModal, setSeriModal] = useState(false);
  const [seriDuzenleId, setSeriDuzenleId] = useState<number | null>(null);
  const [seriForm, setSeriForm] = useState({ catiFirmaId: "", ad: "", onek: "", sonrakiNo: "1", varsayilan: "false" });
  const [seriSilId, setSeriSilId] = useState<number | null>(null);

  function kdvAc(id?: number) {
    if (id) {
      const k = kdvOranlari.find(k => k.id === id);
      if (!k) return;
      setKdvForm({ catiFirmaId: String(k.catiFirmaId), ad: k.ad, oran: String(k.oran), varsayilan: String(k.varsayilan) });
      setKdvDuzenleId(id);
    } else {
      setKdvForm({ catiFirmaId: catiFirmalar[0] ? String(catiFirmalar[0].id) : "", ad: "", oran: "", varsayilan: "false" });
      setKdvDuzenleId(null);
    }
    setKdvModal(true);
  }

  function kdvKaydet() {
    const data = { catiFirmaId: Number(kdvForm.catiFirmaId), ad: kdvForm.ad, oran: Number(kdvForm.oran), varsayilan: kdvForm.varsayilan === "true" };
    if (kdvDuzenleId) {
      updateKdv.mutate({ id: kdvDuzenleId, data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListKdvOranlariQueryKey() }); setKdvModal(false); toast({ title: "KDV oranı güncellendi" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    } else {
      createKdv.mutate({ data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListKdvOranlariQueryKey() }); setKdvModal(false); toast({ title: "KDV oranı eklendi" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    }
  }

  function seriAc(id?: number) {
    if (id) {
      const s = faturaSerileri.find(s => s.id === id);
      if (!s) return;
      setSeriForm({ catiFirmaId: String(s.catiFirmaId), ad: s.ad, onek: s.onek, sonrakiNo: String(s.sonrakiNo), varsayilan: String(s.varsayilan) });
      setSeriDuzenleId(id);
    } else {
      setSeriForm({ catiFirmaId: catiFirmalar[0] ? String(catiFirmalar[0].id) : "", ad: "", onek: "", sonrakiNo: "1", varsayilan: "false" });
      setSeriDuzenleId(null);
    }
    setSeriModal(true);
  }

  function seriKaydet() {
    const data = { catiFirmaId: Number(seriForm.catiFirmaId), ad: seriForm.ad, onek: seriForm.onek, sonrakiNo: Number(seriForm.sonrakiNo), varsayilan: seriForm.varsayilan === "true" };
    if (seriDuzenleId) {
      updateSeri.mutate({ id: seriDuzenleId, data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListFaturaSerileriQueryKey() }); setSeriModal(false); toast({ title: "Seri güncellendi" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    } else {
      createSeri.mutate({ data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListFaturaSerileriQueryKey() }); setSeriModal(false); toast({ title: "Seri eklendi" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    }
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="kdv">
        <TabsList className="rounded-full">
          <TabsTrigger value="kdv" className="rounded-full">KDV Oranları</TabsTrigger>
          <TabsTrigger value="seriler" className="rounded-full">Fatura Serileri</TabsTrigger>
        </TabsList>

        <TabsContent value="kdv" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={() => kdvAc()} className="rounded-full" data-testid="button-kdv-ekle">
              <Plus className="mr-2 h-4 w-4" /> KDV Oranı Ekle
            </Button>
          </div>
          <div className="space-y-2">
            {kdvOranlari.map(k => (
              <Card key={k.id} data-testid={`card-kdv-${k.id}`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{k.ad}</p>
                    <p className="text-sm text-muted-foreground">{catiFirmalar.find(f => f.id === k.catiFirmaId)?.ad}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-display font-bold">%{k.oran}</span>
                    {k.varsayilan && <Badge>Varsayılan</Badge>}
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => kdvAc(k.id)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setKdvSilId(k.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {kdvOranlari.length === 0 && <div className="text-center text-muted-foreground py-10">Henüz KDV oranı tanımlanmamış.</div>}
          </div>
        </TabsContent>

        <TabsContent value="seriler" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={() => seriAc()} className="rounded-full" data-testid="button-seri-ekle">
              <Plus className="mr-2 h-4 w-4" /> Seri Ekle
            </Button>
          </div>
          <div className="space-y-2">
            {faturaSerileri.map(s => (
              <Card key={s.id} data-testid={`card-seri-${s.id}`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{s.ad}</p>
                    <p className="text-sm text-muted-foreground">{catiFirmalar.find(f => f.id === s.catiFirmaId)?.ad}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-mono font-bold">{s.onek}000001</p>
                      <p className="text-xs text-muted-foreground">Sonraki: #{s.sonrakiNo}</p>
                    </div>
                    {s.varsayilan && <Badge>Varsayılan</Badge>}
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => seriAc(s.id)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setSeriSilId(s.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {faturaSerileri.length === 0 && <div className="text-center text-muted-foreground py-10">Henüz fatura serisi tanımlanmamış.</div>}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={kdvModal} onOpenChange={setKdvModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{kdvDuzenleId ? "KDV Oranı Düzenle" : "Yeni KDV Oranı"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Çatı Firma *</Label>
              <Select value={kdvForm.catiFirmaId} onValueChange={v => setKdvForm(f => ({...f, catiFirmaId: v}))}>
                <SelectTrigger data-testid="select-kdv-sirket"><SelectValue placeholder="Firma seçin" /></SelectTrigger>
                <SelectContent>{catiFirmalar.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.ad}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ad *</Label>
              <Input value={kdvForm.ad} onChange={e => setKdvForm(f => ({...f, ad: e.target.value}))} placeholder="KDV %20" data-testid="input-kdv-ad" />
            </div>
            <div className="space-y-1.5">
              <Label>Oran (%) *</Label>
              <Input type="number" value={kdvForm.oran} onChange={e => setKdvForm(f => ({...f, oran: e.target.value}))} min="0" max="100" step="0.01" data-testid="input-kdv-oran" />
            </div>
            <div className="space-y-1.5">
              <Label>Varsayılan</Label>
              <Select value={kdvForm.varsayilan} onValueChange={v => setKdvForm(f => ({...f, varsayilan: v}))}>
                <SelectTrigger data-testid="select-kdv-varsayilan"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="false">Hayır</SelectItem><SelectItem value="true">Evet</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKdvModal(false)} className="rounded-full">İptal</Button>
            <Button onClick={kdvKaydet} disabled={!kdvForm.catiFirmaId || !kdvForm.ad || !kdvForm.oran} className="rounded-full" data-testid="button-kdv-kaydet">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={seriModal} onOpenChange={setSeriModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{seriDuzenleId ? "Seriyi Düzenle" : "Yeni Fatura Serisi"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Çatı Firma *</Label>
              <Select value={seriForm.catiFirmaId} onValueChange={v => setSeriForm(f => ({...f, catiFirmaId: v}))}>
                <SelectTrigger data-testid="select-seri-sirket"><SelectValue placeholder="Firma seçin" /></SelectTrigger>
                <SelectContent>{catiFirmalar.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.ad}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ad *</Label>
              <Input value={seriForm.ad} onChange={e => setSeriForm(f => ({...f, ad: e.target.value}))} placeholder="Ana Seri" data-testid="input-seri-ad" />
            </div>
            <div className="space-y-1.5">
              <Label>Önek *</Label>
              <Input value={seriForm.onek} onChange={e => setSeriForm(f => ({...f, onek: e.target.value.toUpperCase()}))} placeholder="LAC" maxLength={6} data-testid="input-seri-onek" />
            </div>
            <div className="space-y-1.5">
              <Label>Sonraki No</Label>
              <Input type="number" value={seriForm.sonrakiNo} onChange={e => setSeriForm(f => ({...f, sonrakiNo: e.target.value}))} min="1" data-testid="input-seri-no" />
            </div>
            <div className="space-y-1.5">
              <Label>Varsayılan</Label>
              <Select value={seriForm.varsayilan} onValueChange={v => setSeriForm(f => ({...f, varsayilan: v}))}>
                <SelectTrigger data-testid="select-seri-varsayilan"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="false">Hayır</SelectItem><SelectItem value="true">Evet</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeriModal(false)} className="rounded-full">İptal</Button>
            <Button onClick={seriKaydet} disabled={!seriForm.catiFirmaId || !seriForm.ad || !seriForm.onek} className="rounded-full" data-testid="button-seri-kaydet">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!kdvSilId} onOpenChange={o => !o && setKdvSilId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>KDV oranını sil</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (!kdvSilId) return; deleteKdv.mutate({ id: kdvSilId }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListKdvOranlariQueryKey() }); setKdvSilId(null); } }); }}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!seriSilId} onOpenChange={o => !o && setSeriSilId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Seriyi sil</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (!seriSilId) return; deleteSeri.mutate({ id: seriSilId }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListFaturaSerileriQueryKey() }); setSeriSilId(null); } }); }}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
