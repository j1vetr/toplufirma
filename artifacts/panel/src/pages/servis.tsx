import { useState, useRef, useEffect } from "react";
import { useListFirmalar, getListFirmalarQueryKey, useListGemiler, getListGemilerQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Upload, X, Image, FileText, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { useSirket } from "@/contexts/sirket-context";

const KATEGORILER = [
  { value: "servis", label: "Servis", color: "bg-blue-100 text-blue-800" },
  { value: "sozlesme", label: "Sözleşme", color: "bg-purple-100 text-purple-800" },
  { value: "bakim", label: "Bakım", color: "bg-amber-100 text-amber-800" },
  { value: "diger", label: "Diğer", color: "bg-gray-100 text-gray-700" },
];

function kategoriRenk(k: string) {
  return KATEGORILER.find(x => x.value === k)?.color ?? "bg-gray-100 text-gray-700";
}
function kategoriLabel(k: string) {
  return KATEGORILER.find(x => x.value === k)?.label ?? k;
}

interface ServisDosya {
  id: number;
  servisId: number;
  dosyaYolu: string;
  dosyaTipi: string | null;
  boyut: number | null;
  orijinalAd: string | null;
  olusturmaTarihi: string;
}

interface ServisKayit {
  id: number;
  catiFirmaId: number;
  gemiId: number;
  kategori: string;
  baslik: string;
  tarih: string;
  notlar: string | null;
  gemiAd: string | null;
  gemiImo: string | null;
  olusturmaTarihi: string;
  dosyalar: ServisDosya[];
}

const apiBase = () => {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api`;
};

function authHeaders() {
  const token = localStorage.getItem("panel_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function dosyaUrl(dosyaId: number) {
  const t = localStorage.getItem("panel_token") ?? "";
  return `${apiBase()}/servis-dosyalari/${dosyaId}/dosya?t=${encodeURIComponent(t)}`;
}

function formatBytes(b: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();

interface KayitFormProps {
  catiFirmaId: string;
  gemiler: Array<{ id: number; ad: string; imoNumarasi: string | null; catiFirmaId: number | null }>;
  mevcut: ServisKayit | null;
  onClose: () => void;
  onSaved: () => void;
}

function KayitForm({ catiFirmaId, gemiler, mevcut, onClose, onSaved }: KayitFormProps) {
  const { toast } = useToast();
  const [gemiId, setGemiId] = useState(mevcut ? String(mevcut.gemiId) : "");
  const [kategori, setKategori] = useState(mevcut?.kategori ?? "servis");
  const [baslik, setBaslik] = useState(mevcut?.baslik ?? "");
  const [tarih, setTarih] = useState(mevcut?.tarih ?? today);
  const [notlar, setNotlar] = useState(mevcut?.notlar ?? "");
  const [kayitYapiliyor, setKayitYapiliyor] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [dosyalar, setDosyalar] = useState<ServisDosya[]>(mevcut?.dosyalar ?? []);
  const [yuklemeProgress, setYuklemeProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtreliGemiler = gemiler.filter(g => !catiFirmaId || g.catiFirmaId === Number(catiFirmaId));

  async function handleSave() {
    if (!gemiId || !baslik || !tarih) {
      toast({ title: "Hata", description: "Gemi, başlık ve tarih zorunlu", variant: "destructive" });
      return;
    }
    setKayitYapiliyor(true);
    try {
      const url = mevcut ? `${apiBase()}/servis-kayitlari/${mevcut.id}` : `${apiBase()}/servis-kayitlari`;
      const method = mevcut ? "PATCH" : "POST";
      const body = mevcut
        ? { kategori, baslik, tarih, notlar: notlar || null }
        : { catiFirmaId: Number(catiFirmaId), gemiId: Number(gemiId), kategori, baslik, tarih, notlar: notlar || null };
      const resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error ?? "Hata"); }
      toast({ title: mevcut ? "Kayıt güncellendi" : "Kayıt oluşturuldu" });
      onSaved();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Hata", variant: "destructive" });
    } finally {
      setKayitYapiliyor(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !files.length || !mevcut) return;
    setYukleniyor(true);
    setYuklemeProgress(`${files.length} dosya yükleniyor...`);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("dosyalar", f);
      const resp = await fetch(`${apiBase()}/servis-kayitlari/${mevcut.id}/dosyalar`, {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error ?? "Yükleme hatası"); }
      const yeni: ServisDosya[] = await resp.json();
      setDosyalar(prev => [...prev, ...yeni]);
      toast({ title: `${yeni.length} dosya yüklendi` });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Yükleme hatası", variant: "destructive" });
    } finally {
      setYukleniyor(false);
      setYuklemeProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDosyaSil(dosyaId: number) {
    try {
      const resp = await fetch(`${apiBase()}/servis-dosyalari/${dosyaId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!resp.ok) throw new Error("Silme hatası");
      setDosyalar(prev => prev.filter(d => d.id !== dosyaId));
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Silinemedi", variant: "destructive" });
    }
  }

  const isImage = (tipi: string | null) => tipi?.startsWith("image/") ?? false;

  return (
    <div className="space-y-4">
      {!mevcut && (
        <div className="space-y-1.5">
          <Label>Gemi *</Label>
          <Select value={gemiId} onValueChange={setGemiId}>
            <SelectTrigger><SelectValue placeholder="Gemi seçin" /></SelectTrigger>
            <SelectContent>
              {filtreliGemiler.map(g => (
                <SelectItem key={g.id} value={String(g.id)}>
                  {g.ad}{g.imoNumarasi ? ` — IMO: ${g.imoNumarasi}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Kategori *</Label>
          <Select value={kategori} onValueChange={setKategori}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {KATEGORILER.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tarih *</Label>
          <Input type="date" value={tarih} onChange={e => setTarih(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Başlık *</Label>
        <Input value={baslik} onChange={e => setBaslik(e.target.value)} placeholder="Kayıt başlığı" />
      </div>

      <div className="space-y-1.5">
        <Label>Not</Label>
        <Textarea value={notlar} onChange={e => setNotlar(e.target.value)} rows={3} placeholder="Detaylar, gözlemler..." />
      </div>

      {mevcut && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Fotoğraf / Dosya</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={yukleniyor}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {yukleniyor ? (yuklemeProgress ?? "Yükleniyor...") : "Dosya Ekle"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx"
              capture="environment"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
          {dosyalar.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {dosyalar.map(d => (
                <div key={d.id} className="relative group border bg-muted/20 overflow-hidden">
                  {isImage(d.dosyaTipi) ? (
                    <a href={dosyaUrl(d.id)} target="_blank" rel="noreferrer">
                      <img
                        src={`${dosyaUrl(d.id)}`}
                        alt={d.orijinalAd ?? ""}
                        className="w-full h-20 object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </a>
                  ) : (
                    <div className="h-20 flex flex-col items-center justify-center gap-1 text-muted-foreground">
                      <FileText className="h-6 w-6" />
                      <span className="text-[10px] text-center px-1 truncate max-w-full">{d.orijinalAd}</span>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] px-1 py-0.5 truncate">
                    {formatBytes(d.boyut)}
                  </div>
                  <button
                    onClick={() => handleDosyaSil(d.id)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {dosyalar.length === 0 && (
            <div className="border-2 border-dashed border-muted-foreground/20 p-6 text-center text-sm text-muted-foreground">
              <Image className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
              Henüz dosya yok. Fotoğraf veya belge ekleyin.
            </div>
          )}
        </div>
      )}

      {!mevcut && (
        <p className="text-xs text-muted-foreground">Kayıt oluşturduktan sonra fotoğraf ve dosya ekleyebilirsiniz.</p>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" onClick={onClose}>İptal</Button>
        <Button onClick={handleSave} disabled={kayitYapiliyor}>
          {kayitYapiliyor ? "Kaydediliyor..." : mevcut ? "Güncelle" : "Oluştur"}
        </Button>
      </div>
    </div>
  );
}

function GemiGrubu({ gemiAd, gemiImo, kayitlar, onEdit, onDelete, catiFirmaId, gemiler }: {
  gemiAd: string;
  gemiImo: string | null;
  kayitlar: ServisKayit[];
  onEdit: (k: ServisKayit) => void;
  onDelete: (id: number) => void;
  catiFirmaId: string;
  gemiler: Array<{ id: number; ad: string; imoNumarasi: string | null; catiFirmaId: number | null }>;
}) {
  const [acik, setAcik] = useState(true);
  return (
    <div className="border">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setAcik(a => !a)}
      >
        <div>
          <span className="font-semibold text-sm">{gemiAd}</span>
          {gemiImo && <span className="ml-2 text-xs text-muted-foreground">IMO: {gemiImo}</span>}
          <span className="ml-3 text-xs text-muted-foreground">{kayitlar.length} kayıt</span>
        </div>
        {acik ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {acik && (
        <div className="divide-y">
          {kayitlar.map(k => (
            <KayitSatiri key={k.id} kayit={k} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function KayitSatiri({ kayit, onEdit, onDelete }: {
  kayit: ServisKayit;
  onEdit: (k: ServisKayit) => void;
  onDelete: (id: number) => void;
}) {
  const [detayAcik, setDetayAcik] = useState(false);
  const fotograflar = kayit.dosyalar.filter(d => d.dosyaTipi?.startsWith("image/"));
  const belgeler = kayit.dosyalar.filter(d => !d.dosyaTipi?.startsWith("image/"));

  return (
    <div className="px-4 py-3 hover:bg-muted/10 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 font-medium ${kategoriRenk(kayit.kategori)}`}>
              {kategoriLabel(kayit.kategori)}
            </span>
            <span className="font-medium text-sm">{kayit.baslik}</span>
            <span className="text-xs text-muted-foreground ml-auto">{kayit.tarih}</span>
          </div>
          {kayit.notlar && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{kayit.notlar}</p>
          )}
          {kayit.dosyalar.length > 0 && (
            <button
              onClick={() => setDetayAcik(a => !a)}
              className="mt-1.5 text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Image className="h-3 w-3" />
              {fotograflar.length > 0 && `${fotograflar.length} fotoğraf`}
              {fotograflar.length > 0 && belgeler.length > 0 && ", "}
              {belgeler.length > 0 && `${belgeler.length} belge`}
              {detayAcik ? " (gizle)" : " (göster)"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(kayit)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(kayit.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {detayAcik && kayit.dosyalar.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {fotograflar.map(d => (
            <a key={d.id} href={dosyaUrl(d.id)} target="_blank" rel="noreferrer" className="block border overflow-hidden">
              <img
                src={dosyaUrl(d.id)}
                alt={d.orijinalAd ?? ""}
                className="w-full h-16 object-cover hover:opacity-90 transition-opacity"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </a>
          ))}
          {belgeler.map(d => (
            <a key={d.id} href={dosyaUrl(d.id)} target="_blank" rel="noreferrer"
              className="flex flex-col items-center justify-center border h-16 p-2 hover:bg-muted/30 transition-colors text-center">
              <FileText className="h-5 w-5 text-muted-foreground mb-1" />
              <span className="text-[9px] text-muted-foreground truncate w-full text-center">{d.orijinalAd}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Servis() {
  const { aktifSirketId } = useSirket();
  const { toast } = useToast();

  const [kayitlar, setKayitlar] = useState<ServisKayit[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [aramaQ, setAramaQ] = useState("");
  const [kategoriFiltre, setKategoriFiltre] = useState("hepsi");
  const [gemiFiltre, setGemiFiltre] = useState("hepsi");
  const [modalAcik, setModalAcik] = useState(false);
  const [duzenleKayit, setDuzenleKayit] = useState<ServisKayit | null>(null);

  const catiFirmaId = aktifSirketId ? String(aktifSirketId) : "";

  const { data: catiFirmalar = [] } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );
  const { data: gemilerData = [] } = useListGemiler(undefined, { query: { queryKey: getListGemilerQueryKey() } });

  const gemilerTyped = gemilerData as Array<{ id: number; ad: string; imoNumarasi: string | null; firmaId: number; catiFirmaId: number | null }>;

  async function yukle() {
    setYukleniyor(true);
    try {
      const params = new URLSearchParams();
      if (catiFirmaId) params.set("catiFirmaId", catiFirmaId);
      const resp = await fetch(`${apiBase()}/servis-kayitlari?${params}`, { headers: authHeaders() });
      if (!resp.ok) throw new Error("Yükleme hatası");
      setKayitlar(await resp.json());
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Hata", variant: "destructive" });
    } finally {
      setYukleniyor(false);
    }
  }

  useEffect(() => { yukle(); }, [catiFirmaId]);

  async function handleDelete(id: number) {
    if (!confirm("Bu kayıt ve tüm dosyaları silinecek. Onaylıyor musunuz?")) return;
    try {
      const resp = await fetch(`${apiBase()}/servis-kayitlari/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!resp.ok) throw new Error("Silme hatası");
      setKayitlar(prev => prev.filter(k => k.id !== id));
      toast({ title: "Kayıt silindi" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Silinemedi", variant: "destructive" });
    }
  }

  function handleEdit(k: ServisKayit) {
    setDuzenleKayit(k);
    setModalAcik(true);
  }

  function handleYeni() {
    setDuzenleKayit(null);
    setModalAcik(true);
  }

  function handleSaved() {
    setModalAcik(false);
    yukle();
  }

  const filtrelenmis = kayitlar
    .filter(k => !aramaQ || k.baslik.toLowerCase().includes(aramaQ.toLowerCase()) || (k.notlar ?? "").toLowerCase().includes(aramaQ.toLowerCase()))
    .filter(k => kategoriFiltre === "hepsi" || k.kategori === kategoriFiltre)
    .filter(k => gemiFiltre === "hepsi" || String(k.gemiId) === gemiFiltre);

  const gemiGruplari: Record<string, { gemiAd: string; gemiImo: string | null; kayitlar: ServisKayit[] }> = {};
  for (const k of filtrelenmis) {
    const key = String(k.gemiId);
    if (!gemiGruplari[key]) gemiGruplari[key] = { gemiAd: k.gemiAd ?? "Bilinmeyen Gemi", gemiImo: k.gemiImo, kayitlar: [] };
    gemiGruplari[key]!.kayitlar.push(k);
  }

  const gemiSecenekleri = gemilerTyped.filter(g => !catiFirmaId || String(g.catiFirmaId) === catiFirmaId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-display font-semibold">Servis & Sözleşme</h2>
        <Button onClick={handleYeni} disabled={!catiFirmaId}>
          <Plus className="mr-1.5 h-4 w-4" /> Yeni Kayıt
        </Button>
      </div>

      {!catiFirmaId && (
        <div className="border border-dashed p-6 text-center text-sm text-muted-foreground">
          Kayıtları görüntülemek için üst menüden bir firma seçin.
        </div>
      )}

      {catiFirmaId && (
        <>
          <div className="flex flex-wrap gap-3">
            <Input
              value={aramaQ}
              onChange={e => setAramaQ(e.target.value)}
              placeholder="Başlık veya not ara..."
              className="h-9 w-48"
            />
            <Select value={kategoriFiltre} onValueChange={setKategoriFiltre}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hepsi">Tüm Kategoriler</SelectItem>
                {KATEGORILER.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={gemiFiltre} onValueChange={setGemiFiltre}>
              <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hepsi">Tüm Gemiler</SelectItem>
                {gemiSecenekleri.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.ad}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9" onClick={yukle} disabled={yukleniyor}>
              {yukleniyor ? "Yükleniyor..." : "Yenile"}
            </Button>
          </div>

          {yukleniyor && kayitlar.length === 0 ? (
            <div className="animate-pulse space-y-3">
              <div className="h-12 bg-muted rounded-none" />
              <div className="h-32 bg-muted rounded-none" />
            </div>
          ) : filtrelenmis.length === 0 ? (
            <div className="border border-dashed p-10 text-center text-muted-foreground">
              <p className="text-sm">Henüz kayıt yok.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={handleYeni}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> İlk Kaydı Oluştur
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(gemiGruplari).map(([gemiId, grup]) => (
                <GemiGrubu
                  key={gemiId}
                  gemiAd={grup.gemiAd}
                  gemiImo={grup.gemiImo}
                  kayitlar={grup.kayitlar}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  catiFirmaId={catiFirmaId}
                  gemiler={gemiSecenekleri}
                />
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={modalAcik} onOpenChange={open => { if (!open) setModalAcik(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{duzenleKayit ? "Kayıt Düzenle" : "Yeni Servis/Sözleşme Kaydı"}</DialogTitle>
          </DialogHeader>
          <KayitForm
            catiFirmaId={catiFirmaId}
            gemiler={gemiSecenekleri}
            mevcut={duzenleKayit}
            onClose={() => setModalAcik(false)}
            onSaved={handleSaved}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
