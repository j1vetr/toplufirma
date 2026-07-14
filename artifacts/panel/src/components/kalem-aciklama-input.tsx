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

export function KalemAciklamaInput({
  value,
  onChange,
  className,
  placeholder,
  "data-testid": dataTestId,
}: Props) {
  return (
    <Input
      className={cn(className)}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      data-testid={dataTestId}
    />
  );
}
