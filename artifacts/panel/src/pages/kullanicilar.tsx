import { useState } from "react";
import { Plus, Pencil, Trash2, ShieldCheck, Eye, BookOpen, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useListSirketler } from "@workspace/api-client-react";
import type { KullaniciInfo } from "@/App";

interface Kullanici {
  id: number;
  ad: string;
  email: string;
  rol: string;
  aktif: boolean;
  olusturmaTarihi: string;
  sirketler: Array<{ sirketId: number; rol: string }>;
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
  const [secili, setSecili] = useState<Kullanici | null>(null);
  const [form, setForm] = useState({ ad: "", email: "", parola: "", rol: "muhasebeci", sirketler: [] as number[] });

  const { data: sirketlerData } = useListSirketler();
  const sirketler = sirketlerData ?? [];

  async function listele() {
    setYukleniyor(true);
    try {
      const token = localStorage.getItem("panel_token");
      const r = await fetch("/api/kullanicilar", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setKullanicilar(await r.json());
    } finally { setYukleniyor(false); }
  }

  useState(() => { listele(); });

  function acDialog(k?: Kullanici) {
    if (k) {
      setSecili(k);
      setForm({ ad: k.ad, email: k.email, parola: "", rol: k.rol, sirketler: k.sirketler.map(s => s.sirketId) });
    } else {
      setSecili(null);
      setForm({ ad: "", email: "", parola: "", rol: "muhasebeci", sirketler: [] });
    }
    setDialogAcik(true);
  }

  async function kaydet() {
    const token = localStorage.getItem("panel_token");
    const body = {
      ...form,
      sirketler: form.sirketler.map(sid => ({ sirketId: sid, rol: form.rol })),
      ...(form.parola ? {} : { parola: undefined }),
    };
    if (!form.parola) delete (body as Record<string, unknown>).parola;

    const url = secili ? `/api/kullanicilar/${secili.id}` : "/api/kullanicilar";
    const method = secili ? "PUT" : "POST";
    const r = await fetch(url, {
      method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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

  async function sil(k: Kullanici) {
    if (!confirm(`"${k.ad}" kullanıcısı silinsin mi?`)) return;
    const token = localStorage.getItem("panel_token");
    const r = await fetch(`/api/kullanicilar/${k.id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) { toast({ title: "Kullanıcı silindi" }); listele(); }
    else { const d = await r.json(); toast({ title: "Hata", description: d.error, variant: "destructive" }); }
  }

  function sirketAd(id: number) {
    return sirketler.find((s: { id: number; ad: string }) => s.id === id)?.ad ?? `Şirket #${id}`;
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
        <Button onClick={() => acDialog()} className="rounded-full gap-2">
          <Plus className="h-4 w-4" /> Yeni Kullanıcı
        </Button>
      </div>

      {yukleniyor ? (
        <div className="text-center py-16 text-muted-foreground">Yükleniyor…</div>
      ) : (
        <div className="grid gap-3">
          {kullanicilar.map(k => (
            <Card key={k.id} className="border-none shadow-sm">
              <CardContent className="flex items-center gap-4 py-4 px-5">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{k.ad}</span>
                    <Badge className={`text-xs flex items-center gap-1 px-2 py-0 rounded-full ${rolRenk(k.rol)}`}>
                      {ROL_ETIKET[k.rol]?.icon}
                      {ROL_ETIKET[k.rol]?.label ?? k.rol}
                    </Badge>
                    {!k.aktif && <Badge variant="outline" className="text-xs rounded-full text-muted-foreground">Pasif</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{k.email}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {k.sirketler.length > 0
                      ? k.sirketler.map(s => sirketAd(s.sirketId)).join(" · ")
                      : "Şirket atanmamış"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => acDialog(k)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-destructive hover:text-destructive" onClick={() => sil(k)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
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
              <Input value={form.ad} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))} placeholder="Ad Soyad" />
            </div>
            <div className="space-y-1.5">
              <Label>E-posta</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="kullanici@ornek.com" />
            </div>
            <div className="space-y-1.5">
              <Label>{secili ? "Yeni Parola (boş = değiştirme)" : "Parola"}</Label>
              <Input type="password" value={form.parola} onChange={e => setForm(f => ({ ...f, parola: e.target.value }))} placeholder="••••••••" />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={form.rol} onValueChange={v => setForm(f => ({ ...f, rol: v }))}>
                <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yonetici">Yönetici</SelectItem>
                  <SelectItem value="muhasebeci">Muhasebeci</SelectItem>
                  <SelectItem value="salt_okunur">Salt Okunur</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Şirket Erişimi</Label>
              <div className="space-y-2">
                {(sirketler as Array<{ id: number; ad: string }>).map((s) => (
                  <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.sirketler.includes(s.id)}
                      onChange={e => {
                        setForm(f => ({
                          ...f,
                          sirketler: e.target.checked
                            ? [...f.sirketler, s.id]
                            : f.sirketler.filter(id => id !== s.id),
                        }));
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">{s.ad}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setDialogAcik(false)}>İptal</Button>
            <Button className="rounded-full" onClick={kaydet}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
