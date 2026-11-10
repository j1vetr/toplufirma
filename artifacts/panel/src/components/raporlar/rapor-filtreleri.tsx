import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FirmaSecici, type FirmaSecenek } from "@/components/firma-secici";
import { AY_ADLARI } from "@/lib/rapor-bicim";

interface Props {
  firmalar: FirmaSecenek[];
  firmaId: number | null;
  onFirma: (id: number | null) => void;
  yil: number;
  yillar: number[];
  onYil: (y: number) => void;
  ay: number | null;
  onAy: (a: number | null) => void;
  paraBirimi: string;
  paraBirimleri: string[];
  onParaBirimi: (p: string) => void;
}

export function RaporFiltreleri(p: Props) {
  const yillar = Array.from(new Set([...p.yillar, p.yil])).sort((a, b) => b - a);
  const pbler = Array.from(new Set([...p.paraBirimleri, p.paraBirimi])).sort();
  return (
    <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end" role="group" aria-label="Rapor filtreleri">
      <div className="col-span-2 space-y-1">
        <Label className="text-[11px] text-muted-foreground">Çatı firma</Label>
        <FirmaSecici
          firmalar={p.firmalar}
          value={p.firmaId ? String(p.firmaId) : ""}
          onChange={(id) => p.onFirma(id ? Number(id) : null)}
          placeholder="Tüm firmalar"
          bosSecim
          bosSecimEtiketi="Tüm firmalar"
          className="w-full sm:w-56"
          testId="select-rapor-firma"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="rapor-yil" className="text-[11px] text-muted-foreground">Yıl</Label>
        <Select value={String(p.yil)} onValueChange={(v) => p.onYil(Number(v))}>
          <SelectTrigger id="rapor-yil" className="w-full sm:w-24" data-testid="select-rapor-yil"><SelectValue /></SelectTrigger>
          <SelectContent>{yillar.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="rapor-ay" className="text-[11px] text-muted-foreground">Ay</Label>
        <Select value={p.ay ? String(p.ay) : "tum"} onValueChange={(v) => p.onAy(v === "tum" ? null : Number(v))}>
          <SelectTrigger id="rapor-ay" className="w-full sm:w-32" data-testid="select-rapor-ay"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tum">Tüm yıl</SelectItem>
            {AY_ADLARI.map((a, i) => <SelectItem key={a} value={String(i + 1)}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2 space-y-1 sm:col-span-1">
        <Label className="text-[11px] text-muted-foreground" id="rapor-pb-etiket">Para birimi</Label>
        <div className="flex h-9 border" role="radiogroup" aria-labelledby="rapor-pb-etiket">
          {pbler.map((pb) => (
            <button
              key={pb}
              type="button"
              role="radio"
              aria-checked={pb === p.paraBirimi}
              onClick={() => p.onParaBirimi(pb)}
              className={`min-w-12 flex-1 px-3 font-mono text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${pb === p.paraBirimi ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
              data-testid={`button-pb-${pb}`}
            >
              {pb}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
