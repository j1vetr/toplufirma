import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { ChevronDown, X, Building2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FirmaSecenek {
  id: number;
  ad: string;
  etiket?: string | null;
  vergiNo?: string | null;
}

interface FirmaSeciciProps {
  firmalar: FirmaSecenek[];
  value: string;
  onChange: (firmaId: string, firma: FirmaSecenek | null) => void;
  disabled?: boolean;
  placeholder?: string;
  /** "Seçilmedi" satırı göster (opsiyonel alanlar için) */
  bosSecim?: boolean;
  bosSecimEtiketi?: string;
  className?: string;
  testId?: string;
}

export function FirmaSecici({
  firmalar,
  value,
  onChange,
  disabled,
  placeholder = "Firma seçin",
  bosSecim = false,
  bosSecimEtiketi = "Seçilmedi",
  className,
  testId,
}: FirmaSeciciProps) {
  const [open, setOpen] = useState(false);
  const [ara, setAra] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const secili = firmalar.find(f => String(f.id) === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setAra("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const low = ara.trim().toLowerCase();
  const filtreli = low
    ? firmalar.filter(
        f =>
          f.ad.toLowerCase().includes(low) ||
          (f.vergiNo ?? "").toLowerCase().includes(low) ||
          (f.etiket ?? "").toLowerCase().includes(low),
      )
    : firmalar;

  function sec(firma: FirmaSecenek | null) {
    onChange(firma ? String(firma.id) : "", firma);
    setOpen(false);
    setAra("");
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        data-testid={testId}
        className={cn(
          "flex h-9 w-full items-center justify-between border bg-background px-3 text-sm",
          "focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {secili ? (
          <span className="flex items-center gap-2 truncate">
            <span className="truncate">{secili.ad}</span>
            {secili.etiket && (
              <span className="text-[10px] bg-zinc-800 text-white px-1.5 py-0.5 font-bold leading-none shrink-0">
                {secili.etiket}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground truncate">{placeholder}</span>
        )}
        <span className="flex items-center gap-1 shrink-0 ml-2">
          {secili && !disabled && (
            <X
              className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
              onClick={e => {
                e.stopPropagation();
                sec(null);
              }}
            />
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 border bg-popover shadow-lg">
          <div className="relative border-b">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={ara}
              onChange={e => setAra(e.target.value)}
              placeholder="Firma ara..."
              className="h-9 border-0 pl-8 rounded-none focus-visible:ring-0"
              data-testid={testId ? `${testId}-ara` : undefined}
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {bosSecim && !low && (
              <button
                type="button"
                onClick={() => sec(null)}
                className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent transition-colors"
              >
                {bosSecimEtiketi}
              </button>
            )}
            {filtreli.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4 opacity-50" /> Firma bulunamadı.
              </p>
            ) : (
              filtreli.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => sec(f)}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors flex items-center gap-2",
                    String(f.id) === value && "bg-accent/60 font-medium",
                  )}
                >
                  <span className="truncate">{f.ad}</span>
                  {f.etiket && (
                    <span className="text-[10px] bg-zinc-800 text-white px-1.5 py-0.5 font-bold leading-none shrink-0">
                      {f.etiket}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
