import { useState } from "react";
import { useRoute, Link } from "wouter";
import {
  useGetFirma, getGetFirmaQueryKey,
  useListFaturalar, getListFaturalarQueryKey,
  useListOdemeler, getListOdemelerQueryKey,
  useListGemiler, getListGemilerQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Building2, Plus, FileText, ChevronRight, AlertCircle,
  CreditCard, Ship, TrendingDown, TrendingUp, Wallet,
} from "lucide-react";

const DURUM_RENK: Record<string, string> = {
  taslak: "bg-slate-500/10 text-slate-500",
  acik: "bg-orange-500/10 text-orange-600",
  kismi_odendi: "bg-yellow-500/10 text-yellow-600",
  odendi: "bg-green-500/10 text-green-600",
  iptal: "bg-gray-500/10 text-gray-500",
};
const DURUM_ETIKET: Record<string, string> = {
  taslak: "Taslak", acik: "Açık", kismi_odendi: "Kısmi Ödendi", odendi: "Ödendi", iptal: "İptal",
};
const YONTEM_ETIKET: Record<string, string> = {
  banka_havalesi: "Banka Havalesi", eft: "EFT", nakit: "Nakit",
  kredi_karti: "Kredi Kartı", wise: "Wise", paypal: "PayPal", diger: "Diğer",
};

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

type Sekme = "faturalar" | "odemeler" | "gemiler";

