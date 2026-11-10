import type { ReactNode } from "react";
import { AlertTriangle, Download, Info, RotateCw, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buyukHarf } from "@/lib/rapor-bicim";

export function Panel({ baslik, alt, sag, children, className, testId }: {
  baslik: string; alt?: ReactNode; sag?: ReactNode; children: ReactNode; className?: string; testId?: string;
}) {
  return (
    <section className={cn("border bg-card", className)} data-testid={testId}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-bold leading-tight">{baslik}</h2>
          {alt && <p className="mt-1 text-xs text-muted-foreground">{alt}</p>}
        </div>
        {sag}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function Metrik({ etiket, deger, alt, renk, vurgu, testId }: {
  etiket: string; deger: string; alt?: ReactNode; renk?: string; vurgu?: boolean; testId?: string;
}) {
  return (
    <div className={cn("relative bg-card p-4", vurgu && "bg-primary/10")} data-testid={testId}>
      {renk && <span aria-hidden className="absolute left-0 top-0 h-full w-[3px]" style={{ background: renk }} />}
      <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground">{buyukHarf(etiket)}</p>
      <p className="mt-2 text-lg font-bold tabular-nums leading-none sm:text-xl">{deger}</p>
      {alt && <p className="mt-2 text-xs leading-snug text-muted-foreground">{alt}</p>}
    </div>
  );
}

export function Not({ children, ton = "bilgi" }: { children: ReactNode; ton?: "bilgi" | "uyari" }) {
  const Ikon = ton === "uyari" ? AlertTriangle : Info;
  return (
    <div className={cn("flex gap-2.5 border-l-2 px-3 py-2 text-xs leading-relaxed",
      ton === "uyari" ? "border-[#E98E2E] bg-[#E98E2E]/10" : "border-primary bg-primary/10")}>
      <Ikon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function CsvButon({ onClick, disabled, testId }: { onClick: () => void; disabled?: boolean; testId: string }) {
  return (
    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onClick} disabled={disabled} data-testid={testId}>
      <Download className="h-3.5 w-3.5" aria-hidden /> CSV
    </Button>
  );
}

export function Iskelet() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Rapor yükleniyor">
      <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-card p-4">
            <div className="h-2 w-20 animate-pulse bg-muted" />
            <div className="mt-3 h-5 w-28 animate-pulse bg-muted" />
          </div>
        ))}
      </div>
      <div className="h-72 animate-pulse border bg-muted/50" />
      <div className="h-48 animate-pulse border bg-muted/50" />
    </div>
  );
}

export function HataDurumu({ mesaj, onRetry }: { mesaj: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 border border-destructive/40 bg-destructive/5 px-6 py-14 text-center" data-testid="status-rapor-hata">
      <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
      <div>
        <p className="font-bold">Rapor alınamadı</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{mesaj}</p>
      </div>
      <Button size="sm" onClick={onRetry} className="gap-1.5" data-testid="button-rapor-tekrar">
        <RotateCw className="h-3.5 w-3.5" aria-hidden /> Tekrar dene
      </Button>
    </div>
  );
}

export function Bos({ baslik, aciklama }: { baslik: string; aciklama?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" data-testid="status-rapor-bos">
      <FileSearch className="h-6 w-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-semibold">{baslik}</p>
      {aciklama && <p className="max-w-sm text-xs text-muted-foreground">{aciklama}</p>}
    </div>
  );
}

export function OranCubugu({ deger, renk }: { deger: number; renk: string }) {
  const w = Math.max(0, Math.min(100, deger));
  return (
    <div className="h-1.5 w-full overflow-hidden bg-muted" role="presentation">
      <div className="h-full origin-left transition-transform duration-500" style={{ width: "100%", transform: `scaleX(${w / 100})`, background: renk }} />
    </div>
  );
}
