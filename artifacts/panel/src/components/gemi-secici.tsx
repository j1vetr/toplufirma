import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { ChevronDown, X, Ship, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GemiSecenek {
  id: number;
  ad: string;
  imoNumarasi?: string | null;
  firmaId: number;
  firmaAd?: string | null;
  catiFirmaId?: number | null;
  grupFirmaId?: number | null;
}

interface GemiSeciciProps {
  gemiler: GemiSecenek[];
  value: string;
  onChange: (gemiId: string, gemi: GemiSecenek | null) => void;
  disabled?: boolean;
  placeholder?: string;
  catiFirmaFilter?: number | null;
  className?: string;
}

export function GemiSecici({
  gemiler,
  value,
  onChange,
  disabled,
  placeholder = "Gemi seçin",
  catiFirmaFilter,
  className,
}: GemiSeciciProps) {
  const [open, setOpen] = useState(false);
  const [ara, setAra] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const seciliGemi = gemiler.find(g => String(g.id) === value) ?? null;

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

  const filtreli = (() => {
    let g =
      catiFirmaFilter != null
        ? gemiler.filter(x => x.catiFirmaId === catiFirmaFilter)
        : gemiler;
    if (ara) {
      const low = ara.toLowerCase();
      g = g.filter(
        x =>
          x.ad.toLowerCase().includes(low) ||
          (x.imoNumarasi ?? "").toLowerCase().includes(low) ||
          (x.firmaAd ?? "").toLowerCase().includes(low),
      );
    }
    return g;
  })();

  const gruplar = new Map<string, GemiSecenek[]>();
  for (const g of filtreli) {
    const key = g.firmaAd ?? "Diğer";
    if (!gruplar.has(key)) gruplar.set(key, []);
    gruplar.get(key)!.push(g);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen(o => !o);
        }}
        className={cn(
          "flex h-9 w-full items-center justify-between border border-input bg-transparent px-3 py-2 text-sm shadow-sm",
          "focus:outline-none focus:ring-1 focus:ring-ring hover:bg-accent/20 transition-colors",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        {seciliGemi ? (
          <span className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
            <Ship className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">
              {seciliGemi.ad}
              {seciliGemi.imoNumarasi ? ` (${seciliGemi.imoNumarasi})` : ""}
            </span>
            {seciliGemi.firmaAd && (
              <span className="text-xs text-muted-foreground shrink-0 truncate">
                · {seciliGemi.firmaAd}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <span className="flex items-center gap-1 ml-2 shrink-0">
          {seciliGemi && !disabled && (
            <span
              role="button"
              aria-label="Seçimi temizle"
              onClick={e => {
                e.stopPropagation();
                onChange("", null);
              }}
              onMouseDown={e => e.preventDefault()}
              className="hover:text-foreground text-muted-foreground cursor-pointer p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[280px] bg-popover border border-border shadow-md">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                autoFocus
                className="h-8 pl-8 text-sm"
                placeholder="Gemi adı, IMO veya firma ara…"
                value={ara}
                onChange={e => setAra(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {gruplar.size === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {ara ? "Eşleşen gemi bulunamadı" : "Gemi bulunamadı"}
              </div>
            ) : (
              Array.from(gruplar.entries()).map(([firmaAd, gems]) => (
                <div key={firmaAd}>
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground bg-muted/40 uppercase tracking-wide">
                    {firmaAd}
                  </div>
                  {gems.map(g => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        onChange(String(g.id), g);
                        setOpen(false);
                        setAra("");
                      }}
                      className={cn(
                        "w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-accent cursor-pointer",
                        String(g.id) === value && "bg-accent/60 font-medium",
                      )}
                    >
                      <Ship className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>
                        {g.ad}
                        {g.imoNumarasi ? ` (${g.imoNumarasi})` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
