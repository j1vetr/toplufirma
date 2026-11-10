import { useMemo, useState } from "react";
import {
  useGetFinansalRapor, getGetFinansalRaporQueryKey,
  useListFirmalar, getListFirmalarQueryKey,
  type GetFinansalRaporParams,
} from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSirket } from "@/contexts/sirket-context";
import { RaporFiltreleri } from "@/components/raporlar/rapor-filtreleri";
import { Iskelet, HataDurumu } from "@/components/raporlar/rapor-ortak";
import { GenelBakis } from "@/components/raporlar/genel-bakis";
import { KirilimSekmesi } from "@/components/raporlar/kirilim-sekmesi";
import { YaslandirmaSekmesi } from "@/components/raporlar/yaslandirma-sekmesi";
import { KdvSekmesi } from "@/components/raporlar/kdv-sekmesi";
import { donemEtiketi, fmtTarihSaat, type RaporBaglam } from "@/lib/rapor-bicim";

const SEKMELER = [
  { deger: "genel", ad: "Genel bakış" },
  { deger: "musteri", ad: "Müşteri" },
  { deger: "gemi", ad: "Gemi" },
  { deger: "yaslandirma", ad: "Alacak yaşlandırma" },
  { deger: "kdv", ad: "KDV" },
];

export default function Raporlar() {
  const { aktifSirketId, setAktifSirketId } = useSirket();
  const [yil, setYil] = useState(() => new Date().getFullYear());
  const [ay, setAy] = useState<number | null>(null);
  const [paraBirimi, setParaBirimi] = useState("USD");

  const { data: catiFirmalar = [] } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );

  const params = useMemo<GetFinansalRaporParams>(() => ({
    ...(aktifSirketId && aktifSirketId > 0 ? { catiFirmaId: aktifSirketId } : {}),
    yil,
    ...(ay ? { ay } : {}),
    paraBirimi,
  }), [aktifSirketId, yil, ay, paraBirimi]);

  const sorgu = useGetFinansalRapor(params, {
    query: {
      queryKey: getGetFinansalRaporQueryKey(params),
      staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true,
    },
  });
  const r = sorgu.data;

  const firmaAd = catiFirmalar.find((f) => f.id === aktifSirketId)?.ad ?? "Tüm firmalar";
  const baglam: RaporBaglam | null = r ? { paraBirimi: r.paraBirimi, yil: r.yil, ay: r.ay, firmaAd } : null;

  const hataMesaji = sorgu.error
    ? sorgu.error.message || "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin."
    : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 border-b pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">FİNANSAL RAPOR</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl" data-testid="text-rapor-baslik">
            {firmaAd} <span className="text-muted-foreground">/ {donemEtiketi(yil, ay)}</span>
          </h1>
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            <span className="bg-primary px-1.5 py-0.5 font-mono font-bold text-primary-foreground">{r?.paraBirimi ?? paraBirimi}</span>
            {sorgu.isFetching ? "Güncelleniyor" : r ? `Hesaplama ${fmtTarihSaat(r.hesaplamaTarihi)}` : ""}
          </p>
        </div>
        <RaporFiltreleri
          firmalar={catiFirmalar}
          firmaId={aktifSirketId}
          onFirma={setAktifSirketId}
          yil={yil}
          yillar={r?.yillar ?? []}
          onYil={setYil}
          ay={ay}
          onAy={setAy}
          paraBirimi={paraBirimi}
          paraBirimleri={r?.paraBirimleri ?? []}
          onParaBirimi={setParaBirimi}
        />
      </div>

      {sorgu.isLoading ? <Iskelet /> : sorgu.isError && !r ? (
        <HataDurumu mesaj={hataMesaji} onRetry={() => void sorgu.refetch()} />
      ) : r && baglam ? (
        <div className={`transition-opacity ${sorgu.isPlaceholderData ? "pointer-events-none opacity-60" : ""}`}>
          {sorgu.isError && (
            <div className="mb-4"><HataDurumu mesaj={hataMesaji} onRetry={() => void sorgu.refetch()} /></div>
          )}
          <Tabs defaultValue="genel">
            <TabsList className="h-auto w-full justify-start gap-0 overflow-x-auto rounded-none border-b bg-transparent p-0">
              {SEKMELER.map((s) => (
                <TabsTrigger
                  key={s.deger}
                  value={s.deger}
                  className="shrink-0 rounded-none border-b-2 border-transparent px-4 py-2.5 text-xs font-semibold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                  data-testid={`tab-${s.deger}`}
                >
                  {s.ad}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="genel" className="mt-5"><GenelBakis r={r} b={baglam} /></TabsContent>
            <TabsContent value="musteri" className="mt-5"><KirilimSekmesi tur="musteri" satirlar={r.musteriler} b={baglam} /></TabsContent>
            <TabsContent value="gemi" className="mt-5"><KirilimSekmesi tur="gemi" satirlar={r.gemiler} b={baglam} /></TabsContent>
            <TabsContent value="yaslandirma" className="mt-5"><YaslandirmaSekmesi dilimler={r.yaslandirma} b={baglam} /></TabsContent>
            <TabsContent value="kdv" className="mt-5"><KdvSekmesi kdv={r.kdv} b={baglam} /></TabsContent>
          </Tabs>
        </div>
      ) : null}
    </div>
  );
}
