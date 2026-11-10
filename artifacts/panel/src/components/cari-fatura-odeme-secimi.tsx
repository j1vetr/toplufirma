import {
  useListFaturalar, getListFaturalarQueryKey, useListFirmalar, getListFirmalarQueryKey,
  type Fatura,
} from "@workspace/api-client-react";
import { FirmaSecici } from "@/components/firma-secici";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import TahsilatIslemBilgisi from "@/components/tahsilat-islem-bilgisi";
import { odenebilirFaturalariFiltrele } from "@/lib/cari-fatura-secimi";

interface Props {
  enabled: boolean;
  catiFirmaId?: number | null;
  firmaId?: number | null;
  grupFirmaId?: number | null;
  bagliFirmaIds?: number[];
  gemiId?: number | null;
  onSelect: (fatura: Fatura) => void;
}

export function CariFaturaOdemeSecimi({ enabled, catiFirmaId, firmaId, grupFirmaId, bagliFirmaIds, gemiId, onSelect }: Props) {
  const hazir = enabled && !!catiFirmaId && (!!firmaId || !!grupFirmaId);
  const params = { catiFirmaId: catiFirmaId ?? 0 };
  const groupParams = { tip: "bagli" as const, catiFirmaId: catiFirmaId ?? 0 };
  const grupFirmalari = useListFirmalar(groupParams, {
    query: { queryKey: getListFirmalarQueryKey(groupParams), enabled: hazir && !!grupFirmaId && !firmaId && !bagliFirmaIds, staleTime: 0 },
  });
  const query = useListFaturalar(params, {
    query: { queryKey: getListFaturalarQueryKey(params), enabled: hazir, staleTime: 0, refetchOnMount: "always" },
  });
  const firmaIds = firmaId ? [firmaId] : grupFirmaId ? [
    grupFirmaId, ...(bagliFirmaIds ?? (grupFirmalari.data ?? []).filter(f => f.grupFirmaId === grupFirmaId).map(f => f.id)),
  ] : [];
  const faturalar = odenebilirFaturalariFiltrele(query.data ?? [], { catiFirmaId: catiFirmaId ?? 0, firmaIds, gemiId });
  const grupBekleniyor = hazir && !!grupFirmaId && !firmaId && !bagliFirmaIds;
  const yukleniyor = hazir && (query.isLoading || (grupBekleniyor && grupFirmalari.isLoading));
  const hatali = hazir && (query.isError || (grupBekleniyor && grupFirmalari.isError));

  return <div className="space-y-2 border p-3" data-testid="cari-fatura-odeme-secimi">
    <div className="flex items-center gap-1">
      <Label>Fatura (isteğe bağlı)</Label>
      <TahsilatIslemBilgisi />
    </div>
    {!hazir ? <p className="text-xs text-muted-foreground">Fatura seçebilmek için önce çatı firma ve cari seçin.</p> :
      yukleniyor ? <p className="text-sm">Faturalar yükleniyor...</p> :
      hatali ? <div className="text-sm">Faturalar alınamadı. <Button type="button" variant="link" onClick={() => {
        void query.refetch();
        if (grupBekleniyor) void grupFirmalari.refetch();
      }}>Tekrar Dene</Button></div> :
      !faturalar.length ? <p className="text-sm text-muted-foreground">Bu seçim için açık veya kısmi ödenmiş fatura yok. Bağımsız tahsilat kaydedebilirsiniz.</p> :
      <FirmaSecici
        firmalar={faturalar.map(f => ({
          id: f.id,
          ad: [f.faturaNo, f.gemiAd, f.bagliFirmaAd].filter(Boolean).join(" - "),
          etiket: `${(f.kalanTutar ?? f.genelToplam - (f.odenenTutar ?? 0)).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${f.paraBirimi}`,
        }))}
        value=""
        placeholder="Fatura numarası, gemi veya firma ile arayın"
        testId="select-cari-odeme-fatura"
        onChange={id => { const fatura = faturalar.find(f => f.id === Number(id)); if (fatura) onSelect(fatura); }}
      />}
    <p className="text-xs text-muted-foreground">
      Fatura seçerseniz ortak Ödeme Kaydet penceresi açılır. Yeni Tahsilat Kaydet veya Tahsilattan Ödendi ile tam ya da kısmi ödeme yapabilirsiniz.
    </p>
    <p className="text-xs text-muted-foreground">
      Fatura seçmezseniz aşağıdaki tutar yeni, bağımsız tahsilat olarak kaydedilir. Cari bakiye azalır, faturalar otomatik kapatılmaz.
    </p>
    {!!grupFirmaId && !firmaId && <p className="text-xs text-muted-foreground">
      Grup geneline girilen tahsilat, bağlı firmanın faturasına doğrudan saydırılamaz. Mevcut tahsilattan karşılamak için tahsilat ve fatura aynı bağlı firmaya ait olmalıdır.
    </p>}
  </div>;
}
