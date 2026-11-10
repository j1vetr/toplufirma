import {
  useListFaturalar, getListFaturalarQueryKey, useListFirmalar, getListFirmalarQueryKey,
  type Fatura,
} from "@workspace/api-client-react";
import { FirmaSecici } from "@/components/firma-secici";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import TahsilatIslemBilgisi from "@/components/tahsilat-islem-bilgisi";
import { odenebilirFaturalariFiltrele } from "@/lib/cari-fatura-secimi";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

interface Props {
  enabled: boolean;
  catiFirmaId?: number | null;
  firmaId?: number | null;
  grupFirmaId?: number | null;
  bagliFirmaIds?: number[];
  gemiId?: number | null;
  onSelect: (fatura: Fatura | Fatura[]) => void;
}

export function CariFaturaOdemeSecimi({ enabled, catiFirmaId, firmaId, grupFirmaId, bagliFirmaIds, gemiId, onSelect }: Props) {
  const [coklu, setCoklu] = useState(false);
  const [secilenIds, setSecilenIds] = useState<number[]>([]);
  const [arama, setArama] = useState("");
  useEffect(() => {
    setCoklu(false);
    setSecilenIds([]);
    setArama("");
  }, [enabled, catiFirmaId, firmaId, grupFirmaId, gemiId]);
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
  const secilenler = faturalar.filter(f => secilenIds.includes(f.id));
  const ilk = secilenler[0];
  const gorunenler = faturalar.filter(f => [f.faturaNo, f.gemiAd, f.bagliFirmaAd].filter(Boolean).join(" ")
    .toLocaleLowerCase("tr-TR").includes(arama.toLocaleLowerCase("tr-TR")));

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
      <><div className="flex gap-2">
        <Button type="button" size="sm" variant={coklu ? "outline" : "secondary"} onClick={() => setCoklu(false)}>Tek Fatura</Button>
        <Button type="button" size="sm" variant={coklu ? "secondary" : "outline"} onClick={() => setCoklu(true)}
          data-testid="button-coklu-fatura-sec">Birden Fazla Fatura</Button>
      </div>
      {coklu ? <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Aynı bağlı firma ve para birimindeki en fazla 100 faturayı birlikte seçebilirsiniz.</p>
        <Input aria-label="Faturalarda ara" placeholder="Fatura, gemi veya firma ara" value={arama} onChange={e => setArama(e.target.value)} />
        <div className="max-h-60 space-y-2 overflow-y-auto">
          {gorunenler.map(f => {
            const secili = secilenIds.includes(f.id);
            const uyumsuz = !!ilk && (f.bagliFirmaId !== ilk.bagliFirmaId || f.paraBirimi !== ilk.paraBirimi);
            return <label key={f.id} className={`flex items-start gap-2 border p-2 text-sm ${uyumsuz ? "opacity-50" : ""}`}>
              <Checkbox checked={secili} disabled={!secili && (uyumsuz || secilenler.length >= 100)}
                aria-label={`${f.faturaNo} seç`}
                onCheckedChange={checked => setSecilenIds(ids => checked ? [...ids, f.id] : ids.filter(id => id !== f.id))} />
              <span>{[f.faturaNo, f.gemiAd, f.bagliFirmaAd].filter(Boolean).join(" - ")}
                <span className="block text-xs text-muted-foreground">
                  Kalan: {(f.kalanTutar ?? f.genelToplam - (f.odenenTutar ?? 0)).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {f.paraBirimi}
                  {uyumsuz && " (farklı firma veya para birimi)"}
                </span>
              </span>
            </label>;
          })}
          {!gorunenler.length && <p className="text-sm text-muted-foreground">Aramaya uygun fatura yok.</p>}
        </div>
        <Button type="button" disabled={!secilenler.length || query.isFetching}
          data-testid="button-toplu-odeme-ac" onClick={() => onSelect(secilenler)}>
          Seçilen Faturalara Dağıt ({secilenler.length})
        </Button>
      </div> : <FirmaSecici
        firmalar={faturalar.map(f => ({
          id: f.id,
          ad: [f.faturaNo, f.gemiAd, f.bagliFirmaAd].filter(Boolean).join(" - "),
          etiket: `${(f.kalanTutar ?? f.genelToplam - (f.odenenTutar ?? 0)).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${f.paraBirimi}`,
        }))}
        value=""
        placeholder="Fatura numarası, gemi veya firma ile arayın"
        testId="select-cari-odeme-fatura"
        onChange={id => { const fatura = faturalar.find(f => f.id === Number(id)); if (fatura) onSelect(fatura); }}
      />}</>}
    <p className="text-xs text-muted-foreground">
      Fatura seçerseniz ortak Ödeme Kaydet penceresi açılır. Çoklu seçimde her faturaya ayrılan tutarı girip tek tahsilatı birlikte dağıtabilirsiniz.
    </p>
    <p className="text-xs text-muted-foreground">
      Fatura seçmezseniz aşağıdaki tutar yeni, bağımsız tahsilat olarak kaydedilir. Cari bakiye azalır, faturalar otomatik kapatılmaz.
    </p>
    {!!grupFirmaId && !firmaId && <p className="text-xs text-muted-foreground">
      Grup geneline girilen tahsilat, bağlı firmanın faturasına doğrudan saydırılamaz. Mevcut tahsilattan karşılamak için tahsilat ve fatura aynı bağlı firmaya ait olmalıdır.
    </p>}
  </div>;
}
