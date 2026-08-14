import { lazy, Suspense, useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { SirketProvider } from "@/contexts/sirket-context";
import { rotaModulu, modulIzinliMi, ilkIzinliRota, type ModulKey } from "@/lib/moduller";
import { kurOturumInterceptor, setOturumIsleyicileri } from "@/lib/oturum";
import Login from "@/pages/login";

const Dashboard          = lazy(() => import("@/pages/dashboard"));
const Firmalar           = lazy(() => import("@/pages/firmalar"));
const Gemiler            = lazy(() => import("@/pages/gemiler"));
const GemiDetay          = lazy(() => import("@/pages/gemi-detay"));
const BankaHesabiDetay   = lazy(() => import("@/pages/banka-hesabi-detay"));
const Faturalar          = lazy(() => import("@/pages/faturalar"));
const FaturaYeni         = lazy(() => import("@/pages/fatura-yeni"));
const FaturaDetay        = lazy(() => import("@/pages/fatura-detay"));
const FaturaDuzenle      = lazy(() => import("@/pages/fatura-duzenle"));
const Odemeler           = lazy(() => import("@/pages/odemeler"));
const Ekipmanlar         = lazy(() => import("@/pages/ekipmanlar"));
const Raporlar           = lazy(() => import("@/pages/raporlar"));
const Kullanicilar       = lazy(() => import("@/pages/kullanicilar"));
const TekrarlayanFaturalar = lazy(() => import("@/pages/tekrarlayan-faturalar"));
const Teklifler          = lazy(() => import("@/pages/teklifler"));
const Ayarlar            = lazy(() => import("@/pages/ayarlar"));
const GonderiGecmisi     = lazy(() => import("@/pages/gonderi-gecmisi"));
const BagliFirmaDetay    = lazy(() => import("@/pages/bagli-firma-detay"));
const Servis             = lazy(() => import("@/pages/servis"));
const ServisDetay        = lazy(() => import("@/pages/servis-detay"));
const Cariler            = lazy(() => import("@/pages/cariler"));
const CariDetay          = lazy(() => import("@/pages/cari-detay"));
const GrupCariDetay      = lazy(() => import("@/pages/grup-cari-detay"));
const Urunler            = lazy(() => import("@/pages/urunler"));
const NotFound           = lazy(() => import("@/pages/not-found"));
const Tani               = lazy(() => import("@/pages/tani"));
const FirmaSec           = lazy(() => import("@/pages/firma-sec"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

/**
 * /auth/me çağrısıyla kullanıcı bilgisini (modül izinleri dahil) tazeler.
 * Başarılıysa güncel kullanıcıyı, oturum geçersizse (401) null döndürür.
 * Diğer hatalarda (ağ, 5xx) mevcut bilgiye dokunmamak için undefined döndürür.
 */
async function kullaniciyiYenile(): Promise<KullaniciInfo | null | undefined> {
  const token = localStorage.getItem("panel_token");
  if (!token) return null;
  try {
    const resp = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 401) return null;
    if (!resp.ok) return undefined;
    return (await resp.json()) as KullaniciInfo;
  } catch {
    return undefined;
  }
}
export interface KullaniciInfo {
  id: number;
  ad: string;
  email: string;
  rol: string;
  sirketler: Array<{ sirketId: number; rol: string }>;
  /** İzinli modül anahtarları; null/undefined = tüm modüller. */
  modulIzinleri?: string[] | null;
}

function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function AuthGuard({
  kullanici,
  onLogout,
  children,
}: {
  kullanici: KullaniciInfo | null;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [location, navigate] = useLocation();

  const modul: ModulKey | null = rotaModulu(location);
  const modulEngeli = !!kullanici && modul !== null && !modulIzinliMi(kullanici, modul);

  useEffect(() => {
    if (!kullanici) { navigate("/login"); return; }
    if (modulEngeli) navigate(ilkIzinliRota(kullanici), { replace: true });
  }, [kullanici, modulEngeli, location]);

  if (!kullanici || modulEngeli) return null;
  return (
    <SirketProvider>
      <Layout kullanici={kullanici} onLogout={onLogout}>
        {children}
      </Layout>
    </SirketProvider>
  );
}

function AuthGuardSimple({
  kullanici,
  children,
}: {
  kullanici: KullaniciInfo | null;
  children: React.ReactNode;
}) {
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!kullanici) navigate("/login");
  }, [kullanici]);

  if (!kullanici) return null;
  return <SirketProvider>{children}</SirketProvider>;
}

