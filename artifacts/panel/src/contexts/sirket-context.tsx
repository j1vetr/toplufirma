import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useListSirketler, getListSirketlerQueryKey } from "@workspace/api-client-react";

interface SirketContextType {
  aktifSirketId: number | null;
  setAktifSirketId: (id: number | null) => void;
  aktifSirketAd: string;
}

const SirketContext = createContext<SirketContextType>({
  aktifSirketId: null,
  setAktifSirketId: () => {},
  aktifSirketAd: "Tüm Şirketler",
});

export function SirketProvider({ children }: { children: ReactNode }) {
  const [aktifSirketId, setAktifSirketIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem("aktifSirketId");
    return stored ? Number(stored) : null;
  });

  const { data: sirketler = [] } = useListSirketler({
    query: { queryKey: getListSirketlerQueryKey() },
  });

  const aktifSirket = sirketler.find(s => s.id === aktifSirketId);
  const aktifSirketAd = aktifSirket?.ad ?? "Tüm Şirketler";

  function setAktifSirketId(id: number | null) {
    setAktifSirketIdState(id);
    if (id === null) {
      localStorage.removeItem("aktifSirketId");
    } else {
      localStorage.setItem("aktifSirketId", String(id));
    }
  }

  useEffect(() => {
    if (sirketler.length > 0 && aktifSirketId === null) {
      setAktifSirketId(sirketler[0].id);
    }
  }, [sirketler]);

  return (
    <SirketContext.Provider value={{ aktifSirketId, setAktifSirketId, aktifSirketAd }}>
      {children}
    </SirketContext.Provider>
  );
}

export function useSirket() {
  return useContext(SirketContext);
}
