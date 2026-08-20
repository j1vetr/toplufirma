import { useState, useEffect, useCallback, useRef } from "react";
import DOMPurify from "dompurify";
import { useRoute, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useYetki } from "@/hooks/use-yetki";
import { ArrowLeft, Camera, Pencil, Trash2, FileText, Image, MessageSquarePlus, Ship } from "lucide-react";
import {
  KayitForm,
  kategoriRenk,
  kategoriLabel,
  apiBase,
  authHeaders,
  dosyaUrl,
  formatBytes,
  type ServisKayit,
} from "./servis";

function sanitizeNotlar(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "a",
      "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "code", "pre", "span",
    ],
    ALLOWED_ATTR: ["href", "target", "rel"],
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  });
}

function formatTarih(t: string | null | undefined) {
  if (!t) return "-";
  const d = new Date(t);
  if (isNaN(d.getTime())) return t;
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}

function tarihSaat(t: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(t));
}

interface ServisNotu {
  id: number;
  metin: string;
  olusturanKullaniciId: number | null;
  olusturmaTarihi: string;
  olusturanAd: string | null;
}

interface ServisFotografi {
  id: number;
  dosyaYolu: string;
  dosyaTipi: string;
  boyut: number;
  orijinalAd: string | null;
  olusturanKullaniciId: number | null;
  olusturmaTarihi: string;
  olusturanAd: string | null;
}

interface ServisGunlugu {
  notlar: ServisNotu[];
  fotograflar: ServisFotografi[];
}

function gunlukFotoUrl(fotografId: number) {
  const token = localStorage.getItem("panel_token") ?? "";
  return `${apiBase()}/servis-fotograflari/${fotografId}/dosya?t=${encodeURIComponent(token)}`;
}

