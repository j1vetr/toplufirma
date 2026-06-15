import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListStarlinkPlanlari, getListStarlinkPlanlariQueryKey,
  useListSirketler, getListSirketlerQueryKey,
  useListCariler, getListCarilerQueryKey,
  useListGemiler, getListGemilerQueryKey,
  useCreateStarlinkPlani, useUpdateStarlinkPlani, useDeleteStarlinkPlani,
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
import { Plus, Pencil, Trash2, Wifi, AlertTriangle } from "lucide-react";

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

interface PlanForm {
  sirketId: string; cariId: string; gemiId: string;
  planAdi: string; hizMbps: string;
  baslangicTarihi: string; bitisTarihi: string;
  aylikUcret: string; paraBirimi: string;
  otomatikYenileme: string; notlar: string;
}

const BOSH: PlanForm = {
  sirketId: "", cariId: "", gemiId: "", planAdi: "", hizMbps: "",
  baslangicTarihi: "", bitisTarihi: "", aylikUcret: "",
  paraBirimi: "USD", otomatikYenileme: "true", notlar: "",
};

export default function StarlinkPlanlari() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [aktifFiltre, setAktifFiltre] = useState("tumu");
  const [modalAcik, setModalAcik] = useState(false);
  const [duzenleId, setDuzenleId] = useState<number | null>(null);
  const [form, setForm] = useState<PlanForm>(BOSH);
  const [silId, setSilId] = useState<number | null>(null);

  const { data: planlar = [], isLoading } = useListStarlinkPlanlari(undefined, { query: { queryKey: getListStarlinkPlanlariQueryKey() } });
  const { data: sirketler = [] } = useListSirketler({ query: { queryKey: getListSirketlerQueryKey() } });
  const { data: cariler = [] } = useListCariler(undefined, { query: { queryKey: getListCarilerQueryKey() } });
  const { data: gemiler = [] } = useListGemiler(undefined, { query: { queryKey: getListGemilerQueryKey() } });
  const createPlan = useCreateStarlinkPlani();
  const updatePlan = useUpdateStarlinkPlani();
  const deletePlan = useDeleteStarlinkPlani();

  const filtrelenmis = planlar.filter(p => aktifFiltre === "tumu" || (aktifFiltre === "aktif" ? p.aktif : !p.aktif));

  function ac(id?: number) {
    if (id) {
      const p = planlar.find(p => p.id === id);
      if (!p) return;
      setForm({
        sirketId: String(p.sirketId), cariId: String(p.cariId), gemiId: String(p.gemiId),
        planAdi: p.planAdi, hizMbps: String(p.hizMbps ?? ""),
        baslangicTarihi: p.baslangicTarihi, bitisTarihi: p.bitisTarihi,
        aylikUcret: String(p.aylikUcret), paraBirimi: p.paraBirimi,
        otomatikYenileme: String(p.otomatikYenileme), notlar: p.notlar ?? "",
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
    const data = {
      sirketId: Number(form.sirketId), cariId: Number(form.cariId), gemiId: Number(form.gemiId),
      planAdi: form.planAdi, hizMbps: form.hizMbps ? Number(form.hizMbps) : undefined,
      baslangicTarihi: form.baslangicTarihi, bitisTarihi: form.bitisTarihi,
      aylikUcret: Number(form.aylikUcret), paraBirimi: form.paraBirimi,
      otomatikYenileme: form.otomatikYenileme === "true",
      aktif: true, notlar: form.notlar,
    };
    if (duzenleId) {
      updatePlan.mutate({ id: duzenleId, data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListStarlinkPlanlariQueryKey() }); kapat(); toast({ title: "Plan guncellendi" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    } else {
      createPlan.mutate({ data }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListStarlinkPlanlariQueryKey() }); kapat(); toast({ title: "Plan olusturuldu" }); },
        onError: () => toast({ title: "Hata", variant: "destructive" }),
      });
    }
  }

  if (isLoading) return <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-lg" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex rounded-full border p-1 gap-1">
          {[["tumu", "Tumu"], ["aktif", "Aktif"], ["pasif", "Pasif"]].map(([v, l]) => (
            <button key={v} onClick={() => setAktifFiltre(v)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${aktifFiltre === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid={`filter-plan-${v}`}>{l}</button>
          ))}
        </div>
        <Button onClick={() => ac()} className="rounded-full ml-auto" data-testid="button-plan-ekle">
          <Plus className="mr-2 h-4 w-4" /> Yeni Plan
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtrelenmis.map(p => (
          <Card key={p.id} className={`hover:shadow-md transition-shadow ${( p.kalanGun ?? 0) <= 7 && p.aktif ? "border-amber-300" : ""}`} data-testid={`card-plan-${p.id}`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${p.aktif ? "bg-blue-500/10" : "bg-muted"}`}>
                    <Wifi className={`h-5 w-5 ${p.aktif ? "text-blue-500" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold">{p.planAdi}</h3>
                    <p className="text-xs text-muted-foreground">{p.gemiAd}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => ac(p.id)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setSilId(p.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <p className="text-2xl font-display font-bold">{fmt(p.aylikUcret, p.paraBirimi)}<span className="text-sm font-normal text-muted-foreground">/ay</span></p>
                <p className="text-xs text-muted-foreground">{p.baslangicTarihi} - {p.bitisTarihi}</p>
                {p.hizMbps && <p className="text-xs text-muted-foreground">{p.hizMbps} Mbps</p>}
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <Badge variant={p.aktif ? "default" : "secondary"}>{p.aktif ? "Aktif" : "Pasif"}</Badge>
                {p.aktif && ( p.kalanGun ?? 0) <= 30 && (
                  <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${( p.kalanGun ?? 0) <= 7 ? "bg-red-500/10 text-red-600" : "bg-amber-500/10 text-amber-600"}`}>
                    {( p.kalanGun ?? 0) <= 7 && <AlertTriangle className="h-3 w-3" />}
                    {p.kalanGun ?? 0} gun kaldi
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {filtrelenmis.length === 0 && (
          <div className="col-span-3 text-center text-muted-foreground py-16">
            <Wifi className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Plan bulunamadi.</p>
          </div>
        )}
      </div>

      <Dialog open={modalAcik} onOpenChange={setModalAcik}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{duzenleId ? "Plani Duzenle" : "Yeni Starlink Plani"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Sirket *</Label>
              <Select value={form.sirketId} onValueChange={v => setForm(f => ({...f, sirketId: v, cariId: "", gemiId: ""}))}>
                <SelectTrigger data-testid="select-plan-sirket"><SelectValue placeholder="Sirket" /></SelectTrigger>
                <SelectContent>{sirketler.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.ad}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cari *</Label>
              <Select value={form.cariId} onValueChange={v => setForm(f => ({...f, cariId: v, gemiId: ""}))}>
                <SelectTrigger data-testid="select-plan-cari"><SelectValue placeholder="Cari" /></SelectTrigger>
                <SelectContent>{cariler.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.ad}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Gemi *</Label>
              <Select value={form.gemiId} onValueChange={v => setForm(f => ({...f, gemiId: v}))}>
                <SelectTrigger data-testid="select-plan-gemi"><SelectValue placeholder="Gemi" /></SelectTrigger>
                <SelectContent>{gemiler.filter(g => !form.cariId || g.cariId === Number(form.cariId)).map(g => <SelectItem key={g.id} value={String(g.id)}>{g.ad}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Plan Adi *</Label>
              <Input value={form.planAdi} onChange={e => setForm(f => ({...f, planAdi: e.target.value}))} placeholder="Maritime Pro" data-testid="input-plan-adi" />
            </div>
            <div className="space-y-1.5">
              <Label>Hiz (Mbps)</Label>
              <Input type="number" value={form.hizMbps} onChange={e => setForm(f => ({...f, hizMbps: e.target.value}))} data-testid="input-plan-hiz" />
            </div>
            <div className="space-y-1.5">
              <Label>Aylik Ucret *</Label>
              <Input type="number" value={form.aylikUcret} onChange={e => setForm(f => ({...f, aylikUcret: e.target.value}))} step="0.01" data-testid="input-plan-ucret" />
            </div>
            <div className="space-y-1.5">
              <Label>Para Birimi</Label>
              <Select value={form.paraBirimi} onValueChange={v => setForm(f => ({...f, paraBirimi: v}))}>
                <SelectTrigger data-testid="select-plan-pb"><SelectValue /></SelectTrigger>
                <SelectContent>{["USD","EUR","TRY"].map(pb => <SelectItem key={pb} value={pb}>{pb}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Baslangic *</Label>
              <Input type="date" value={form.baslangicTarihi} onChange={e => setForm(f => ({...f, baslangicTarihi: e.target.value}))} data-testid="input-plan-baslangic" />
            </div>
            <div className="space-y-1.5">
              <Label>Bitis *</Label>
              <Input type="date" value={form.bitisTarihi} onChange={e => setForm(f => ({...f, bitisTarihi: e.target.value}))} data-testid="input-plan-bitis" />
            </div>
            <div className="space-y-1.5">
              <Label>Otomatik Yenileme</Label>
              <Select value={form.otomatikYenileme} onValueChange={v => setForm(f => ({...f, otomatikYenileme: v}))}>
                <SelectTrigger data-testid="select-plan-yenileme"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Evet</SelectItem>
                  <SelectItem value="false">Hayir</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={kapat} className="rounded-full">Iptal</Button>
            <Button onClick={kaydet} disabled={!form.sirketId || !form.cariId || !form.gemiId || !form.planAdi || !form.aylikUcret} className="rounded-full" data-testid="button-plan-kaydet">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!silId} onOpenChange={o => !o && setSilId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Plani sil</AlertDialogTitle><AlertDialogDescription>Bu islem geri alinamaz.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Iptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (!silId) return; deletePlan.mutate({ id: silId }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListStarlinkPlanlariQueryKey() }); setSilId(null); } }); }}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
