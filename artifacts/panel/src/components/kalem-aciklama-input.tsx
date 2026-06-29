import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const eslesenler = value.length >= 2
    ? sablonlar.filter(s => s.ad.toLowerCase().includes(value.toLowerCase()))
    : sablonlar;

  function updatePos() {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom, left: rect.left, width: rect.width });
  }

  function sec(s: KalemSablon) {
    onChange(s.ad);
    onSablonSec?.({ birim: s.birim, birimFiyat: s.birimFiyat, kdvOrani: s.kdvOrani });
    setAcik(false);
  }

  useEffect(() => {
    function handleMousedown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setAcik(false);
      }
    }
    function handleScrollOrResize() {
      if (acik) updatePos();
    }
    document.addEventListener("mousedown", handleMousedown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", handleMousedown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [acik]);

  const showDropdown = acik && eslesenler.length > 0 && pos != null;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <Input
        ref={inputRef}
        value={value}
        onChange={e => { onChange(e.target.value); setAcik(true); updatePos(); }}
        onFocus={() => { setAcik(true); updatePos(); }}
        placeholder={placeholder}
        {...rest}
      />
      {showDropdown && createPortal(
        <div
          style={{
            position: "fixed",
            top: pos.top + 2,
            left: pos.left,
            width: pos.width,
            zIndex: 9999,
          }}
          className="border bg-background shadow-lg max-h-52 overflow-y-auto"
        >
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
        </div>,
        document.body
      )}
    </div>
  );
}
