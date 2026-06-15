import { createContext, useContext, useState, type ReactNode } from "react";
import { useListFirmalar, getListFirmalarQueryKey } from "@workspace/api-client-react";

interface SirketContextType {
  aktifSirketId: number | null;
  setAktifSirketId: (id: number | null) => void;
  aktifSirketAd: string;
}

const SirketContext = createContext<SirketContextType>({
  aktifSirketId: null,
  setAktifSirketId: () => {},
  aktifSirketAd: "Tüm Firmalar",
});

export function SirketProvider({ children }: { children: ReactNode }) {
  const [aktifSirketId, setAktifSirketIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem("aktifSirketId");
    return stored ? Number(stored) : null;
  });

  const { data: firmalar = [] } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );

  const aktifFirma = firmalar.find(f => f.id === aktifSirketId);
  const aktifSirketAd = aktifFirma?.ad ?? "Tüm Firmalar";

  function setAktifSirketId(id: number | null) {
    setAktifSirketIdState(id);
    if (id === null) {
      localStorage.removeItem("aktifSirketId");
    } else {
      localStorage.setItem("aktifSirketId", String(id));
    }
  }

  return (
    <SirketContext.Provider value={{ aktifSirketId, setAktifSirketId, aktifSirketAd }}>
      {children}
    </SirketContext.Provider>
  );
}

export function useSirket() {
  return useContext(SirketContext);
}
