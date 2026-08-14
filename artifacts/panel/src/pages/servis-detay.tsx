import { useState, useEffect, useCallback } from "react";
import DOMPurify from "dompurify";
import { useRoute, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Pencil, Trash2, FileText, Image, Ship } from "lucide-react";
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

export default function ServisDetay() {
  const [, params] = useRoute("/servis/:id");
  const id = Number(params?.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [kayit, setKayit] = useState<ServisKayit | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [duzenleAcik, setDuzenleAcik] = useState(false);

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

  async function handleDelete() {
    if (!kayit) return;
    if (!confirm("Bu kayıt ve tüm dosyaları silinecek. Onaylıyor musunuz?")) return;
    try {
      const resp = await fetch(`${apiBase()}/servis-kayitlari/${kayit.id}`, { method: "DELETE", headers: authHeaders() });
      if (!resp.ok) throw new Error("Silme hatası");
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
    </div>
  );
}
