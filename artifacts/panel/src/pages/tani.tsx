import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Ship, Building2, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const apiBase = () => {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api`;
};

interface BagliFirma {
  id: number;
  ad: string;
  baglantiYolu: string;
  ustFirmaId: number | null;
  grupFirmaId: number | null;
}

interface EslesenGemi {
  id: number;
  ad: string;
  imoNumarasi: string | null;
  firmaId: number | null;
  firmaAd: string | null;
  aktif: boolean;
}

interface CatiAnaliz {
  id: number;
  ad: string;
  bagliFirmaAdedi: number;
  gemiAdedi: number;
  bagliFirmalar: BagliFirma[];
  eslesenGemiler: EslesenGemi[];
}

interface EslesmeyenGemi {
  id: number;
  ad: string;
  imoNumarasi: string | null;
  firmaId: number | null;
  firmaAd: string | null;
  firmaTip: string | null;
  ustFirmaId: number | null;
  grupFirmaId: number | null;
  sorun: string;
}

interface AnalizSonucu {
  ozet: {
    toplamGemi: number;
    eslesen: number;
    eslesmeyen: number;
    catiFirmaAdedi: number;
  };
  catiAnalizler: CatiAnaliz[];
  eslesmeyen: EslesmeyenGemi[];
}

function CatiKart({ cati }: { cati: CatiAnaliz }) {
  const [acik, setAcik] = useState(false);

  return (
    <Card className="rounded-none border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            {cati.ad}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {cati.bagliFirmaAdedi} bağlı firma
            </Badge>
            <Badge variant={cati.gemiAdedi > 0 ? "default" : "destructive"} className="text-xs">
              {cati.gemiAdedi} gemi
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {cati.gemiAdedi === 0 && (
          <div className="flex items-start gap-2 rounded-none bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Bu çatı firma seçildiğinde hiçbir gemi görünmüyor. Bağlı firma sayısı: {cati.bagliFirmaAdedi}</span>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs px-2 rounded-none"
          onClick={() => setAcik(!acik)}
        >
          {acik ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
          Detayları {acik ? "gizle" : "göster"}
        </Button>

        {acik && (
          <div className="space-y-4 border-t pt-3">
            {cati.bagliFirmaAdedi === 0 ? (
              <p className="text-sm text-muted-foreground">Bu çatı firmaya bağlı hiçbir firma bulunamadı.</p>
            ) : (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Bağlı Firmalar</p>
                <div className="space-y-1">
                  {cati.bagliFirmalar.map(bf => (
                    <div key={bf.id} className="flex items-center justify-between text-sm py-1.5 px-2 bg-muted/40 rounded-none">
                      <span className="font-medium">{bf.ad}</span>
                      <span className="text-xs text-muted-foreground">{bf.baglantiYolu}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {cati.eslesenGemiler.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Eşleşen Gemiler</p>
                <div className="space-y-1">
                  {cati.eslesenGemiler.map(g => (
                    <div key={g.id} className="flex items-center gap-2 text-sm py-1.5 px-2 bg-green-50 dark:bg-green-950/30 rounded-none">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      <span className="font-medium">{g.ad}</span>
                      {g.imoNumarasi && <span className="text-xs text-muted-foreground">IMO: {g.imoNumarasi}</span>}
                      <span className="text-xs text-muted-foreground ml-auto">↳ {g.firmaAd}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Tani() {
  const { data, isLoading, error, refetch } = useQuery<AnalizSonucu>({
    queryKey: ["debug-firma-analizi"],
    queryFn: async () => {
      const token = localStorage.getItem("panel_token") ?? "";
      const r = await fetch(`${apiBase()}/debug/firma-analizi`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Analiz alınamadı");
      return r.json();
    },
    staleTime: 0,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Firma & Gemi Bağlantı Tanısı</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Hangi gemilerin hangi çatı firmaya bağlı olduğunu ve neden görünmediğini gösterir.
          </p>
        </div>
        <Button variant="outline" size="sm" className="rounded-none" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Yenile
        </Button>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground animate-pulse">Analiz yapılıyor…</div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-none bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Analiz yüklenemedi.
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Özet kartlar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Toplam Gemi", value: data.ozet.toplamGemi, icon: Ship, color: "text-foreground" },
              { label: "Eşleşen", value: data.ozet.eslesen, icon: CheckCircle2, color: "text-green-600" },
              { label: "Eşleşemeyen", value: data.ozet.eslesmeyen, icon: AlertTriangle, color: data.ozet.eslesmeyen > 0 ? "text-destructive" : "text-muted-foreground" },
              { label: "Çatı Firma", value: data.ozet.catiFirmaAdedi, icon: Building2, color: "text-primary" },
            ].map(item => (
              <Card key={item.label} className="rounded-none border">
                <CardContent className="p-4">
                  <div className={cn("flex items-center gap-2 mb-1", item.color)}>
                    <item.icon className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">{item.label}</span>
                  </div>
                  <p className={cn("text-3xl font-bold", item.color)}>{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Çatı firma analizleri */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Çatı Firma Analizleri
            </h3>
            {data.catiAnalizler.length === 0 ? (
              <p className="text-sm text-muted-foreground">Erişiminiz olan çatı firma bulunamadı.</p>
            ) : (
              <div className="space-y-3">
                {data.catiAnalizler.map(c => (
                  <CatiKart key={c.id} cati={c} />
                ))}
              </div>
            )}
          </div>

          {/* Eşleşemeyen gemiler */}
          {data.eslesmeyen.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Eşleşemeyen Gemiler — Herhangi Bir Çatı Firma Seçildiğinde Görünmüyorlar
              </h3>
              <div className="space-y-2">
                {data.eslesmeyen.map(g => (
                  <Card key={g.id} className="rounded-none border border-destructive/40">
                    <CardContent className="p-4 flex flex-col sm:flex-row sm:items-start gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Ship className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{g.ad}</p>
                          {g.imoNumarasi && <p className="text-xs text-muted-foreground">IMO: {g.imoNumarasi}</p>}
                          {g.firmaAd && (
                            <p className="text-xs text-muted-foreground">
                              Bağlı: {g.firmaAd}
                              {g.firmaTip && <span className="ml-1 text-muted-foreground/60">({g.firmaTip})</span>}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start gap-2 sm:ml-auto bg-destructive/10 border border-destructive/20 rounded-none px-3 py-2 max-w-sm">
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                        <p className="text-xs text-destructive">{g.sorun}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {data.eslesmeyen.length === 0 && data.ozet.toplamGemi > 0 && (
            <div className="flex items-center gap-2 rounded-none bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Tüm gemiler en az bir çatı firmaya doğru bağlı.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
