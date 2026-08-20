import { useRef, useState } from "react";
import { useRoute } from "wouter";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetGemi, getGetGemiQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useYetki } from "@/hooks/use-yetki";
import { ArrowLeft, Camera, FileText, HardDrive, Image, MessageSquarePlus, Trash2, Wrench } from "lucide-react";

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

const DURUM_RENK: Record<string, string> = {
  taslak: "bg-slate-500/10 text-slate-500",
  acik: "bg-orange-500/10 text-orange-600",
  kismi_odendi: "bg-yellow-500/10 text-yellow-600",
  odendi: "bg-green-500/10 text-green-600",
  iptal: "bg-gray-500/10 text-gray-500",
};

const KATEGORI_RENK: Record<string, string> = {
  servis: "bg-blue-100 text-blue-800",
  sozlesme: "bg-purple-100 text-purple-800",
  bakim: "bg-amber-100 text-amber-800",
  diger: "bg-gray-100 text-gray-700",
};

const KATEGORI_LABEL: Record<string, string> = {
  servis: "Servis",
  sozlesme: "Sözleşme",
  bakim: "Bakım",
  diger: "Diğer",
};

interface ServisKayit {
  id: number;
  kategori: string;
  baslik: string;
  tarih: string;
  notlar: string | null;
  dosyalar: { id: number }[];
}

interface GemiNotu {
  id: number;
  metin: string;
  olusturanKullaniciId: number | null;
  olusturmaTarihi: string;
  olusturanAd: string | null;
}

interface GemiFotografi {
  id: number;
  dosyaYolu: string;
  dosyaTipi: string;
  boyut: number;
  orijinalAd: string | null;
  olusturanKullaniciId: number | null;
  olusturmaTarihi: string;
  olusturanAd: string | null;
}

interface GemiGunlugu {
  notlar: GemiNotu[];
  fotograflar: GemiFotografi[];
}

const apiBase = () => `${import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""}/api`;
function getToken() { return localStorage.getItem("panel_token") ?? ""; }
function authHeaders() { return { Authorization: `Bearer ${getToken()}` }; }
function fotoUrl(fotoId: number) {
  return `${apiBase()}/gemi-fotograflari/${fotoId}/dosya?t=${encodeURIComponent(getToken())}`;
}
function tarihSaat(tarih: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(tarih));
}

