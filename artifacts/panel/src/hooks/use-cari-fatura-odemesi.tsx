import { useState } from "react";
import type { Fatura } from "@workspace/api-client-react";
import OdemeModal from "@/components/odeme-modal";

/** Every cari entry point uses the very same invoice payment dialog. */
export function useCariFaturaOdemesi() {
  const [fatura, setFatura] = useState<Fatura | null>(null);
  return {
    ac: setFatura,
    modal: <OdemeModal open={!!fatura} onOpenChange={open => { if (!open) setFatura(null); }} fatura={fatura} />,
  };
}
