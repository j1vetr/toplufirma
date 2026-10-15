import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetFirmaSilmeBaglantilari, getGetFirmaSilmeBaglantilariQueryKey, useDeleteFirma } from "@workspace/api-client-react";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog";

export function FirmaSilDialog({ id, open, onOpenChange, onDeleted }: {
  id: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [arama, setArama] = useState("");
  const sorgu = useGetFirmaSilmeBaglantilari(id, {
    query: { queryKey: getGetFirmaSilmeBaglantilariQueryKey(id), enabled: open && id > 0, staleTime: 0, refetchOnWindowFocus: true, retry: false },
  });
  const silme = useDeleteFirma();
  const baglantilar = sorgu.data?.baglantilar ?? [];
  const terim = arama.trim().toLocaleLowerCase("tr-TR");
  const gorunenler = baglantilar.filter(b =>
    `${b.tur} ${b.ad} ${b.detay} ${b.id}`.toLocaleLowerCase("tr-TR").includes(terim));

  function sil() {
    silme.mutate({ id }, {
      onSuccess: () => {
        void qc.invalidateQueries();
        onOpenChange(false);
        toast({ title: "Firma silindi" });
        onDeleted?.();
      },
      onError: err => {
        toast({ title: err instanceof Error ? err.message : "Firma silinemedi", variant: "destructive" });
        // A new dependency may have been created since the preview loaded.
        void sorgu.refetch();
      },
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={o => { if (!silme.isPending) onOpenChange(o); }}>
      <AlertDialogContent className="max-w-xl max-h-[90dvh] flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle>{sorgu.data?.firmaAd ?? "Firma"} kaydını sil</AlertDialogTitle>
          <AlertDialogDescription>
            Silmeyi engelleyen tüm doğrudan bağlantılar aşağıda listelenir. Pasif kayıtlar,
            taslak ve iptal faturalar ile faturası silinmiş ödemeler de kontrol edilir.
            Hiçbir alt kayıt otomatik silinmez.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium" aria-live="polite">
            {sorgu.isFetching ? "Bağlantılar kontrol ediliyor..." : `${baglantilar.length} bağlı kayıt`}
          </p>
          <Button type="button" size="sm" variant="outline" disabled={sorgu.isFetching || silme.isPending}
            onClick={() => void sorgu.refetch()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Yenile
          </Button>
        </div>
        {sorgu.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Bağlı kayıtlar yüklenemedi. Güvenlik için silme kapalı. Yenile düğmesiyle tekrar deneyin.
          </p>
        ) : sorgu.data && !sorgu.isFetching && baglantilar.length === 0 ? (
          <p className="text-sm">Silmeyi engelleyen kayıt bulunamadı. Bu firma kalıcı olarak silinebilir. Bu işlem geri alınamaz.</p>
        ) : null}
        {baglantilar.length > 0 && !sorgu.isError && (
          <>
            <div className="flex gap-2 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Önce aşağıdaki kayıtları temizleyin veya ilgili firma bağlantısını değiştirin.
                Bağlı firmayı açarak onun alt kayıtlarını da kontrol edebilirsiniz.</span>
            </div>
            <Input aria-label="Bağlı kayıtlarda ara" placeholder="Tür, ad, belge no veya tutar ile ara..."
              value={arama} onChange={e => setArama(e.target.value)} />
            <div className="min-h-0 overflow-y-auto border divide-y" data-testid="firma-silme-baglantilari">
              {gorunenler.length === 0 && <p className="p-3 text-sm text-muted-foreground">Aramanıza uygun kayıt yok. Diğer bağlantılar silmeyi engellemeye devam ediyor.</p>}
              {gorunenler.map(b => (
                <div key={`${b.tur}-${b.id}`} className="p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 text-sm">
                    <p className="text-xs text-muted-foreground">{b.tur} · #{b.id}</p>
                    <p className="font-medium break-words">{b.ad}</p>
                    <p className="text-xs text-muted-foreground break-words mt-1">{b.detay}</p>
                  </div>
                  <Link href={b.href} onClick={() => onOpenChange(false)}
                    className="inline-flex items-center gap-1 text-sm text-primary shrink-0">
                    Kayda git <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={silme.isPending}>Kapat</AlertDialogCancel>
          <Button variant="destructive" onClick={sil}
            disabled={silme.isPending || sorgu.isFetching || sorgu.isError || !sorgu.data || baglantilar.length > 0}>
            {silme.isPending ? "Siliniyor..." : "Kalıcı olarak sil"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
