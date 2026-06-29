import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface KalemSablon {
  id: number;
  catiFirmaId: number;
  ad: string;
  birim: string;
  birimFiyat: number | null;
  kdvOrani: number | null;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSablonSec?: (s: { birim: string; birimFiyat: number | null; kdvOrani: number | null }) => void;
  catiFirmaId?: number | string;
  className?: string;
  placeholder?: string;
  "data-testid"?: string;
}

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getToken() {
  return localStorage.getItem("panel_token") ?? "";
}

export function KalemAciklamaInput({ value, onChange, onSablonSec, catiFirmaId, className, placeholder, ...rest }: Props) {
  const [acik, setAcik] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: sablonlar = [] } = useQuery<KalemSablon[]>({
    queryKey: ["kalem-sablonlari", catiFirmaId],
    queryFn: async () => {
      if (!catiFirmaId) return [];
      const r = await fetch(`${API_BASE}/api/kalem-sablonlari?catiFirmaId=${catiFirmaId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!catiFirmaId,
    staleTime: 60_000,
  });

  const eslesenler = value.length >= 1
    ? sablonlar.filter(s => s.ad.toLowerCase().includes(value.toLowerCase()))
    : sablonlar;

  function sec(s: KalemSablon) {
    onChange(s.ad);
    onSablonSec?.({ birim: s.birim, birimFiyat: s.birimFiyat, kdvOrani: s.kdvOrani });
    setAcik(false);
  }

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAcik(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const showDropdown = acik && eslesenler.length > 0;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <Input
        value={value}
        onChange={e => { onChange(e.target.value); setAcik(true); }}
        onFocus={() => setAcik(true)}
        placeholder={placeholder}
        {...rest}
      />
      {showDropdown && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 border bg-background shadow-md max-h-52 overflow-y-auto">
          {eslesenler.slice(0, 12).map(s => (
            <button
              key={s.id}
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center justify-between gap-2 border-b last:border-b-0"
              onMouseDown={e => { e.preventDefault(); sec(s); }}
            >
              <span className="truncate font-medium">{s.ad}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {s.birim}
                {s.birimFiyat != null ? ` · ${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(s.birimFiyat)}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