export default function BagliFirmaDetay() {
  const [, params] = useRoute("/firmalar/bagli/:id");
  const id = Number(params?.id);
  const [aktifSekme, setAktifSekme] = useState<Sekme>("faturalar");

  const { data: firma, isLoading: firmaYukleniyor } = useGetFirma(id, {
    query: { enabled: !!id, queryKey: getGetFirmaQueryKey(id) },
  });

  const { data: faturalar = [], isLoading: faturalarYukleniyor } = useListFaturalar(
    { bagliFirmaId: id },
    { query: { enabled: !!id, queryKey: [...getListFaturalarQueryKey(), "bagli-detay", id] } },
  );

  const { data: odemeler = [], isLoading: odemelerYukleniyor } = useListOdemeler(
    { bagliFirmaId: id },
    { query: { enabled: !!id, queryKey: [...getListOdemelerQueryKey(), "bagli-detay", id] } },
  );

  const { data: gemiler = [], isLoading: gemilerYukleniyor } = useListGemiler(
    { firmaId: id },
    { query: { enabled: !!id, queryKey: [...getListGemilerQueryKey(), "bagli-detay", id] } },
  );

  const bugun = new Date().toISOString().split("T")[0];

  const bakiye: Record<string, { borc: number; tahsilat: number; kalan: number }> = {};
  for (const f of faturalar) {
    if (!bakiye[f.paraBirimi]) bakiye[f.paraBirimi] = { borc: 0, tahsilat: 0, kalan: 0 };
    bakiye[f.paraBirimi].borc += f.genelToplam;
    bakiye[f.paraBirimi].kalan += (f.kalanTutar ?? 0);
  }
  for (const o of odemeler) {
    if (o.tip === "tahsilat") {
      if (!bakiye[o.paraBirimi]) bakiye[o.paraBirimi] = { borc: 0, tahsilat: 0, kalan: 0 };
      bakiye[o.paraBirimi].tahsilat += o.tutar;
    }
  }

  function yeniFaturaAc() {
    if (!firma) return;
    sessionStorage.setItem(
      "fatura_kopya",
      JSON.stringify({ catiFirmaId: firma.ustFirmaId, bagliFirmaId: firma.id }),
    );
  }

  if (firmaYukleniyor) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-24 bg-muted rounded-none" />
        <div className="h-32 bg-muted rounded-none" />
        <div className="h-64 bg-muted rounded-none" />
      </div>
    );
  }

  if (!firma) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>Firma bulunamadı.</p>
        <Link href="/firmalar"><Button variant="outline" className="mt-4">Firmalar</Button></Link>
      </div>
    );
  }

  const SEKMELER: { key: Sekme; label: string; sayac: number }[] = [
    { key: "faturalar", label: "Faturalar", sayac: faturalar.length },
    { key: "odemeler", label: "Ödemeler", sayac: odemeler.length },
    { key: "gemiler", label: "Gemiler", sayac: gemiler.length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Link href="/firmalar">
          <Button variant="ghost" size="icon" className="rounded-sm mt-0.5 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-12 h-12 rounded-sm bg-blue-500/10 flex items-center justify-center shrink-0 overflow-hidden">
              {firma.logoUrl ? (
                <img src={firma.logoUrl} alt={firma.ad} className="w-full h-full object-contain" />
              ) : (
                <Building2 className="h-6 w-6 text-blue-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-display font-semibold">{firma.ad}</h1>
                <Badge variant="outline" className="text-xs text-blue-600 border-blue-200">Bağlı Firma</Badge>
                {!firma.aktif && <Badge variant="secondary" className="text-xs">Pasif</Badge>}
                {firma.etiket && (
                  <Badge className="text-xs bg-[#ffed00] text-black border-0 hover:bg-[#ffed00]">{firma.etiket}</Badge>
                )}
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                {firma.grupFirmaAd && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />Çatı: {firma.grupFirmaAd}
                  </span>
                )}
                {firma.vergiNo && <span>VKN: {firma.vergiNo}</span>}
                {firma.vergiDairesi && <span>{firma.vergiDairesi} VD</span>}
                {firma.eposta && <span>{firma.eposta}</span>}
                {firma.telefon && <span>{firma.telefon}</span>}
                {firma.adres && <span className="truncate max-w-xs">{firma.adres}</span>}
              </div>
            </div>
          </div>
        </div>
        <Link href="/faturalar/yeni">
          <Button size="sm" className="shrink-0" onClick={yeniFaturaAc}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Yeni Fatura
          </Button>
        </Link>
      </div>

      {Object.keys(bakiye).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(bakiye).map(([pb, val]) => (
            <div key={pb} className="border border-border p-4 space-y-3">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{pb}</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <TrendingDown className="h-3.5 w-3.5 text-red-500" /> Toplam Borç
                  </span>
                  <span className="font-mono font-semibold">{fmt(val.borc, pb)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5 text-green-500" /> Tahsilat
                  </span>
                  <span className="font-mono font-semibold text-green-600">{fmt(val.tahsilat, pb)}</span>
                </div>
                <div className="border-t border-border pt-2 flex items-center justify-between text-sm font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5" /> Kalan
                  </span>
                  <span className={`font-mono ${val.kalan > 0 ? "text-orange-600" : "text-green-600"}`}>
                    {fmt(val.kalan, pb)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="flex border-b border-border mb-4">
          {SEKMELER.map(s => (
            <button
              key={s.key}
              onClick={() => setAktifSekme(s.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 -mb-px ${
                aktifSekme === s.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
              {s.sayac > 0 && (
                <span className={`text-[10px] font-bold h-4 min-w-4 px-1 rounded-sm flex items-center justify-center ${
                  aktifSekme === s.key ? "bg-primary text-black" : "bg-muted text-muted-foreground"
                }`}>{s.sayac}</span>
              )}
            </button>
          ))}
        </div>

        {aktifSekme === "faturalar" && (
          <div className="space-y-2">
            {faturalarYukleniyor && (
              <div className="animate-pulse space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-none" />)}
              </div>
            )}
            {!faturalarYukleniyor && faturalar.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>Bu firmaya ait fatura bulunamadı.</p>
                <Link href="/faturalar/yeni">
                  <Button size="sm" variant="outline" className="mt-3" onClick={yeniFaturaAc}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Fatura Oluştur
                  </Button>
                </Link>
              </div>
            )}
            {faturalar.map(f => {
              const vadesiGecmis = f.vadeTarihi < bugun && (f.durum === "acik" || f.durum === "kismi_odendi");
              return (
                <Card key={f.id} className={vadesiGecmis ? "border-red-300" : ""}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`p-2 rounded-sm shrink-0 ${vadesiGecmis ? "bg-red-500/10" : "bg-orange-500/10"}`}>
                      {vadesiGecmis
                        ? <AlertCircle className="h-4 w-4 text-red-500" />
                        : <FileText className="h-4 w-4 text-orange-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/faturalar/${f.id}`} className="font-semibold hover:text-primary">{f.faturaNo}</Link>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DURUM_RENK[f.durum]}`}>{DURUM_ETIKET[f.durum]}</span>
                        {vadesiGecmis && <span className="text-xs text-red-500 font-medium">Vadesi Geçmiş</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {f.faturaTarihi} - Vade: {f.vadeTarihi}
                        {f.gemiAd ? ` - ${f.gemiAd}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-sm">{fmt(f.genelToplam, f.paraBirimi)}</p>
                      {(f.kalanTutar ?? 0) > 0 && f.durum !== "odendi" && (
                        <p className="text-xs text-muted-foreground">Kalan: {fmt(f.kalanTutar ?? 0, f.paraBirimi)}</p>
                      )}
                    </div>
                    <Link href={`/faturalar/${f.id}`}>
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {aktifSekme === "odemeler" && (
          <div className="space-y-2">
            {odemelerYukleniyor && (
              <div className="animate-pulse space-y-2">
                {[1, 2].map(i => <div key={i} className="h-14 bg-muted rounded-none" />)}
              </div>
            )}
            {!odemelerYukleniyor && odemeler.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>Bu firmaya ait tahsilat bulunamadı.</p>
              </div>
            )}
            {odemeler.map(o => (
              <div key={o.id} className="flex items-center justify-between p-4 border border-border">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-sm shrink-0 ${o.tip === "tahsilat" ? "bg-green-500/10" : "bg-red-500/10"}`}>
                    <CreditCard className={`h-4 w-4 ${o.tip === "tahsilat" ? "text-green-500" : "text-red-500"}`} />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{YONTEM_ETIKET[o.odemeYontemi] ?? o.odemeYontemi}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.tarih}
                      {o.faturaNo && (
                        <> - <Link href={`/faturalar/${o.faturaId}`} className="hover:text-primary">{o.faturaNo}</Link></>
                      )}
                      {o.aciklama && <> - {o.aciklama}</>}
                    </p>
                  </div>
                </div>
                <span className={`font-mono font-semibold text-sm ${o.tip === "tahsilat" ? "text-green-600" : "text-red-500"}`}>
                  {o.tip === "tahsilat" ? "+" : "-"}{fmt(o.tutar, o.paraBirimi)}
                </span>
              </div>
            ))}
          </div>
        )}

        {aktifSekme === "gemiler" && (
          <div className="space-y-2">
            {gemilerYukleniyor && (
              <div className="animate-pulse space-y-2">
                {[1, 2].map(i => <div key={i} className="h-14 bg-muted rounded-none" />)}
              </div>
            )}
            {!gemilerYukleniyor && gemiler.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Ship className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>Bu firmaya kayıtlı gemi bulunamadı.</p>
              </div>
            )}
            {gemiler.map(g => (
              <div key={g.id} className="flex items-center justify-between p-4 border border-border">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-sm bg-blue-500/10 shrink-0">
                    <Ship className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{g.ad}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        g.imoNumarasi ? `IMO: ${g.imoNumarasi}` : null,
                        g.bayrakDevleti ?? null,
                        g.aktifPlan ?? null,
                      ].filter(Boolean).join(" - ")}
                    </p>
                  </div>
                </div>
                <Link href={`/gemiler/${g.id}`}>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
