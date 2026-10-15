import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useYetki } from "@/hooks/use-yetki";
import { FirmaSilDialog } from "@/components/firma-sil-dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog";

export function KayitSilButton({ id, tip, ad, onDeleted }: {
  id: number;
  tip: "fatura" | "firma";
  ad: string;
  onDeleted?: () => void;
}) {
  const { canWrite, rol } = useYetki();
  const [acik, setAcik] = useState(false);
  const [bekliyor, setBekliyor] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  if (!canWrite || (tip === "firma" && rol !== "yonetici")) return null;

  async function sil() {
    setBekliyor(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const resp = await fetch(`${base}/api/${tip === "fatura" ? "faturalar" : "firmalar"}/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("panel_token") ?? ""}` },
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? "Kayıt silinemedi");
      }
      await qc.invalidateQueries();
      setAcik(false);
      toast({ title: tip === "fatura" ? "Fatura silindi" : "Firma silindi" });
      onDeleted?.();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Kayıt silinemedi", variant: "destructive" });
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <span onClick={e => e.stopPropagation()}>
      <Button type="button" size="sm" variant="outline" className="text-destructive"
        title={`${ad} kaydını sil`} aria-label={`${ad} kaydını sil`} onClick={() => setAcik(true)}>
        <Trash2 className="h-3.5 w-3.5 mr-1" /> Sil
      </Button>
      {tip === "firma" ? (
        <FirmaSilDialog id={id} open={acik} onOpenChange={setAcik} onDeleted={onDeleted} />
      ) : (
      <AlertDialog open={acik} onOpenChange={o => { if (!bekliyor) setAcik(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ad} kaydı silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              {tip === "fatura"
                ? "Fatura, kalemleri ve bu fatura için otomatik oluşturulan tahsilatlar kalıcı olarak silinecek. Elle girilen ödeme ve tahsilatlar korunacak, faturayla bağlantıları kaldırılacak. Cari bakiye yeniden hesaplanacak."
                : "Firma kalıcı olarak silinecek. Bağlı firmalar, faturalar, ödemeler veya gemiler varsa önce bu kayıtları temizlemeniz gerekir. Alt kayıtlar otomatik silinmez."}
              {" "}Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bekliyor}>İptal</AlertDialogCancel>
            <Button variant="destructive" disabled={bekliyor} onClick={sil}>
              {bekliyor ? "Siliniyor..." : "Kalıcı olarak sil"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}
    </span>
  );
}
