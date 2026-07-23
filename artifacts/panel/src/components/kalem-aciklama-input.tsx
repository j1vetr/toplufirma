import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Package, Search } from "lucide-react";
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

async function fetchSablonlar(catiFirmaId: number | string): Promise<KalemSablon[]> {
  const r = await fetch(`${API_BASE}/api/kalem-sablonlari?catiFirmaId=${catiFirmaId}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!r.ok) return [];
  return r.json();
}

export function KalemAciklamaInput({
  value,
  onChange,
  onSablonSec,
  catiFirmaId,
  className,
  placeholder,
  "data-testid": dataTestId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [arama, setArama] = useState("");

  const { data: sablonlar = [] } = useQuery<KalemSablon[]>({
    queryKey: ["kalem-sablonlari", catiFirmaId],
    queryFn: () => fetchSablonlar(catiFirmaId!),
    enabled: open && catiFirmaId != null,
    staleTime: 60_000,
  });

  const filtered = arama.trim()
    ? sablonlar.filter(s => s.ad.toLowerCase().includes(arama.toLowerCase()))
    : sablonlar;

  function handleSec(s: KalemSablon) {
    onChange(s.ad);
    onSablonSec?.({ birim: s.birim, birimFiyat: s.birimFiyat, kdvOrani: s.kdvOrani });
    setOpen(false);
    setArama("");
  }

  return (
    <div className={cn("relative flex items-center", className)}>
      <Input
        className="h-9 w-full pr-8 text-sm"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={dataTestId}
      />
      {catiFirmaId != null && (
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setArama(""); }}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Ürün seç"
              className="absolute right-1.5 p-0.5 text-muted-foreground hover:text-primary transition-colors"
              tabIndex={-1}
            >
              <Package className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                className="flex h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Ürün ara..."
                value={arama}
                onChange={e => setArama(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-52 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  {sablonlar.length === 0 ? "Henüz ürün tanımlı değil." : "Ürün bulunamadı."}
                </p>
              ) : (
                filtered.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                    onClick={() => handleSec(s)}
                  >
                    <span className="truncate font-medium">{s.ad}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{s.birim}</span>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