export default function ServisDetay() {
  const [, params] = useRoute("/servis/:id");
  const id = Number(params?.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [kayit, setKayit] = useState<ServisKayit | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [duzenleAcik, setDuzenleAcik] = useState(false);
  const { canWrite, rol, kullaniciId } = useYetki();
  const gunlukFotoInputRef = useRef<HTMLInputElement>(null);
  const [gunluk, setGunluk] = useState<ServisGunlugu>({ notlar: [], fotograflar: [] });
  const [gunlukYukleniyor, setGunlukYukleniyor] = useState(true);
  const [notDialogAcik, setNotDialogAcik] = useState(false);
  const [notMetni, setNotMetni] = useState("");
  const [notKaydediliyor, setNotKaydediliyor] = useState(false);
  const [fotografYukleniyor, setFotografYukleniyor] = useState(false);

  const yukle = useCallback(async () => {
    if (!id) return;
    setYukleniyor(true);
    setHata(null);
    try {
      const resp = await fetch(`${apiBase()}/servis-kayitlari/${id}`, { headers: authHeaders() });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.error ?? "Kayıt yüklenemedi");
      }
      setKayit(await resp.json());
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Kayıt yüklenemedi");
    } finally {
      setYukleniyor(false);
    }
  }, [id]);

  useEffect(() => { yukle(); }, [yukle]);

  const gunluguYukle = useCallback(async () => {
    if (!id) return;
    setGunlukYukleniyor(true);
    try {
      const resp = await fetch(`${apiBase()}/servis-kayitlari/${id}/gunluk`, { headers: authHeaders() });
      if (!resp.ok) throw new Error("Servis günlüğü alınamadı");
      setGunluk(await resp.json());
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Servis günlüğü alınamadı", variant: "destructive" });
    } finally {
      setGunlukYukleniyor(false);
    }
  }, [id, toast]);

  useEffect(() => { gunluguYukle(); }, [gunluguYukle]);

  async function notEkle() {
    const metin = notMetni.trim();
    if (!metin) {
      toast({ title: "Not metni zorunludur", variant: "destructive" });
      return;
    }
    setNotKaydediliyor(true);
    try {
      const resp = await fetch(`${apiBase()}/servis-kayitlari/${id}/gunluk/notlar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ metin }),
      });
      if (!resp.ok) {
        const error = await resp.json().catch(() => ({}));
        throw new Error(error.error ?? "Not eklenemedi");
      }
      setNotMetni("");
      setNotDialogAcik(false);
      await gunluguYukle();
      toast({ title: "Not servis günlüğüne eklendi" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Not eklenemedi", variant: "destructive" });
    } finally {
      setNotKaydediliyor(false);
    }
  }

  async function fotografYukle(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files?.length) return;
    setFotografYukleniyor(true);
    try {
      const form = new FormData();
      for (const file of Array.from(files)) form.append("fotograflar", file);
      const resp = await fetch(`${apiBase()}/servis-kayitlari/${id}/gunluk/fotograflar`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      if (!resp.ok) {
        const error = await resp.json().catch(() => ({}));
        throw new Error(error.error ?? "Fotoğraflar yüklenemedi");
      }
      const yeni: ServisFotografi[] = await resp.json();
      await gunluguYukle();
      toast({ title: `${yeni.length} fotoğraf servis günlüğüne eklendi` });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Fotoğraflar yüklenemedi", variant: "destructive" });
    } finally {
      setFotografYukleniyor(false);
      if (gunlukFotoInputRef.current) gunlukFotoInputRef.current.value = "";
    }
  }

  async function notSil(notId: number) {
    if (!confirm("Bu not silinsin mi?")) return;
    try {
      const resp = await fetch(`${apiBase()}/servis-notlari/${notId}`, { method: "DELETE", headers: authHeaders() });
      if (!resp.ok) throw new Error("Not silinemedi");
      await gunluguYukle();
      toast({ title: "Not silindi" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Not silinemedi", variant: "destructive" });
    }
  }

  async function fotografSil(fotografId: number) {
    if (!confirm("Bu fotoğraf silinsin mi?")) return;
    try {
      const resp = await fetch(`${apiBase()}/servis-fotograflari/${fotografId}`, { method: "DELETE", headers: authHeaders() });
      if (!resp.ok) throw new Error("Fotoğraf silinemedi");
      await gunluguYukle();
      toast({ title: "Fotoğraf silindi" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Fotoğraf silinemedi", variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!kayit) return;
    if (!confirm("Bu kayıt ve standart dosyaları silinecek. Servis Günlüğü'nde fotoğraf varsa önce onu silmeniz gerekir. Onaylıyor musunuz?")) return;
    try {
      const resp = await fetch(`${apiBase()}/servis-kayitlari/${kayit.id}`, { method: "DELETE", headers: authHeaders() });
      if (!resp.ok) {
        const error = await resp.json().catch(() => ({}));
        throw new Error(error.error ?? "Silme hatası");
      }
      toast({ title: "Kayıt silindi" });
      navigate("/servis");
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Silinemedi", variant: "destructive" });
    }
  }

  if (yukleniyor) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-muted rounded-none" />
        <div className="h-48 bg-muted rounded-none" />
      </div>
    );
  }

  if (hata || !kayit) {
    return (
      <div className="space-y-4">
        <Link href="/servis">
          <Button variant="ghost" size="sm"><ArrowLeft className="mr-1.5 h-4 w-4" /> Servis Listesi</Button>
        </Link>
        <div className="border border-dashed p-10 text-center text-muted-foreground text-sm">
          {hata ?? "Kayıt bulunamadı."}
        </div>
      </div>
    );
  }

  const fotograflar = kayit.dosyalar.filter(d => d.dosyaTipi?.startsWith("image/"));
  const belgeler = kayit.dosyalar.filter(d => !d.dosyaTipi?.startsWith("image/"));
  const notlarHtmlMi = !!kayit.notlar && /<[a-z][\s\S]*>/i.test(kayit.notlar);
  const gunlukKayitlari = [
    ...gunluk.notlar.map(not => ({ tip: "not" as const, id: not.id, tarih: not.olusturmaTarihi, not })),
    ...gunluk.fotograflar.map(fotograf => ({ tip: "fotograf" as const, id: fotograf.id, tarih: fotograf.olusturmaTarihi, fotograf })),
  ].sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
  const silebilirMi = (olusturanKullaniciId: number | null) =>
    canWrite && (rol === "yonetici" || (olusturanKullaniciId != null && olusturanKullaniciId === kullaniciId));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/servis">
            <Button variant="ghost" size="icon" className="rounded-sm shrink-0"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2 py-0.5 font-medium ${kategoriRenk(kayit.kategori)}`}>
                {kategoriLabel(kayit.kategori)}
              </span>
              <h2 className="text-xl font-display font-semibold truncate">{kayit.baslik}</h2>
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Ship className="h-3.5 w-3.5" />
              {kayit.gemiAd ?? "Bilinmeyen Gemi"}
              {kayit.gemiImo && <span className="text-xs">· IMO: {kayit.gemiImo}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canWrite && (
            <>
              <Button variant="outline" size="sm" onClick={() => setNotDialogAcik(true)}>
                <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" /> Not Ekle
              </Button>
              <Button size="sm" onClick={() => gunlukFotoInputRef.current?.click()} disabled={fotografYukleniyor}>
                <Camera className="mr-1.5 h-3.5 w-3.5" /> {fotografYukleniyor ? "Optimize ediliyor..." : "Görsel Ekle"}
              </Button>
              <input
                ref={gunlukFotoInputRef}
                type="file"
                className="hidden"
                accept="image/*,.heic,.heif"
                capture="environment"
                multiple
                onChange={fotografYukle}
              />
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setDuzenleAcik(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Düzenle
          </Button>
          <Button variant="outline" size="sm" className="text-destructive" onClick={handleDelete}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Sil
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Kategori</p>
              <p className="font-medium">{kategoriLabel(kayit.kategori)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Tarih</p>
              <p className="font-medium">{formatTarih(kayit.tarih)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Oluşturma Tarihi</p>
              <p className="font-medium">{formatTarih(kayit.olusturmaTarihi)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Dosya</p>
              <p className="font-medium">
                {kayit.dosyalar.length === 0
                  ? "Yok"
                  : [
                      fotograflar.length > 0 ? `${fotograflar.length} fotoğraf` : null,
                      belgeler.length > 0 ? `${belgeler.length} belge` : null,
                    ].filter(Boolean).join(", ")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold">Servis Günlüğü</h3>
              <p className="text-sm text-muted-foreground">Bu kayıt için eklenen not ve görseller</p>
            </div>
            {gunlukKayitlari.length > 0 && <span className="text-xs bg-muted px-2 py-1 rounded-sm">{gunlukKayitlari.length}</span>}
          </div>
          {gunlukYukleniyor ? (
            <div className="animate-pulse space-y-3">
              <div className="h-16 bg-muted rounded-none" />
              <div className="h-16 bg-muted rounded-none" />
            </div>
          ) : gunlukKayitlari.length > 0 ? (
            <div className="space-y-3">
              {gunlukKayitlari.map(kayitGunluk => kayitGunluk.tip === "not" ? (
                <div key={`not-${kayitGunluk.id}`} className="flex gap-3 border-l-2 border-blue-500 pl-3 py-1">
                  <div className="p-2 h-fit rounded-sm bg-blue-500/10"><MessageSquarePlus className="h-4 w-4 text-blue-600" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">Not eklendi</p>
                      {silebilirMi(kayitGunluk.not.olusturanKullaniciId) && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => notSil(kayitGunluk.not.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap mt-1">{kayitGunluk.not.metin}</p>
                    <p className="text-xs text-muted-foreground mt-2">{kayitGunluk.not.olusturanAd ?? "Bilinmeyen kullanıcı"} · {tarihSaat(kayitGunluk.tarih)}</p>
                  </div>
                </div>
              ) : (
                <div key={`foto-${kayitGunluk.id}`} className="flex gap-3 border-l-2 border-amber-500 pl-3 py-1">
                  <div className="p-2 h-fit rounded-sm bg-amber-500/10"><Image className="h-4 w-4 text-amber-600" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">Görsel eklendi</p>
                      {silebilirMi(kayitGunluk.fotograf.olusturanKullaniciId) && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => fotografSil(kayitGunluk.fotograf.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <a href={gunlukFotoUrl(kayitGunluk.fotograf.id)} target="_blank" rel="noreferrer" className="block mt-2 w-fit">
                      <img src={gunlukFotoUrl(kayitGunluk.fotograf.id)} alt={kayitGunluk.fotograf.orijinalAd ?? "Servis görseli"} className="h-32 w-48 max-w-full object-cover border" />
                    </a>
                    <p className="text-xs text-muted-foreground mt-2">{kayitGunluk.fotograf.orijinalAd ?? "Fotoğraf"} · {kayitGunluk.fotograf.olusturanAd ?? "Bilinmeyen kullanıcı"} · {tarihSaat(kayitGunluk.tarih)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed py-9 text-center text-muted-foreground">
              <Image className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Henüz servis günlüğü kaydı yok.</p>
              {canWrite && <p className="text-xs mt-1">Not veya görsel ekleyerek geçmişi oluşturmaya başlayın.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Notlar</h3>
        {kayit.notlar ? (
          notlarHtmlMi ? (
            <div
              className="border p-4 text-sm prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: sanitizeNotlar(kayit.notlar) }}
            />
          ) : (
            <div className="border p-4 text-sm whitespace-pre-wrap">{kayit.notlar}</div>
          )
        ) : (
          <div className="border border-dashed p-4 text-sm text-muted-foreground">Not eklenmemiş.</div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Dosyalar</h3>
        {kayit.dosyalar.length === 0 ? (
          <div className="border border-dashed p-6 text-center text-sm text-muted-foreground">
            <Image className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            Henüz dosya yok. Düzenle ekranından fotoğraf veya belge ekleyebilirsiniz.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {fotograflar.map(d => (
              <a key={d.id} href={dosyaUrl(d.id)} target="_blank" rel="noreferrer" className="block border overflow-hidden relative group">
                <img
                  src={dosyaUrl(d.id)}
                  alt={d.orijinalAd ?? ""}
                  className="w-full h-28 object-cover hover:opacity-90 transition-opacity"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1.5 py-0.5 truncate">
                  {d.orijinalAd} {formatBytes(d.boyut) && `· ${formatBytes(d.boyut)}`}
                </div>
              </a>
            ))}
            {belgeler.map(d => (
              <a key={d.id} href={dosyaUrl(d.id)} target="_blank" rel="noreferrer"
                className="flex flex-col items-center justify-center border h-28 p-2 hover:bg-muted/30 transition-colors text-center">
                <FileText className="h-6 w-6 text-muted-foreground mb-1.5" />
                <span className="text-[10px] text-muted-foreground truncate w-full">{d.orijinalAd}</span>
                <span className="text-[10px] text-muted-foreground/70">{formatBytes(d.boyut)}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <Dialog open={duzenleAcik} onOpenChange={open => { if (!open) setDuzenleAcik(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Kayıt Düzenle</DialogTitle>
          </DialogHeader>
          <KayitForm
            catiFirmaId={String(kayit.catiFirmaId)}
            gemiler={[]}
            mevcut={kayit}
            onClose={() => setDuzenleAcik(false)}
            onSaved={() => { setDuzenleAcik(false); yukle(); }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={notDialogAcik} onOpenChange={setNotDialogAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Servis Günlüğüne Not Ekle</DialogTitle>
            <DialogDescription>Bu not, servis kaydının geçmişine tarih ve ekleyen kullanıcı bilgisiyle eklenir.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={notMetni}
            onChange={event => setNotMetni(event.target.value)}
            placeholder="Gözlem, kontrol sonucu veya açıklama..."
            rows={5}
            maxLength={5000}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotDialogAcik(false)}>İptal</Button>
            <Button onClick={notEkle} disabled={notKaydediliyor}>{notKaydediliyor ? "Kaydediliyor..." : "Notu Ekle"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
