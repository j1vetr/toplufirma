import { useState } from "react";
import { Plus, Pencil, Trash2, ShieldCheck, Eye, BookOpen, User, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useListFirmalar, getListFirmalarQueryKey } from "@workspace/api-client-react";
import type { KullaniciInfo } from "@/App";

const apiBase = () => {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api`;
};

interface Kullanici {
  id: number;
  ad: string;
  email: string;
  rol: string;
  aktif: boolean;
  olusturmaTarihi: string;
  sirketler: Array<{ sirketId: number; rol: string }>;
}

interface FirmaAtama {
  sirketId: number;
  rol: string;
}

const ROL_ETIKET: Record<string, { label: string; icon: React.ReactNode }> = {
  yonetici: { label: "Yönetici", icon: <ShieldCheck className="h-3 w-3" /> },
  muhasebeci: { label: "Muhasebeci", icon: <BookOpen className="h-3 w-3" /> },
  salt_okunur: { label: "Salt Okunur", icon: <Eye className="h-3 w-3" /> },
};

function rolRenk(rol: string) {
  if (rol === "yonetici") return "bg-primary/10 text-primary";
  if (rol === "muhasebeci") return "bg-green-500/10 text-green-600";
  return "bg-muted text-muted-foreground";
}

interface Props { kullanici: KullaniciInfo | null }

export default function Kullanicilar({ kullanici }: Props) {
  const { toast } = useToast();
  const [kullanicilar, setKullanicilar] = useState<Kullanici[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [dialogAcik, setDialogAcik] = useState(false);
  const [silDialogAcik, setSilDialogAcik] = useState(false);
  const [secili, setSecili] = useState<Kullanici | null>(null);
  const [silHedef, setSilHedef] = useState<Kullanici | null>(null);
  const [form, setForm] = useState({
    ad: "", email: "", parola: "", rol: "muhasebeci", aktif: true,
    sirketler: [] as FirmaAtama[],
  });

  const { data: sirketler = [] } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );

  async function listele() {
    setYukleniyor(true);
    try {
      const token = localStorage.getItem("panel_token");
      const r = await fetch(`${apiBase()}/kullanicilar`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) setKullanicilar(await r.json());
    } finally { setYukleniyor(false); }
  }

  useState(() => { listele(); });

  function acDialog(k?: Kullanici) {
    if (k) {
      setSecili(k);
      setForm({
        ad: k.ad, email: k.email, parola: "", rol: k.rol, aktif: k.aktif,
        sirketler: k.sirketler.map(s => ({ sirketId: s.sirketId, rol: s.rol })),
      });
    } else {
      setSecili(null);
      setForm({ ad: "", email: "", parola: "", rol: "muhasebeci", aktif: true, sirketler: [] });
    }
    setDialogAcik(true);
  }

  function sirketToggle(sirketId: number, checked: boolean) {
    setForm(f => ({
      ...f,
      sirketler: checked
        ? [...f.sirketler, { sirketId, rol: "muhasebeci" }]
        : f.sirketler.filter(x => x.sirketId !== sirketId),
    }));
  }

  function sirketRolGuncelle(sirketId: number, rol: string) {
    setForm(f => ({
      ...f,
      sirketler: f.sirketler.map(x => x.sirketId === sirketId ? { ...x, rol } : x),
    }));
  }

  async function kaydet() {
    const token = localStorage.getItem("panel_token");
    const body: Record<string, unknown> = {
      ad: form.ad,
      email: form.email,
      rol: form.rol,
      aktif: form.aktif,
      sirketler: form.sirketler,
    };
    if (form.parola) body.parola = form.parola;

    const url = secili
      ? `${apiBase()}/kullanicilar/${secili.id}`
      : `${apiBase()}/kullanicilar`;
    const method = secili ? "PUT" : "POST";
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    if (r.ok) {
      toast({ title: secili ? "Kullanıcı güncellendi" : "Kullanıcı oluşturuldu" });
      setDialogAcik(false);
      listele();
    } else {
      const d = await r.json();
      toast({ title: "Hata", description: d.error, variant: "destructive" });
    }
  }

  async function sil() {
    if (!silHedef) return;
    const token = localStorage.getItem("panel_token");
    const r = await fetch(`${apiBase()}/kullanicilar/${silHedef.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) {
      toast({ title: "Kullanıcı silindi" });
      setSilDialogAcik(false);
      setSilHedef(null);
      listele();
    } else {
      const d = await r.json();
      toast({ title: "Hata", description: d.error, variant: "destructive" });
    }
  }

  function sirketAd(id: number) {
    return (sirketler as Array<{ id: number; ad: string }>).find(s => s.id === id)?.ad ?? `Şirket #${id}`;
  }

  if (kullanici?.rol !== "yonetici") {
    return (
      <div className="p-8 text-center">
        <ShieldCheck className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">Bu sayfayı görüntülemek için yönetici yetkisi gereklidir.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold">Kullanıcı Yönetimi</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Panel kullanıcılarını ve şirket erişimlerini yönetin</p>
        </div>
        <Button onClick={() => acDialog()} className="rounded-full gap-2" data-testid="button-kullanici-yeni">
          <Plus className="h-4 w-4" /> Yeni Kullanıcı
        </Button>
      </div>

      {yukleniyor ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted rounded-xl" />)}
        </div>
      ) : (
        <div className="grid gap-3">
          {kullanicilar.map(k => (
            <Card key={k.id} className="border-none shadow-sm" data-testid={`card-kullanici-${k.id}`}>
              <CardContent className="flex items-center gap-4 py-4 px-5">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{k.ad}</span>
                    <Badge className={`text-xs flex items-center gap-1 px-2 py-0 rounded-full ${rolRenk(k.rol)}`}>
                      {ROL_ETIKET[k.rol]?.icon}
                      {ROL_ETIKET[k.rol]?.label ?? k.rol}
                    </Badge>
                    {!k.aktif && <Badge variant="outline" className="text-xs rounded-full text-muted-foreground">Pasif</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{k.email}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {k.sirketler.length > 0 ? k.sirketler.map(s => (
                      <span key={s.sirketId} className="inline-flex items-center gap-1 text-xs bg-muted rounded-full px-2 py-0.5">
                        <Building2 className="h-2.5 w-2.5 text-muted-foreground" />
                        {sirketAd(s.sirketId)}
                        {s.rol !== "muhasebeci" && (
                          <span className={`font-medium ${s.rol === "salt_okunur" ? "text-muted-foreground" : "text-primary"}`}>
                            · {ROL_ETIKET[s.rol]?.label ?? s.rol}
                          </span>
                        )}
                      </span>
                    )) : (
                      <span className="text-xs text-muted-foreground">Şirket atanmamış</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => acDialog(k)} data-testid={`button-kullanici-duzenle-${k.id}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8 rounded-full text-destructive hover:text-destructive"
                    onClick={() => { setSilHedef(k); setSilDialogAcik(true); }}
                    data-testid={`button-kullanici-sil-${k.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {kullanicilar.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Henüz kullanıcı eklenmemiş.</p>
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogAcik} onOpenChange={setDialogAcik}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{secili ? "Kullanıcı Düzenle" : "Yeni Kullanıcı"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Ad Soyad</Label>
              <Input value={form.ad} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))} placeholder="Ad Soyad" data-testid="input-kullanici-ad" />
            </div>
            <div className="space-y-1.5">
              <Label>E-posta</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="kullanici@ornek.com" data-testid="input-kullanici-email" />
            </div>
            <div className="space-y-1.5">
              <Label>{secili ? "Yeni Parola (boş = değiştirme)" : "Parola"}</Label>
              <Input type="password" value={form.parola} onChange={e => setForm(f => ({ ...f, parola: e.target.value }))} placeholder="••••••••" data-testid="input-kullanici-parola" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Global Rol</Label>
                <Select value={form.rol} onValueChange={v => setForm(f => ({ ...f, rol: v }))}>
                  <SelectTrigger className="rounded-lg" data-testid="select-kullanici-rol"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yonetici">Yönetici</SelectItem>
                    <SelectItem value="muhasebeci">Muhasebeci</SelectItem>
                    <SelectItem value="salt_okunur">Salt Okunur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Durum</Label>
                <Select value={form.aktif ? "aktif" : "pasif"} onValueChange={v => setForm(f => ({ ...f, aktif: v === "aktif" }))}>
                  <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aktif">Aktif</SelectItem>
                    <SelectItem value="pasif">Pasif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Şirket Erişimi</Label>
              <p className="text-xs text-muted-foreground">Her şirket için ayrı erişim seviyesi belirleyin.</p>
              <div className="space-y-2 rounded-lg border p-3 max-h-48 overflow-y-auto">
                {(sirketler as Array<{ id: number; ad: string }>).map((s) => {
                  const atama = form.sirketler.find(x => x.sirketId === s.id);
                  const checked = !!atama;
                  return (
                    <div key={s.id} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => sirketToggle(s.id, e.target.checked)}
                        className="rounded border-gray-300 h-4 w-4 cursor-pointer"
                      />
                      <span className="flex-1 text-sm">{s.ad}</span>
                      {checked && (
                        <Select
                          value={atama!.rol}
                          onValueChange={rol => sirketRolGuncelle(s.id, rol)}
                        >
                          <SelectTrigger className="w-36 h-7 text-xs rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="muhasebeci">Muhasebeci</SelectItem>
                            <SelectItem value="salt_okunur">Salt Okunur</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })}
                {sirketler.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">Henüz şirket eklenmemiş.</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setDialogAcik(false)}>İptal</Button>
            <Button className="rounded-full" onClick={kaydet} data-testid="button-kullanici-kaydet">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={silDialogAcik} onOpenChange={o => { setSilDialogAcik(o); if (!o) setSilHedef(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kullanıcıyı Sil</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{silHedef?.ad}</strong> kullanıcısı kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={sil} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
