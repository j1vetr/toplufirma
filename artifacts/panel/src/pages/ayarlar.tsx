import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, Trash2, ShieldAlert, DatabaseBackup, CheckCircle2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function getToken() {
  return localStorage.getItem("panel_token") ?? "";
}

export default function Ayarlar() {
  const { toast } = useToast();

  const [yedekYukleniyor, setYedekYukleniyor] = useState(false);
  const [yuklemeYukleniyor, setYuklemeYukleniyor] = useState(false);
  const [silOnayAcik, setSilOnayAcik] = useState(false);
  const [silOnayKod, setSilOnayKod] = useState("");
  const [silYukleniyor, setSilYukleniyor] = useState(false);
  const dosyaInputRef = useRef<HTMLInputElement>(null);

  async function yedegiIndir() {
    setYedekYukleniyor(true);
    try {
      const r = await fetch("/api/admin/yedek", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        toast({ title: "Hata", description: j.error ?? "Yedek alınamadı", variant: "destructive" });
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = r.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? "yedek.sql";
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Yedek indirildi", description: a.download });
    } catch {
      toast({ title: "Hata", description: "Yedek indirilemedi", variant: "destructive" });
    } finally {
      setYedekYukleniyor(false);
    }
  }

  async function yedegiYukle(e: React.ChangeEvent<HTMLInputElement>) {
    const dosya = e.target.files?.[0];
    if (!dosya) return;
    e.target.value = "";

    setYuklemeYukleniyor(true);
    try {
      const r = await fetch("/api/admin/yedek-yukle", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/octet-stream",
        },
        body: dosya,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast({ title: "Hata", description: j.error ?? "İçe aktarma başarısız", variant: "destructive" });
      } else {
        toast({ title: "Başarılı", description: j.mesaj ?? "Yedek içe aktarıldı" });
      }
    } catch {
      toast({ title: "Hata", description: "Sunucuya bağlanılamadı", variant: "destructive" });
    } finally {
      setYuklemeYukleniyor(false);
    }
  }

  async function tumuSil() {
    if (silOnayKod !== "EVET_SIL") {
      toast({ title: "Onay kodu yanlış", description: '"EVET_SIL" yazmanız gerekiyor', variant: "destructive" });
      return;
    }
    setSilYukleniyor(true);
    try {
      const r = await fetch("/api/admin/tum-verileri-sil", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ onay: silOnayKod }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast({ title: "Hata", description: j.error ?? "Silinemedi", variant: "destructive" });
      } else {
        toast({ title: "Tüm veriler silindi", description: j.mesaj });
        setSilOnayAcik(false);
        setSilOnayKod("");
      }
    } catch {
      toast({ title: "Hata", description: "Sunucuya bağlanılamadı", variant: "destructive" });
    } finally {
      setSilYukleniyor(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="max-w-2xl space-y-6">

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <DatabaseBackup className="h-5 w-5 text-primary" />
              <CardTitle>Veritabanı Yedekleme</CardTitle>
            </div>
            <CardDescription>
              Tüm veritabanını SQL formatında dışa aktarın veya daha önce aldığınız bir yedeği içe aktarın.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Yedek Al (Dışa Aktar)</p>
              <p className="text-xs text-muted-foreground">
                Tüm tablo verilerini içeren bir <code>.sql</code> dosyası indirilir.
              </p>
              <Button
                onClick={yedegiIndir}
                disabled={yedekYukleniyor}
                className="w-fit"
                variant="outline"
              >
                {yedekYukleniyor ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Yedeği İndir
              </Button>
            </div>

            <div className="border-t pt-4 flex flex-col gap-2">
              <p className="text-sm font-medium">Yedek Yükle (İçe Aktar)</p>
              <p className="text-xs text-muted-foreground">
                Daha önce bu sistemden alınmış bir <code>.sql</code> yedek dosyasını seçin.
                Mevcut verilerle çakışabilir — önce yedek aldığınızdan emin olun.
              </p>
              <input
                ref={dosyaInputRef}
                type="file"
                accept=".sql,text/plain,application/octet-stream"
                className="hidden"
                onChange={yedegiYukle}
              />
              <Button
                onClick={() => dosyaInputRef.current?.click()}
                disabled={yuklemeYukleniyor}
                className="w-fit"
                variant="outline"
              >
                {yuklemeYukleniyor ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Yedek Dosyası Seç
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              <CardTitle className="text-destructive">Tehlikeli Bölge</CardTitle>
            </div>
            <CardDescription>
              Bu işlemler geri alınamaz. Devam etmeden önce yedek almanızı şiddetle öneririz.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold">Tüm İş Verilerini Sil</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Firmalar, gemiler, faturalar, ödemeler, ekipmanlar, banka hesapları ve tekrarlayan fatura
                  şablonlarının <strong>tamamı silinir</strong>. Kullanıcı hesapları korunur.
                </p>
              </div>
              <Button
                variant="destructive"
                className="w-fit"
                onClick={() => { setSilOnayKod(""); setSilOnayAcik(true); }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Tüm Verileri Sil
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={silOnayAcik} onOpenChange={setSilOnayAcik}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              Tüm verileri silmek istediğinizden emin misiniz?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Bu işlem <strong>geri alınamaz</strong>. Firmalar, gemiler, faturalar, ödemeler
                ve tüm ilgili kayıtlar kalıcı olarak silinecektir.
              </span>
              <span className="block mt-3">
                Onaylamak için aşağıya{" "}
                <code className="font-bold text-destructive bg-destructive/10 px-1 rounded">EVET_SIL</code>{" "}
                yazın:
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2">
            <Input
              value={silOnayKod}
              onChange={(e) => setSilOnayKod(e.target.value)}
              placeholder="EVET_SIL"
              className="border-destructive focus-visible:ring-destructive"
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSilOnayKod("")}>İptal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); tumuSil(); }}
              disabled={silOnayKod !== "EVET_SIL" || silYukleniyor}
            >
              {silYukleniyor ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Evet, Tüm Verileri Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
