import { useQueryClient } from "@tanstack/react-query";
import { useGetFaturaTahsilatEslesmeleri, getGetFaturaTahsilatEslesmeleriQueryKey, useDeleteFaturaTahsilatEslesme } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useYetki } from "@/hooks/use-yetki";

export default function FaturaTahsilatEslesmeleri({ id, paraBirimi }: { id: number; paraBirimi: string }) {
  const query = useGetFaturaTahsilatEslesmeleri(id, { query: { queryKey: getGetFaturaTahsilatEslesmeleriQueryKey(id), staleTime: 0 } });
  const sil = useDeleteFaturaTahsilatEslesme();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { canWrite } = useYetki();
  return <Card>
    <CardHeader><CardTitle className="text-base">Mevcut Tahsilattan Karşılananlar</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-xs text-muted-foreground">Bu eşleştirmeler yeni para girişi değildir. Tahsilatlar caride yalnızca bir kez yer alır.</p>
      {query.isLoading ? <p className="text-sm">Yükleniyor...</p> : query.isError ? <Button variant="outline" onClick={() => query.refetch()}>Alınamadı, tekrar dene</Button> :
        !query.data?.eslesmeler.length ? <p className="text-sm text-muted-foreground">Bu faturaya saydırılmış mevcut tahsilat yok.</p> :
          query.data.eslesmeler.map(e => <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
            <div>
              <p>{new Date(`${e.tarih}T12:00:00`).toLocaleDateString("tr-TR")} tarihli tahsilat #{e.tahsilatId}</p>
              <p className="text-muted-foreground">{e.aciklama}</p>
              <p className="font-medium">{e.tutar.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {paraBirimi}</p>
            </div>
            {canWrite && <Button size="sm" variant="outline" disabled={sil.isPending} onClick={() => {
              if (!window.confirm("Eşleştirme kaldırılsın mı? Tahsilat silinmez, tutar yeniden kullanılabilir olur.")) return;
              sil.mutate({ id, eslesmeId: e.id }, {
                onSuccess: () => { qc.invalidateQueries(); toast({ title: "Eşleştirme kaldırıldı. Tahsilat korundu." }); },
                onError: () => toast({ title: "Eşleştirme kaldırılamadı", variant: "destructive" }),
              });
            }}>Eşleştirmeyi kaldır</Button>}
          </div>)}
    </CardContent>
  </Card>;
}
