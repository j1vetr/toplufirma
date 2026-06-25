import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSirket } from "@/contexts/sirket-context";
import { useListFirmalar, getListFirmalarQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, FileText, RotateCcw, Building2 } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface GonderiSatiri {
  id: number;
  kayitTipi: "teklif" | "fatura";
  kayitId: number;
  kayitNo: string | null;
  aliciEposta: string;
  gonderenAd: string | null;
  gonderilmeTarihi: string;
  catiFirmaId: number;
  catiFirmaAd: string | null;
}

async function apiFetch(path: string) {
  const token = localStorage.getItem("panel_token") ?? "";
  const r = await fetch(`${API_BASE}/api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error ?? "İstek başarısız");
  }
  return r.json();
}

function formatTarih(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function GonderiGecmisi() {
  const { aktifSirketId } = useSirket();
  const [, navigate] = useLocation();

  const [filtreFirmaId, setFiltreFirmaId] = useState<string>("tumu");
  const [filtreKayitTipi, setFiltreKayitTipi] = useState<string>("tumu");
  const [filtreAlici, setFiltreAlici] = useState("");
  const [filtreBaslangic, setFiltreBaslangic] = useState("");
  const [filtreBitis, setFiltreBitis] = useState("");

  const { data: firmalar = [] } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );

  function buildQuery() {
    const effectiveFirmaId = aktifSirketId ? String(aktifSirketId) : (filtreFirmaId !== "tumu" ? filtreFirmaId : "");
    const params = new URLSearchParams();
    if (effectiveFirmaId) params.set("catiFirmaId", effectiveFirmaId);
    if (filtreKayitTipi !== "tumu") params.set("kayitTipi", filtreKayitTipi);
    if (filtreAlici.trim()) params.set("aliciEposta", filtreAlici.trim());
    if (filtreBaslangic) params.set("baslangicTarihi", filtreBaslangic);
    if (filtreBitis) params.set("bitisTarihi", filtreBitis);
    return params.toString();
  }

  const queryKey = ["gonderi-gecmisi", aktifSirketId, filtreFirmaId, filtreKayitTipi, filtreAlici, filtreBaslangic, filtreBitis];
  const { data: rows = [], isLoading } = useQuery<GonderiSatiri[]>({
    queryKey,
    queryFn: () => {
      const qs = buildQuery();
      return apiFetch(`/gonderi-gecmisi${qs ? `?${qs}` : ""}`);
    },
  });

  function sifirlaFiltreler() {
    setFiltreFirmaId("tumu");
    setFiltreKayitTipi("tumu");
    setFiltreAlici("");
    setFiltreBaslangic("");
    setFiltreBitis("");
  }

  function kayitLink(row: GonderiSatiri) {
    const path = row.kayitTipi === "fatura"
      ? `/faturalar/${row.kayitId}`
      : `/teklifler?open=${row.kayitId}`;
    navigate(path);
  }

  const aktifFiltreSayisi = [
    !aktifSirketId && filtreFirmaId !== "tumu",
    filtreKayitTipi !== "tumu",
    filtreAlici.trim() !== "",
    filtreBaslangic !== "",
    filtreBitis !== "",
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Gönderim Geçmişi</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tüm teklif ve fatura e-posta gönderimleri
          </p>
        </div>
        {aktifFiltreSayisi > 0 && (
          <Button variant="outline" size="sm" onClick={sifirlaFiltreler} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Filtreleri Temizle
            <span className="ml-0.5 bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5">{aktifFiltreSayisi}</span>
          </Button>
        )}
      </div>

      {/* ── Filtreler ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtreler</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Firma filtresi — sadece aktif firma seçili değilse göster */}
            {!aktifSirketId && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Firma</Label>
                <Select value={filtreFirmaId} onValueChange={setFiltreFirmaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tüm Firmalar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tumu">Tüm Firmalar</SelectItem>
                    {firmalar.map(f => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.ad}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Kayıt Tipi</Label>
              <Select value={filtreKayitTipi} onValueChange={setFiltreKayitTipi}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tumu">Teklif & Fatura</SelectItem>
                  <SelectItem value="teklif">Yalnız Teklifler</SelectItem>
                  <SelectItem value="fatura">Yalnız Faturalar</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Alıcı E-posta</Label>
              <Input
                placeholder="ornek@firma.com"
                value={filtreAlici}
                onChange={e => setFiltreAlici(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Başlangıç Tarihi</Label>
              <Input
                type="date"
                value={filtreBaslangic}
                onChange={e => setFiltreBaslangic(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Bitiş Tarihi</Label>
              <Input
                type="date"
                value={filtreBitis}
                onChange={e => setFiltreBitis(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Tablo ── */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-0 divide-y">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-32" />
                  <div className="h-5 bg-muted rounded w-16" />
                  <div className="h-4 bg-muted rounded w-24" />
                  <div className="h-4 bg-muted rounded w-40" />
                  <div className="h-4 bg-muted rounded w-28" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <Mail className="h-12 w-12 mb-4 opacity-20" />
              <p className="font-medium">Gönderim kaydı bulunamadı</p>
              <p className="text-sm mt-1">Teklif veya fatura gönderdikçe bu sayfada görünür.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Gönderilme Tarihi</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead>Kayıt No</TableHead>
                  <TableHead>Alıcı E-posta</TableHead>
                  <TableHead>Gönderen</TableHead>
                  {!aktifSirketId && <TableHead>Firma</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatTarih(row.gonderilmeTarihi)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.kayitTipi === "fatura" ? "default" : "outline"} className="text-xs">
                        {row.kayitTipi === "fatura" ? "Fatura" : "Teklif"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.kayitNo ? (
                        <button
                          onClick={() => kayitLink(row)}
                          className="font-mono text-sm font-semibold text-primary hover:underline"
                        >
                          {row.kayitNo}
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                        {row.aliciEposta}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.gonderenAd ?? "—"}
                    </TableCell>
                    {!aktifSirketId && (
                      <TableCell>
                        {row.catiFirmaAd ? (
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Building2 className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[160px]">{row.catiFirmaAd}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {rows.length} gönderim kaydı
        </p>
      )}
    </div>
  );
}
