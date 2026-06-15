import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListEkipmanlar, getListEkipmanlarQueryKey,
  useListGemiler, getListGemilerQueryKey,
  useListFirmalar, getListFirmalarQueryKey,
  useCreateEkipman, useUpdateEkipman, useDeleteEkipman,
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
import { Plus, Pencil, Trash2, HardDrive, AlertTriangle, Ship } from "lucide-react";
import { useSirket } from "@/contexts/sirket-context";

interface EkipmanForm {
  catiFirmaId: string; gemiId: string; tip: string; seriNo: string;
  kurulumTarihi: string; garantiBitisTarihi: string; notlar: string;
}

const BOSH: EkipmanForm = { catiFirmaId: "", gemiId: "", tip: "", seriNo: "", kurulumTarihi: "", garantiBitisTarihi: "", notlar: "" };

const EKIPMAN_TIPLERI = ["Starlink Terminal", "Router", "Kablo Seti", "Montaj Kiti", "Güç Kaynağı", "Diğer"];

export default function Ekipmanlar() {
  const { aktifSirketId } = useSirket();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [secilenGemiId, setSecilenGemiId] = useState("");
  const [modalAcik, setModalAcik] = useState(false);
  const [duzenleId, setDuzenleId] = useState<number | null>(null);
  const [form, setForm] = useState<EkipmanForm>(BOSH);
  const [silId, setSilId] = useState<number | null>(null);

  const { data: ekipmanlar = [], isLoading } = useListEkipmanlar(
    aktifSirketId ? { catiFirmaId: aktifSirketId } : undefined,
    { query: { queryKey: [...getListEkipmanlarQueryKey(), aktifSirketId] } },
  );
  const { data: gemiler = [] } = useListGemiler(
    aktifSirketId ? { catiFirmaId: aktifSirketId } : undefined,
    { query: { queryKey: [...getListGemilerQueryKey(), aktifSirketId] } },
  );
  const { data: catiFirmalar = [] } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );
  const createEkipman = useCreateEkipman();
  const updateEkipman = useUpdateEkipman();
  const deleteEkipman = useDeleteEkipman();

  const gemiEkipmanlari = secilenGemiId
    ? ekipmanlar.filter(e => e.gemiId === Number(secilenGemiId))
    : [];

  const bugun = new Date().toISOString().split("T")[0];
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const in30Str = in30.toISOString().split("T")[0];

  const secilenGemi = gemiler.find(g => g.id === Number(secilenGemiId));

  function ac(id?: number) {
    if (id) {
      const e = ekipmanlar.find(e => e.id === id);
      if (!e) return;
      setForm({
        catiFirmaId: String(e.catiFirmaId), gemiId: String(e.gemiId), tip: e.tip, seriNo: e.seriNo,
        kurulumTarihi: e.kurulumTarihi ?? "", garantiBitisTarihi: e.garantiBitisTarihi ?? "", notlar: e.notlar ?? "",
      });
      setDuzenleId(id);
    } else {
      setForm({ ...BOSH, catiFirmaId: catiFirmalar[0] ? String(catiFirmalar[0].id) : "", gemiId: secilenGemiId });
      setDuzenleId(null);
    }
    setModalAcik(true);
  }

  function kapat() { setModalAcik(false); setDuzenleId(null); setForm(BOSH); }

  function kaydet() {
    const data = { catiFirmaId: Number(form.catiFirmaId), gemiId: Number(form.gemiId), tip: form.tip, seriNo: form.seriNo, kurulumTarihi: form.kurulumTarihi || undefined, garantiBitisTarihi: form.garantiBitisTarihi || undefined, notlar: form.notlar || undefined, aktif: true };
    if (duzenleId) {
      updateEkipman.mutate({ id: duzenleId, data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListEkipmanlarQueryKey() }); kapat(); toast({ title: "Ekipman güncellendi" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    } else {
      createEkipman.mutate({ data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListEkipmanlarQueryKey() }); kapat(); toast({ title: "Ekipman eklendi" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    }
  }

  if (isLoading) return <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted rounded-lg" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <Select value={secilenGemiId} onValueChange={setSecilenGemiId}>
          <SelectTrigger className="w-64" data-testid="select-ekipman-gemi-filtre">
            <SelectValue placeholder="Gemi seçin..." />
          </SelectTrigger>
          <SelectContent>
            {gemiler.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.ad}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          onClick={() => ac()} className="rounded-full ml-auto" data-testid="button-ekipman-ekle"
          disabled={!secilenGemiId}
        >
          <Plus className="mr-2 h-4 w-4" /> Ekipman Ekle
        </Button>
      </div>

      {!secilenGemiId ? (
        <div className="text-center text-muted-foreground py-20">
          <Ship className="h-14 w-14 mx-auto mb-4 opacity-20" />
          <p className="text-base font-medium">Gemi seçin</p>
          <p className="text-sm mt-1">Ekipmanları görüntülemek ve yönetmek için önce bir gemi seçin.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {secilenGemi && (
            <p className="text-sm text-muted-foreground font-medium">{secilenGemi.ad} — {gemiEkipmanlari.length} ekipman</p>
          )}
          {gemiEkipmanlari.map(e => {
            const garantiUyari = e.garantiBitisTarihi && e.garantiBitisTarihi <= in30Str;
            return (
              <Card key={e.id} className={`hover:shadow-sm transition-shadow ${garantiUyari ? "border-amber-300" : ""}`} data-testid={`card-ekipman-${e.id}`}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`p-2 rounded-full ${garantiUyari ? "bg-amber-500/10" : "bg-purple-500/10"}`}>
                    <HardDrive className={`h-4 w-4 ${garantiUyari ? "text-amber-500" : "text-purple-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{e.tip}</p>
                      {garantiUyari && <div className="flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3 w-3" />Garanti bitmek üzere</div>}
                    </div>
                    <p className="text-sm text-muted-foreground">Seri No: {e.seriNo}</p>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                      {e.kurulumTarihi && <span>Kurulum: {e.kurulumTarihi}</span>}
                      {e.garantiBitisTarihi && <span>Garanti: {e.garantiBitisTarihi}</span>}
                    </div>
                  </div>
                  <Badge variant={e.aktif ? "default" : "secondary"}>{e.aktif ? "Aktif" : "Pasif"}</Badge>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => ac(e.id)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setSilId(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {gemiEkipmanlari.length === 0 && (
            <div className="text-center text-muted-foreground py-16">
              <HardDrive className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Bu gemiye ait ekipman bulunamadı.</p>
              <p className="text-sm mt-1">Yeni ekipman eklemek için butona tıklayın.</p>
            </div>
          )}
        </div>
      )}

      <Dialog open={modalAcik} onOpenChange={setModalAcik}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{duzenleId ? "Ekipmanı Düzenle" : "Ekipman Ekle"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Çatı Firma *</Label>
              <Select value={form.catiFirmaId} onValueChange={v => setForm(f => ({...f, catiFirmaId: v}))}>
                <SelectTrigger data-testid="select-ekipman-sirket"><SelectValue placeholder="Firma" /></SelectTrigger>
                <SelectContent>{catiFirmalar.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.ad}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Gemi *</Label>
              <Select value={form.gemiId} onValueChange={v => setForm(f => ({...f, gemiId: v}))}>
                <SelectTrigger data-testid="select-ekipman-gemi"><SelectValue placeholder="Gemi" /></SelectTrigger>
                <SelectContent>{gemiler.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.ad}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tip *</Label>
              <Select value={form.tip} onValueChange={v => setForm(f => ({...f, tip: v}))}>
                <SelectTrigger data-testid="select-ekipman-tip"><SelectValue placeholder="Ekipman tipi" /></SelectTrigger>
                <SelectContent>{EKIPMAN_TIPLERI.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Seri No *</Label>
              <Input value={form.seriNo} onChange={e => setForm(f => ({...f, seriNo: e.target.value}))} data-testid="input-ekipman-seri-no" />
            </div>
            <div className="space-y-1.5">
              <Label>Kurulum Tarihi</Label>
              <Input type="date" value={form.kurulumTarihi} onChange={e => setForm(f => ({...f, kurulumTarihi: e.target.value}))} data-testid="input-ekipman-kurulum" />
            </div>
            <div className="space-y-1.5">
              <Label>Garanti Bitiş</Label>
              <Input type="date" value={form.garantiBitisTarihi} onChange={e => setForm(f => ({...f, garantiBitisTarihi: e.target.value}))} data-testid="input-ekipman-garanti" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={kapat} className="rounded-full">İptal</Button>
            <Button onClick={kaydet} disabled={!form.gemiId || !form.tip || !form.seriNo} className="rounded-full" data-testid="button-ekipman-kaydet">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!silId} onOpenChange={o => !o && setSilId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Ekipmanı sil</AlertDialogTitle><AlertDialogDescription>Bu işlem geri alınamaz.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (!silId) return; deleteEkipman.mutate({ id: silId }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListEkipmanlarQueryKey() }); setSilId(null); } }); }}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
