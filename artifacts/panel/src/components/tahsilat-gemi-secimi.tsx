import { useListGemiler, getListGemilerQueryKey } from "@workspace/api-client-react";
import { GemiSecici, type GemiSecenek } from "@/components/gemi-secici";
import { Label } from "@/components/ui/label";

/** Ship visibility is resolved by the API, not by the legacy ustFirmaId field. */
export function TahsilatGemiSecimi({ catiFirmaId, value, onChange, firmaIds, disabled }: {
  catiFirmaId: number | null;
  value: string;
  onChange: (id: string, gemi: GemiSecenek | null) => void;
  firmaIds?: number[];
  disabled?: boolean;
}) {
  const sorgu = useListGemiler(catiFirmaId ? { catiFirmaId } : undefined, {
    query: {
      queryKey: [...getListGemilerQueryKey(), "tahsilat", catiFirmaId],
      enabled: !!catiFirmaId,
    },
  });
  const gemiler = (sorgu.data ?? []).filter(g => !firmaIds || firmaIds.includes(g.firmaId));
  return (
    <div className="space-y-1.5">
      <Label>Gemi (isteğe bağlı)</Label>
      <GemiSecici gemiler={gemiler} value={value} onChange={onChange}
        disabled={disabled || !catiFirmaId || sorgu.isLoading || sorgu.isError}
        placeholder={sorgu.isLoading ? "Gemiler yükleniyor..." : "Gemi adı, IMO veya firma ile ara..."} />
      {sorgu.isError ? (
        <p className="text-xs text-destructive">Gemiler yüklenemedi. <button type="button" className="underline" onClick={() => void sorgu.refetch()}>Tekrar dene</button></p>
      ) : (
        <p className="text-xs text-muted-foreground">Gemi seçerseniz kayıt o geminin bağlı firmasına işlenir. Faturaya ödeme yapılmaz.</p>
      )}
    </div>
  );
}