export default function GemiDetay() {
  const [, params] = useRoute("/gemiler/:id");
  const id = Number(params?.id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { canWrite, rol, kullaniciId } = useYetki();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notDialogAcik, setNotDialogAcik] = useState(false);
  const [notMetni, setNotMetni] = useState("");
  const [notKaydediliyor, setNotKaydediliyor] = useState(false);
  const [fotografYukleniyor, setFotografYukleniyor] = useState(false);
  const { data: gemi, isLoading } = useGetGemi(id, { query: { enabled: !!id, queryKey: getGetGemiQueryKey(id) } });

  const { data: servisKayitlari = [], isLoading: servisYukleniyor } = useQuery<ServisKayit[]>({
    queryKey: ["servis-kayitlari-gemi", id],
    queryFn: async () => {
      if (!id) return [];
      const r = await fetch(`${apiBase()}/servis-kayitlari?gemiId=${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!id,
    staleTime: 30_000,
  });

  const { data: gunluk = { notlar: [], fotograflar: [] }, isLoading: gunlukYukleniyor } = useQuery<GemiGunlugu>({
    queryKey: ["gemi-gunlugu", id],
    queryFn: async () => {
      const r = await fetch(`${apiBase()}/gemiler/${id}/gunluk`, { headers: authHeaders() });
      if (!r.ok) throw new Error("Gemi günlüğü alınamadı");
      return r.json();
    },
    enabled: !!id,
    staleTime: 15_000,
  });

  async function notEkle() {
    const metin = notMetni.trim();
    if (!metin) {
      toast({ title: "Not metni zorunludur", variant: "destructive" });
      return;
    }
    setNotKaydediliyor(true);
    try {
      const r = await fetch(`${apiBase()}/gemiler/${id}/notlar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ metin }),
      });
      if (!r.ok) {
        const hata = await r.json();
        throw new Error(hata.error ?? "Not eklenemedi");
      }
      setNotMetni("");
      setNotDialogAcik(false);
      await qc.invalidateQueries({ queryKey: ["gemi-gunlugu", id] });
      toast({ title: "Not gemi günlüğüne eklendi" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Not eklenemedi", variant: "destructive" });
    } finally {
      setNotKaydediliyor(false);
    }
  }

  async function fotografYukle(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setFotografYukleniyor(true);
    try {
      const form = new FormData();
      for (const file of Array.from(files)) form.append("fotograflar", file);
      const r = await fetch(`${apiBase()}/gemiler/${id}/fotograflar`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      if (!r.ok) {
        const hata = await r.json();
        throw new Error(hata.error ?? "Fotoğraflar yüklenemedi");
      }
      const yeni: GemiFotografi[] = await r.json();
      await qc.invalidateQueries({ queryKey: ["gemi-gunlugu", id] });
      toast({ title: `${yeni.length} fotoğraf gemi günlüğüne eklendi` });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Fotoğraflar yüklenemedi", variant: "destructive" });
    } finally {
      setFotografYukleniyor(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function notSil(notId: number) {
    if (!confirm("Bu not silinsin mi?")) return;
    try {
      const r = await fetch(`${apiBase()}/gemi-notlari/${notId}`, { method: "DELETE", headers: authHeaders() });
      if (!r.ok) throw new Error("Not silinemedi");
      await qc.invalidateQueries({ queryKey: ["gemi-gunlugu", id] });
      toast({ title: "Not silindi" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Not silinemedi", variant: "destructive" });
    }
  }

  async function fotografSil(fotografId: number) {
    if (!confirm("Bu fotoğraf silinsin mi?")) return;
    try {
      const r = await fetch(`${apiBase()}/gemi-fotograflari/${fotografId}`, { method: "DELETE", headers: authHeaders() });
      if (!r.ok) throw new Error("Fotoğraf silinemedi");
      await qc.invalidateQueries({ queryKey: ["gemi-gunlugu", id] });
      toast({ title: "Fotoğraf silindi" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Fotoğraf silinemedi", variant: "destructive" });
    }
  }

  const gunlukKayitlari = [
    ...gunluk.notlar.map(not => ({ tip: "not" as const, id: not.id, tarih: not.olusturmaTarihi, not })),
    ...gunluk.fotograflar.map(fotograf => ({ tip: "fotograf" as const, id: fotograf.id, tarih: fotograf.olusturmaTarihi, fotograf })),
  ].sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
  const silebilirMi = (olusturanKullaniciId: number | null) =>
    canWrite && (rol === "yonetici" || (olusturanKullaniciId != null && olusturanKullaniciId === kullaniciId));

  if (isLoading) return <div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded-none" /><div className="h-64 bg-muted rounded-none" /></div>;
  if (!gemi) return <div className="text-center py-16 text-muted-foreground">Gemi bulunamadı.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/gemiler"><Button variant="ghost" size="icon" className="rounded-sm"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h2 className="text-xl font-display font-semibold">{gemi.ad}</h2>
            <p className="text-sm text-muted-foreground">{gemi.firmaAd}</p>
          </div>
        </div>
        {canWrite && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setNotDialogAcik(true)}>
              <MessageSquarePlus className="mr-1.5 h-4 w-4" />
              Not Ekle
            </Button>
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={fotografYukleniyor}>
              <Camera className="mr-1.5 h-4 w-4" />
              {fotografYukleniyor ? "Optimize ediliyor..." : "Görsel Ekle"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.heic,.heif"
              capture="environment"
              multiple
              onChange={fotografYukle}
            />
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold">Gemi Günlüğü</h3>
              <p className="text-sm text-muted-foreground">Geminin not ve görsel geçmişi</p>
            </div>
            {gunlukKayitlari.length > 0 && <Badge variant="secondary">{gunlukKayitlari.length}</Badge>}
          </div>
          {gunlukYukleniyor ? (
            <div className="animate-pulse space-y-3">
              <div className="h-16 bg-muted rounded-none" />
              <div className="h-16 bg-muted rounded-none" />
            </div>
          ) : gunlukKayitlari.length > 0 ? (
            <div className="space-y-3">
              {gunlukKayitlari.map(kayit => kayit.tip === "not" ? (
                <div key={`not-${kayit.id}`} className="flex gap-3 border-l-2 border-blue-500 pl-3 py-1">
                  <div className="p-2 h-fit rounded-sm bg-blue-500/10"><MessageSquarePlus className="h-4 w-4 text-blue-600" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">Not eklendi</p>
                      {silebilirMi(kayit.not.olusturanKullaniciId) && <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => notSil(kayit.not.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                    <p className="text-sm whitespace-pre-wrap mt-1">{kayit.not.metin}</p>
                    <p className="text-xs text-muted-foreground mt-2">{kayit.not.olusturanAd ?? "Bilinmeyen kullanıcı"} · {tarihSaat(kayit.tarih)}</p>
                  </div>
                </div>
              ) : (
                <div key={`foto-${kayit.id}`} className="flex gap-3 border-l-2 border-amber-500 pl-3 py-1">
                  <div className="p-2 h-fit rounded-sm bg-amber-500/10"><Image className="h-4 w-4 text-amber-600" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">Görsel eklendi</p>
                      {silebilirMi(kayit.fotograf.olusturanKullaniciId) && <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => fotografSil(kayit.fotograf.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                    <a href={fotoUrl(kayit.fotograf.id)} target="_blank" rel="noreferrer" className="block mt-2 w-fit">
                      <img src={fotoUrl(kayit.fotograf.id)} alt={kayit.fotograf.orijinalAd ?? "Gemi görseli"} className="h-32 w-48 max-w-full object-cover border" />
                    </a>
                    <p className="text-xs text-muted-foreground mt-2">{kayit.fotograf.orijinalAd ?? "Fotoğraf"} · {tarihSaat(kayit.tarih)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed py-9 text-center text-muted-foreground">
              <Image className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Henüz gemi günlüğü kaydı yok.</p>
              {canWrite && <p className="text-xs mt-1">Not veya görsel ekleyerek geçmişi oluşturmaya başlayın.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={notDialogAcik} onOpenChange={setNotDialogAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gemi Günlüğüne Not Ekle</DialogTitle>
            <DialogDescription>Bu not, geminin geçmişine tarih ve ekleyen kullanıcı bilgisiyle kaydedilir.</DialogDescription>
          </DialogHeader>
          <Textarea value={notMetni} onChange={e => setNotMetni(e.target.value)} placeholder="Gözlem, kontrol sonucu veya açıklama..." rows={5} maxLength={5000} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotDialogAcik(false)}>İptal</Button>
            <Button onClick={notEkle} disabled={notKaydediliyor}>{notKaydediliyor ? "Kaydediliyor..." : "Notu Ekle"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          {[
            ["IMO Numarası", gemi.imoNumarasi],
            ["Bayrak Devleti", gemi.bayrakDevleti],
            ["Bağlı Firma", gemi.firmaAd],
            ["Durum", gemi.aktif ? "Aktif" : "Pasif"],
          ].map(([etiket, deger]) => deger ? (
            <div key={etiket}><p className="text-muted-foreground">{etiket}</p><p className="font-medium mt-0.5">{deger}</p></div>
          ) : null)}
        </CardContent>
      </Card>

      <Tabs defaultValue="ekipmanlar">
        <TabsList className="rounded-none">
          <TabsTrigger value="ekipmanlar" className="rounded-none">Ekipmanlar</TabsTrigger>
          <TabsTrigger value="faturalar" className="rounded-none">Faturalar</TabsTrigger>
          <TabsTrigger value="servis" className="rounded-none">
            Servis & Sözleşme
            {servisKayitlari.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 font-semibold">
                {servisKayitlari.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ekipmanlar" className="mt-4">
          <Card>
            <CardContent className="p-4 space-y-2">
              {gemi.ekipmanlar && gemi.ekipmanlar.length > 0 ? gemi.ekipmanlar.map(e => (
                <div key={e.id} className="flex items-center gap-4 py-3 border-b last:border-0">
                  <div className="p-2 rounded-sm bg-purple-500/10"><HardDrive className="h-4 w-4 text-purple-500" /></div>
                  <div className="flex-1">
                    <p className="font-medium">{e.tip}</p>
                    <p className="text-xs text-muted-foreground">Seri: {e.seriNo}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {e.garantiBitisTarihi && <p>Garanti: {e.garantiBitisTarihi}</p>}
                    <Badge variant={e.aktif ? "default" : "secondary"} className="mt-1">{e.aktif ? "Aktif" : "Pasif"}</Badge>
                  </div>
                </div>
              )) : <p className="text-center text-muted-foreground py-8">Ekipman kaydı yok.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="faturalar" className="mt-4">
          <Card>
            <CardContent className="p-4 space-y-2">
              {gemi.faturalar && gemi.faturalar.length > 0 ? gemi.faturalar.map(f => (
                <div key={f.id} className="flex items-center gap-4 py-3 border-b last:border-0 text-sm">
                  <div className="p-2 rounded-sm bg-orange-500/10"><FileText className="h-4 w-4 text-orange-500" /></div>
                  <div className="flex-1">
                    <Link href={`/faturalar/${f.id}`} className="font-medium hover:text-primary">{f.faturaNo}</Link>
                    <p className="text-xs text-muted-foreground">{f.faturaTarihi}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${DURUM_RENK[f.durum]}`}>{f.durum}</span>
                    <p className="font-semibold mt-1">{fmt(f.genelToplam, f.paraBirimi)}</p>
                  </div>
                </div>
              )) : <p className="text-center text-muted-foreground py-8">Fatura kaydı yok.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="servis" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {servisYukleniyor ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-10 bg-muted rounded-none" />
                  <div className="h-10 bg-muted rounded-none" />
                </div>
              ) : servisKayitlari.length > 0 ? (
                <div className="divide-y">
                  {servisKayitlari.map(k => (
                    <Link
                      key={k.id}
                      href={`/servis/${k.id}`}
                      className="flex items-start gap-3 py-3 hover:bg-muted/30 transition-colors cursor-pointer -mx-2 px-2"
                      data-testid={`link-servis-kayit-${k.id}`}
                    >
                      <div className="p-2 rounded-sm bg-blue-500/10 shrink-0">
                        <Wrench className="h-4 w-4 text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 font-medium ${KATEGORI_RENK[k.kategori] ?? "bg-gray-100 text-gray-700"}`}>
                            {KATEGORI_LABEL[k.kategori] ?? k.kategori}
                          </span>
                          <span className="font-medium text-sm">{k.baslik}</span>
                          {k.dosyalar?.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              · {k.dosyalar.length} dosya
                            </span>
                          )}
                        </div>
                        {k.notlar && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{k.notlar}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{k.tarih}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10">
                  <Wrench className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Bu gemiye ait servis veya sözleşme kaydı yok.</p>
                  <Link href="/servis">
                    <Button variant="outline" size="sm" className="mt-3">
                      Servis sayfasına git
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