function Router({ kullanici, onLogout }: { kullanici: KullaniciInfo | null; onLogout: () => void }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/login">
          {kullanici ? <Redirect to="/firma-sec" /> : null}
        </Route>
        <Route path="/">
          <Redirect to="/firma-sec" />
        </Route>
        <Route path="/firma-sec">
          <AuthGuardSimple kullanici={kullanici}>
            {kullanici && <FirmaSec kullanici={kullanici} />}
          </AuthGuardSimple>
        </Route>
        <Route path="/dashboard">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <Dashboard />
          </AuthGuard>
        </Route>
        <Route path="/firmalar/bagli/:id">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <BagliFirmaDetay />
          </AuthGuard>
        </Route>
        <Route path="/firmalar">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <Firmalar />
          </AuthGuard>
        </Route>
        <Route path="/gemiler">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <Gemiler />
          </AuthGuard>
        </Route>
        <Route path="/gemiler/:id">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <GemiDetay />
          </AuthGuard>
        </Route>
        <Route path="/banka-hesaplari">
          <Redirect to="/ayarlar" />
        </Route>
        <Route path="/banka-hesaplari/:id">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <BankaHesabiDetay />
          </AuthGuard>
        </Route>
        <Route path="/faturalar/yeni">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <FaturaYeni />
          </AuthGuard>
        </Route>
        <Route path="/faturalar/:id/duzenle">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <FaturaDuzenle />
          </AuthGuard>
        </Route>
        <Route path="/faturalar/:id">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <FaturaDetay />
          </AuthGuard>
        </Route>
        <Route path="/faturalar">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <Faturalar />
          </AuthGuard>
        </Route>
        <Route path="/odemeler">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <Odemeler />
          </AuthGuard>
        </Route>
        <Route path="/cariler/grup/:id">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <GrupCariDetay />
          </AuthGuard>
        </Route>
        <Route path="/cariler/:id">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <CariDetay />
          </AuthGuard>
        </Route>
        <Route path="/cariler">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <Cariler />
          </AuthGuard>
        </Route>
        <Route path="/ekipmanlar">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <Ekipmanlar />
          </AuthGuard>
        </Route>
        <Route path="/servis/:id">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <ServisDetay />
          </AuthGuard>
        </Route>
        <Route path="/servis">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <Servis />
          </AuthGuard>
        </Route>
        <Route path="/tanimlar">
          <Redirect to="/ayarlar" />
        </Route>
        <Route path="/raporlar">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <Raporlar />
          </AuthGuard>
        </Route>
        <Route path="/kullanicilar">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <Kullanicilar kullanici={kullanici} />
          </AuthGuard>
        </Route>
        <Route path="/tekrarlayan-faturalar">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <TekrarlayanFaturalar />
          </AuthGuard>
        </Route>
        <Route path="/teklifler">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <Teklifler />
          </AuthGuard>
        </Route>
        <Route path="/ayarlar">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <Ayarlar />
          </AuthGuard>
        </Route>
        <Route path="/gonderi-gecmisi">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <GonderiGecmisi />
          </AuthGuard>
        </Route>
        <Route path="/urunler">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <Urunler />
          </AuthGuard>
        </Route>
        <Route path="/tani">
          <AuthGuard kullanici={kullanici} onLogout={onLogout}>
            <Tani />
          </AuthGuard>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  const [kullanici, setKullanici] = useState<KullaniciInfo | null>(() => {
    try {
      const saved = localStorage.getItem("panel_kullanici");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Panel açılışında ve API'den dönen 401/403 yanıtlarında /auth/me ile
  // kullanıcı bilgisini tazele — izin değişiklikleri yeniden giriş
  // gerektirmesin, geçersiz oturumda otomatik çıkış yapılsın.
  useEffect(() => {
    if (!kullanici) return;

    let iptal = false;
    let sonYenileme = 0;

    function cikisYap() {
      localStorage.removeItem("panel_token");
      localStorage.removeItem("panel_kullanici");
      setKullanici(null);
      queryClient.clear();
    }

    async function yenile() {
      const simdi = Date.now();
      if (simdi - sonYenileme < 5000) return; // hata fırtınasında tek çağrı
      sonYenileme = simdi;
      const guncel = await kullaniciyiYenile();
      if (iptal || guncel === undefined) return;
      if (guncel === null) {
        cikisYap();
        return;
      }
      localStorage.setItem("panel_kullanici", JSON.stringify(guncel));
      setKullanici((mevcut) =>
        JSON.stringify(mevcut) === JSON.stringify(guncel) ? mevcut : guncel,
      );
    }

    yenile();

    // Tüm API çağrılarını (sorgu, mutasyon, doğrudan fetch) kapsayan
    // merkezi yakalayıcı: 401 → çıkış, 403 → izinleri tazele.
    kurOturumInterceptor();
    setOturumIsleyicileri({
      on401: () => {
        if (!iptal) cikisYap();
      },
      on403: () => {
        void yenile();
      },
    });

    // İzin *eklenmesi* hiçbir 403 üretmez — açık oturumlarda değişikliğin
    // kendiliğinden yansıması için periyodik ve odaklanınca tazeleme.
    const aralik = window.setInterval(() => {
      if (document.visibilityState === "visible") void yenile();
    }, 30_000);
    const odaklaninca = () => void yenile();
    window.addEventListener("focus", odaklaninca);
    document.addEventListener("visibilitychange", odaklaninca);

    return () => {
      iptal = true;
      setOturumIsleyicileri(null);
      window.clearInterval(aralik);
      window.removeEventListener("focus", odaklaninca);
      document.removeEventListener("visibilitychange", odaklaninca);
    };
  }, [kullanici?.id]);

  function handleLogin(token: string, k: object) {
    localStorage.setItem("panel_token", token);
    localStorage.setItem("panel_kullanici", JSON.stringify(k));
    setKullanici(k as KullaniciInfo);
    queryClient.clear();
  }

  function handleLogout() {
    localStorage.removeItem("panel_token");
    localStorage.removeItem("panel_kullanici");
    setKullanici(null);
    queryClient.clear();
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          {!kullanici ? (
            <Login onLogin={handleLogin} />
          ) : (
            <Router kullanici={kullanici} onLogout={handleLogout} />
          )}
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
