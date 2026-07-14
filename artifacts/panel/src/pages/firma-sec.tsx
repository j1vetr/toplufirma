import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useListFirmalar, getListFirmalarQueryKey } from "@workspace/api-client-react";
import { useSirket } from "@/contexts/sirket-context";
import toovBeyaz from "@assets/toov__beyaz_logo_1782430202251.png";
import { Building2, CheckCircle2 } from "lucide-react";
import type { KullaniciInfo } from "@/App";

const HATIRLA_KEY = "panel_hatirla";

interface Props {
  kullanici: KullaniciInfo;
}

export default function FirmaSec({ kullanici }: Props) {
  const [, navigate] = useLocation();
  const { aktifSirketId, setAktifSirketId } = useSirket();
  const [hatirla, setHatirla] = useState(() => localStorage.getItem(HATIRLA_KEY) === "1");
  const [otomatik, setOtomatik] = useState(false);

  const { data: firmalar = [], isLoading } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );

  useEffect(() => {
    if (isLoading || firmalar.length === 0) return;
    const hatirlaFlag = localStorage.getItem(HATIRLA_KEY) === "1";
    const storedId = localStorage.getItem("aktifSirketId");
    if (hatirlaFlag && storedId) {
      const firma = firmalar.find(f => f.id === Number(storedId));
      if (firma) {
        setOtomatik(true);
        setAktifSirketId(firma.id);
        navigate("/dashboard");
      }
    }
  }, [isLoading, firmalar]);

  function sesFirma(id: number) {
    setAktifSirketId(id);
    if (hatirla) {
      localStorage.setItem(HATIRLA_KEY, "1");
    } else {
      localStorage.removeItem(HATIRLA_KEY);
    }
    navigate("/dashboard");
  }

  function toggleHatirla(checked: boolean) {
    setHatirla(checked);
    if (checked) {
      localStorage.setItem(HATIRLA_KEY, "1");
    } else {
      localStorage.removeItem(HATIRLA_KEY);
    }
  }

  const initials = kullanici.ad
    ? kullanici.ad.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  if (otomatik || isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <img src={toovBeyaz} alt="TOOV" className="w-40 mx-auto" />
          <p className="text-white/50 text-sm animate-pulse">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-3xl space-y-10">

        {/* Logo + hoşgeldin */}
        <div className="text-center space-y-4">
          <img src={toovBeyaz} alt="TOOV" className="w-44 mx-auto" />
          <div className="flex items-center justify-center gap-2.5">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-xs font-black text-primary-foreground">
              {initials}
            </div>
            <div className="text-left">
              <p className="text-white font-semibold text-sm">{kullanici.ad}</p>
              <p className="text-white/40 text-xs">{kullanici.email}</p>
            </div>
          </div>
          <div>
            <h1 className="text-white text-2xl font-bold">Firma Seçin</h1>
            <p className="text-white/40 text-sm mt-1">Çalışmak istediğiniz firmaya tıklayın</p>
          </div>
        </div>

        {/* Firma kartları */}
        {firmalar.length === 0 ? (
          <div className="text-center text-white/30 py-12">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Henüz erişilebilir firma yok</p>
          </div>
        ) : (
          <div className={`grid gap-4 ${
            firmalar.length === 1 ? "grid-cols-1 max-w-xs mx-auto" :
            firmalar.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
            "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
          }`}>
            {firmalar.map(f => {
              const etiket = (f as unknown as Record<string, unknown>).etiket as string | null;
              const logo = (f as unknown as Record<string, unknown>).logo as string | null;
              const isAktif = aktifSirketId === f.id;

              return (
                <button
                  key={f.id}
                  onClick={() => sesFirma(f.id)}
                  className={`group relative flex flex-col items-center gap-3 p-6 border-2 rounded-none transition-all text-center bg-white/5 hover:bg-white/10 ${
                    isAktif
                      ? "border-primary"
                      : "border-white/10 hover:border-primary/60"
                  }`}
                >
                  {isAktif && (
                    <CheckCircle2 className="absolute top-3 right-3 h-4 w-4 text-primary" />
                  )}
                  {logo ? (
                    <div className="w-16 h-16 bg-white rounded flex items-center justify-center overflow-hidden shrink-0">
                      <img src={logo} alt={f.ad} className="w-full h-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 bg-white/10 rounded flex items-center justify-center shrink-0">
                      <span className="text-2xl font-black text-white/60">
                        {f.ad.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="space-y-1 min-w-0 w-full">
                    <p className="text-white font-semibold text-sm leading-tight truncate">{f.ad}</p>
                    {etiket && (
                      <span className="inline-block text-[10px] font-bold bg-[#ffed00] text-black px-2 py-0.5 leading-none">
                        {etiket}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Beni Hatırla */}
        <div className="flex items-center justify-center gap-2.5">
          <label className="flex items-center gap-2.5 cursor-pointer group select-none">
            <div
              onClick={() => toggleHatirla(!hatirla)}
              className={`w-4.5 h-4.5 border-2 rounded-none flex items-center justify-center transition-colors ${
                hatirla ? "bg-primary border-primary" : "border-white/30 group-hover:border-white/60"
              }`}
              style={{ width: "18px", height: "18px" }}
            >
              {hatirla && (
                <svg viewBox="0 0 12 12" className="w-3 h-3 text-black fill-current">
                  <path d="M1 6l3.5 3.5L11 2" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <input
              type="checkbox"
              checked={hatirla}
              onChange={e => toggleHatirla(e.target.checked)}
              className="sr-only"
            />
            <span className="text-white/50 text-sm group-hover:text-white/70 transition-colors">
              Beni hatırla — bir sonraki girişte otomatik aç
            </span>
          </label>
        </div>

      </div>
    </div>
  );
}
