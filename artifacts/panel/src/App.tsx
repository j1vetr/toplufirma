import { lazy, Suspense, useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { SirketProvider } from "@/contexts/sirket-context";
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
const Cariler            = lazy(() => import("@/pages/cariler"));
const CariDetay          = lazy(() => import("@/pages/cari-detay"));
const GrupCariDetay      = lazy(() => import("@/pages/grup-cari-detay"));
const NotFound           = lazy(() => import("@/pages/not-found"));
const Tani               = lazy(() => import("@/pages/tani"));
const FirmaSec           = lazy(() => import("@/pages/firma-sec"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

export interface KullaniciInfo {
  id: number;
  ad: string;
  email: string;
  rol: string;
  sirketler: Array<{ sirketId: number; rol: string }>;
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
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!kullanici) navigate("/login");
  }, [kullanici]);

  if (!kullanici) return null;
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
