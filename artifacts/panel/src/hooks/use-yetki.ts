import { useSirket } from "@/contexts/sirket-context";

interface JwtPayload {
  id: number;
  email: string;
  ad: string;
  rol: string;
  sirketler: Array<{ sirketId: number; rol: string }>;
}

function parseJwt(token: string): JwtPayload | null {
  try {
    const b64 = token.split(".")[1];
    return JSON.parse(atob(b64.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

export interface YetkiResult {
  canWrite: boolean;
  rol: string | null;
  perFirmaRol: string | null;
}

export function useYetki(): YetkiResult {
  const { aktifSirketId } = useSirket();
  const token = localStorage.getItem("panel_token");
  const payload = token ? parseJwt(token) : null;

  if (!payload) return { canWrite: false, rol: null, perFirmaRol: null };

  if (payload.rol === "yonetici") {
    return { canWrite: true, rol: "yonetici", perFirmaRol: null };
  }

  if (payload.rol === "salt_okunur") {
    return { canWrite: false, rol: "salt_okunur", perFirmaRol: "salt_okunur" };
  }

  if (aktifSirketId !== null && payload.sirketler?.length) {
    const firma = payload.sirketler.find((s) => s.sirketId === aktifSirketId);
    if (firma?.rol === "salt_okunur") {
      return { canWrite: false, rol: payload.rol, perFirmaRol: "salt_okunur" };
    }
  }

  return { canWrite: true, rol: payload.rol, perFirmaRol: null };
}
